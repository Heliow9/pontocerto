import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Company, Employee, Schedule, WorkLocation } from "../types";
import { Modal } from "../components/Modal";
import { Badge, Empty, PageHeader } from "../components/Ui";
import { apiMessage, brDate } from "../utils";

const blank = {
  companyId: 0,
  name: "",
  cpf: "",
  pis: "",
  registrationNumber: "",
  admissionDate: "",
  ctps: "",
  positionName: "",
  departmentName: "",
  workScheduleId: null as number | null,
  workLocationIds: [] as number[],
  biometricExempt: false,
  active: true,
  accessEmail: "",
  accessPassword: ""
};

export function EmployeesPage({ notify }: { notify: (m: string, t?: "ok" | "error") => void }) {
  const [items, setItems] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [locations, setLocations] = useState<WorkLocation[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Employee | null | undefined>(undefined);
  const [form, setForm] = useState<any>(blank);

  const load = () =>
    Promise.all([
      api.get("/employees", { params: { search } }),
      api.get("/companies"),
      api.get("/schedules"),
      api.get("/locations")
    ]).then(([a, b, c, d]) => {
      setItems(a.data);
      setCompanies(b.data);
      setSchedules(c.data);
      setLocations(d.data);
    });

  useEffect(() => {
    load();
  }, []);

  const filteredSchedules = useMemo(
    () => schedules.filter((s) => Number(s.company_id) === Number(form.companyId) && s.active),
    [schedules, form.companyId]
  );
  const filteredLocations = useMemo(
    () => locations.filter((l) => Number(l.company_id) === Number(form.companyId) && l.active),
    [locations, form.companyId]
  );

  async function open(item?: Employee) {
    setEditing(item || null);
    if (!item) {
      setForm({ ...blank, companyId: companies.find((c) => c.active)?.id || 0, workLocationIds: [] });
      return;
    }
    let assigned: number[] = [];
    try {
      const { data } = await api.get(`/locations/employee/${item.id}`);
      assigned = data.map((x: any) => Number(x.id));
    } catch {
      assigned = [];
    }
    setForm({
      companyId: item.company_id,
      name: item.name,
      cpf: item.cpf || "",
      pis: item.pis || "",
      registrationNumber: item.registration_number || "",
      admissionDate: item.admission_date?.slice(0, 10) || "",
      ctps: item.ctps || "",
      positionName: item.position_name || "",
      departmentName: item.department_name || "",
      workScheduleId: item.work_schedule_id || null,
      workLocationIds: assigned,
      biometricExempt: Boolean(item.biometric_exempt),
      active: Boolean(item.active),
      accessEmail: item.access_email || "",
      accessPassword: ""
    });
  }

  function toggleLocation(id: number) {
    const selected: number[] = form.workLocationIds || [];
    setForm({
      ...form,
      workLocationIds: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        companyId: Number(form.companyId),
        workScheduleId: form.workScheduleId ? Number(form.workScheduleId) : null,
        workLocationIds: (form.workLocationIds || []).map(Number)
      };
      if (editing) await api.put(`/employees/${editing.id}`, payload);
      else await api.post("/employees", payload);
      notify("Funcionário salvo com sucesso.");
      setEditing(undefined);
      load();
    } catch (err) {
      notify(apiMessage(err), "error");
    }
  }

  async function deactivate(item: Employee) {
    if (!confirm(`Inativar ${item.name}?`)) return;
    try {
      await api.delete(`/employees/${item.id}`);
      notify("Funcionário inativado.");
      load();
    } catch (err) {
      notify(apiMessage(err), "error");
    }
  }


  async function revokeDevices(item: Employee) {
    if (!confirm(`Revogar os dispositivos de ${item.name}? O funcionário precisará vincular novamente o celular no app.`)) return;
    try { const { data } = await api.delete(`/devices/employee/${item.id}`); notify(`${data.revoked || 0} dispositivo(s) revogado(s).`); load(); }
    catch (err) { notify(apiMessage(err), "error"); }
  }


  async function toggleBiometric(item: Employee) {
    const disabled = !Boolean(item.biometric_exempt);
    const action = disabled ? "desabilitar" : "habilitar";
    const warning = disabled
      ? `Desabilitar a biometria para ${item.name}? O GPS, o raio e a jornada continuam obrigatórios.`
      : `Habilitar novamente a biometria para ${item.name}?`;

    if (!confirm(`${warning}\n\nOs aparelhos ativos serão revogados e o funcionário precisará vincular o celular novamente.`)) return;

    try {
      const { data } = await api.patch(`/employees/${item.id}/biometric`, { disabled });
      notify(
        `${data.message}${data.revokedDevices ? ` ${data.revokedDevices} aparelho(s) revogado(s).` : ""}`
      );
      load();
    } catch (err) {
      notify(apiMessage(err), "error");
    }
  }

  return (
    <>
      <PageHeader
        title="Funcionários"
        subtitle="Cadastros, jornadas, locais permitidos e acesso ao aplicativo"
        action={<button className="primary" onClick={() => open()}>+ Novo funcionário</button>}
      />
      <div className="toolbar">
        <input
          className="search"
          placeholder="Buscar por nome, CPF ou matrícula..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <button className="ghost" onClick={load}>Buscar</button>
      </div>

      <div className="panel">
        {items.length === 0 ? (
          <Empty>Nenhum funcionário encontrado.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nome</th><th>Empresa</th><th>Matrícula</th><th>Cargo</th><th>Jornada / Local</th><th>Admissão</th><th>Biometria</th><th>Dispositivo</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td><strong>{i.name}</strong><div className="muted">{i.cpf || "CPF não informado"}</div></td>
                    <td>{i.company_name}</td>
                    <td>{i.registration_number || "-"}</td>
                    <td>{i.position_name || "-"}</td>
                    <td>{i.schedule_name || <span className="warning-text">Sem jornada</span>}<div className="muted">{i.location_names || "Sem local vinculado"}</div></td>
                    <td>{brDate(i.admission_date)}</td>
                    <td><Badge tone={i.biometric_exempt ? "neutral" : "success"}>{i.biometric_exempt ? "Dispensada" : "Obrigatória"}</Badge></td>
                    <td><Badge tone={Number(i.device_count || 0) > 0 ? "success" : "warning"}>{Number(i.device_count || 0) > 0 ? `${i.device_count} vinculado(s)` : "Pendente"}</Badge></td>
                    <td><Badge tone={i.active ? "success" : "neutral"}>{i.active ? "Ativo" : "Inativo"}</Badge></td>
                    <td className="actions">
                      <button className="ghost" onClick={() => open(i)}>Editar</button>
                      <button className="ghost" onClick={() => toggleBiometric(i)}>
                        {i.biometric_exempt ? "Habilitar biometria" : "Desabilitar biometria"}
                      </button>
                      {Number(i.device_count || 0) > 0 && <button className="ghost" onClick={() => revokeDevices(i)}>Revogar aparelho</button>}
                      <button className="danger-link" onClick={() => deactivate(i)}>Inativar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing !== undefined && (
        <Modal title={editing ? "Editar funcionário" : "Novo funcionário"} onClose={() => setEditing(undefined)} wide>
          <form className="form-grid" onSubmit={save}>
            <div className="section-label span-2">Dados pessoais</div>
            <label className="span-2">Nome completo<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>CPF<input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} /></label>
            <label>PIS<input value={form.pis} onChange={(e) => setForm({ ...form, pis: e.target.value })} /></label>
            <label>Matrícula<input value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} /></label>
            <label>CTPS<input value={form.ctps} onChange={(e) => setForm({ ...form, ctps: e.target.value })} /></label>
            <label>Data de admissão<input type="date" value={form.admissionDate} onChange={(e) => setForm({ ...form, admissionDate: e.target.value })} /></label>
            <div />

            <div className="section-label span-2">Vínculo profissional</div>
            <label>Empresa
              <select required value={form.companyId} onChange={(e) => setForm({ ...form, companyId: Number(e.target.value), workScheduleId: null, workLocationIds: [] })}>
                <option value={0}>Selecione</option>
                {companies.filter((c) => c.active).map((c) => <option value={c.id} key={c.id}>{c.trade_name || c.legal_name}</option>)}
              </select>
            </label>
            <label>Jornada
              <select value={form.workScheduleId || ""} onChange={(e) => setForm({ ...form, workScheduleId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Sem jornada</option>
                {filteredSchedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>Cargo<input value={form.positionName} onChange={(e) => setForm({ ...form, positionName: e.target.value })} /></label>
            <label>Setor<input value={form.departmentName} onChange={(e) => setForm({ ...form, departmentName: e.target.value })} /></label>

            <div className="section-label span-2">Locais autorizados</div>
            <div className="location-checks span-2">
              {filteredLocations.length === 0 ? (
                <span className="muted">Nenhum local ativo cadastrado para esta empresa.</span>
              ) : filteredLocations.map((l) => (
                <label className="location-check" key={l.id}>
                  <input type="checkbox" checked={(form.workLocationIds || []).includes(l.id)} onChange={() => toggleLocation(l.id)} />
                  <span><b>{l.name}</b><small>{l.geo_mode === "DISABLED" ? "GPS desativado" : `${l.geo_mode} · raio ${l.radius_meters} m`}</small></span>
                </label>
              ))}
            </div>

            <div className="section-label span-2">Segurança do registro de ponto</div>
            <label className="checkbox-row span-2">
              <input
                type="checkbox"
                checked={Boolean(form.biometricExempt)}
                onChange={(e) => setForm({ ...form, biometricExempt: e.target.checked })}
              />
              Desabilitar biometria para este funcionário
            </label>
            <div className="muted span-2">
              Quando marcado, o funcionário continua sujeito ao GPS, raio permitido, jornada e horário oficial do servidor.
              Se esta opção for alterada, os aparelhos vinculados serão revogados para aplicar a nova política com segurança.
            </div>

            <div className="section-label span-2">Acesso ao aplicativo</div>
            <label>E-mail de acesso<input type="email" value={form.accessEmail} onChange={(e) => setForm({ ...form, accessEmail: e.target.value })} /></label>
            <label>{editing ? "Nova senha (opcional)" : "Senha inicial"}<input type="password" value={form.accessPassword} onChange={(e) => setForm({ ...form, accessPassword: e.target.value })} placeholder={editing ? "Deixe vazio para manter" : "mínimo 6 caracteres"} /></label>
            <label className="checkbox-row span-2"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Funcionário ativo</label>
            <div className="form-actions span-2"><button type="button" className="ghost" onClick={() => setEditing(undefined)}>Cancelar</button><button className="primary">Salvar funcionário</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
