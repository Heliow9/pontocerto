import { EmployeeImport } from "../components/EmployeeImport";
import { GroupsManager, type EmployeeGroup } from "../components/GroupsManager";
import { useAccess } from "../components/Access";
import { LoadState, useLoadState } from "../components/LoadState";
import { AsyncForm } from "../components/AsyncForm";
import { DataTable } from "../components/DataTable";
import { useEffect, useMemo, useRef, useState } from "react";
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
  groupId: null as number | null,
  workScheduleId: null as number | null,
  workLocationIds: [] as number[],
  biometricExempt: false,
  active: true,
  accessEmail: "",
  accessPassword: "",
};

export function EmployeesPage({
  notify,
}: {
  notify: (m: string, t?: "ok" | "error") => void;
}) {
  const { canManage, canAdjust, role } = useAccess();
  const editable = canManage;
  const [groups, setGroups] = useState<EmployeeGroup[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [manageGroups, setManageGroups] = useState(false);
  const [groupFilter, setGroupFilter] = useState("");
  const [items, setItems] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [locations, setLocations] = useState<WorkLocation[]>([]);
  const editRequest = useRef(0);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [needs, setNeeds] = useState(
    new URLSearchParams(location.hash.split("?")[1]).get("needs") || "",
  );
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Employee | null | undefined>(
    undefined,
  );
  const [form, setForm] = useState<any>(blank);

  const loadState = useLoadState();
  const fetchData = () =>
    Promise.all([
      api.get("/employees", { params: { includeInactive: "1" } }),
      api.get("/companies"),
      api.get("/schedules"),
      api.get("/locations"),
      api.get("/groups"),
    ]).then(([a, b, c, d, g]) => {
      setItems(a.data);
      setCompanies(b.data);
      setSchedules(c.data);
      setLocations(d.data);
      setGroups(g.data);
    });

  const load = () => loadState.run(fetchData);
  useEffect(() => {
    load();
  }, []);

  const filteredSchedules = useMemo(
    () =>
      schedules.filter(
        (s) => Number(s.company_id) === Number(form.companyId) && s.active,
      ),
    [schedules, form.companyId],
  );
  const filteredLocations = useMemo(
    () =>
      locations.filter(
        (l) => Number(l.company_id) === Number(form.companyId) && l.active,
      ),
    [locations, form.companyId],
  );

  async function open(item?: Employee) {
    const request = ++editRequest.current;
    setEditing(item || null);
    setFormError("");
    setFormLoading(Boolean(item));
    if (!item) {
      setForm({
        ...blank,
        companyId: companies.find((c) => c.active)?.id || 0,
        workLocationIds: [],
      });
      return;
    }
    let assigned: number[] = [];
    try {
      const { data } = await api.get(`/locations/employee/${item.id}`);
      if (request !== editRequest.current) return;
      assigned = data.map((x: any) => Number(x.id));
    } catch {
      if (request !== editRequest.current) return;
      setFormError(
        "Não foi possível carregar os locais autorizados. Feche e tente editar novamente; nenhum vínculo foi alterado.",
      );
      setFormLoading(false);
      return;
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
      groupId: item.group_id || null,
      workScheduleId: item.work_schedule_id || null,
      workLocationIds: assigned,
      biometricExempt: Boolean(item.biometric_exempt),
      active: Boolean(item.active),
      accessEmail: item.access_email || "",
      accessPassword: "",
    });
    setFormLoading(false);
  }

  function toggleLocation(id: number) {
    const selected: number[] = form.workLocationIds || [];
    setForm({
      ...form,
      workLocationIds: selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (formLoading || formError) return;
    try {
      const payload = {
        ...form,
        companyId: Number(form.companyId),
        workScheduleId: form.workScheduleId
          ? Number(form.workScheduleId)
          : null,
        workLocationIds: (form.workLocationIds || []).map(Number),
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
    if (
      !confirm(
        `Revogar os dispositivos de ${item.name}? O funcionário precisará vincular novamente o celular no app.`,
      )
    )
      return;
    try {
      const { data } = await api.delete(`/devices/employee/${item.id}`);
      notify(`${data.revoked || 0} dispositivo(s) revogado(s).`);
      load();
    } catch (err) {
      notify(apiMessage(err), "error");
    }
  }

  async function toggleBiometric(item: Employee) {
    const disabled = !Boolean(item.biometric_exempt);
    const action = disabled ? "desabilitar" : "habilitar";
    const warning = disabled
      ? `Desabilitar a biometria para ${item.name}? O GPS, o raio e a jornada continuam obrigatórios.`
      : `Habilitar novamente a biometria para ${item.name}?`;

    if (
      !confirm(
        `${warning}\n\nOs aparelhos ativos serão revogados e o funcionário precisará vincular o celular novamente.`,
      )
    )
      return;

    try {
      const { data } = await api.patch(`/employees/${item.id}/biometric`, {
        disabled,
      });
      notify(
        `${data.message}${data.revokedDevices ? ` ${data.revokedDevices} aparelho(s) revogado(s).` : ""}`,
      );
      load();
    } catch (err) {
      notify(apiMessage(err), "error");
    }
  }

  const normalizedSearch = search
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const filteredItems = items.filter(
    (i) =>
      `${i.name} ${i.cpf || ""} ${i.registration_number || ""}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(normalizedSearch) &&
      (!groupFilter ||
        (groupFilter === "none"
          ? !i.group_id
          : String(i.group_id) === groupFilter)) &&
      (!companyFilter || String(i.company_id) === companyFilter) &&
      (statusFilter === "all" ||
        Boolean(i.active) === (statusFilter === "active")) &&
      (!needs ||
        (needs === "schedule"
          ? !i.schedule_name
          : needs === "location"
            ? !i.location_names
            : !Number(i.device_count))),
  );
  return (
    <>
      <LoadState state={loadState} retry={load} />
      <PageHeader
        title="Funcionários"
        subtitle="Cadastros, jornadas, locais permitidos e acesso ao aplicativo"
        action={
          editable && (
            <div className="toolbar">
              <button className="secondary" onClick={() => setImportOpen(true)}>
                Importar planilha
              </button>
              <button onClick={() => setManageGroups(true)}>
                Gerenciar grupos
              </button>
              <button className="primary" onClick={() => open()}>
                + Novo funcionário
              </button>
            </div>
          )
        }
      />
      {importOpen && (
        <EmployeeImport
          companies={companies}
          close={() => setImportOpen(false)}
          reload={fetchData}
        />
      )}
      {manageGroups && (
        <GroupsManager
          groups={groups}
          employees={items}
          companies={companies}
          close={() => setManageGroups(false)}
          reload={fetchData}
        />
      )}
      <div className="employee-overview" aria-label="Resumo da equipe">
        <button
          aria-pressed={statusFilter === "active" && !needs}
          onClick={() => {
            setStatusFilter("active");
            setNeeds("");
          }}
        >
          <strong>{items.filter((i) => i.active).length}</strong>
          <span>Funcionários ativos</span>
        </button>
        <button
          aria-pressed={needs === "schedule"}
          onClick={() => {
            setStatusFilter("active");
            setNeeds("schedule");
          }}
        >
          <strong>
            {items.filter((i) => i.active && !i.schedule_name).length}
          </strong>
          <span>Sem jornada definida</span>
        </button>
        <button
          aria-pressed={needs === "location"}
          onClick={() => {
            setStatusFilter("active");
            setNeeds("location");
          }}
        >
          <strong>
            {items.filter((i) => i.active && !i.location_names).length}
          </strong>
          <span>Sem local vinculado</span>
        </button>
      </div>
      <div className="toolbar">
        <input
          className="search"
          aria-label="Buscar por nome, CPF ou matrícula"
          placeholder="Buscar por nome, CPF ou matrícula..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <button className="ghost" onClick={load}>
          Atualizar lista
        </button>
        <label>
          Empresa
          <select
            value={companyFilter}
            onChange={(e) => {
              setCompanyFilter(e.target.value);
              setGroupFilter("");
            }}
          >
            <option value="">Todas</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.trade_name || c.legal_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Grupo
          <select
            aria-label="Grupo"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
          >
            <option value="">Todos os grupos</option>
            <option value="none">Sem grupo</option>
            {groups
              .filter(
                (g) => !companyFilter || String(g.company_id) === companyFilter,
              )
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Situação
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
            <option value="all">Todos</option>
          </select>
        </label>
        <label>
          Pendência
          <select value={needs} onChange={(e) => setNeeds(e.target.value)}>
            <option value="">Todas</option>
            <option value="schedule">Sem jornada</option>
            <option value="location">Sem local vinculado</option>
            <option value="device">Sem aparelho</option>
          </select>
        </label>
      </div>

      <div className="panel">
        <div className="list-summary">
          <div>
            <h2>Sua equipe</h2>
            <p aria-live="polite">
              {filteredItems.length} de {items.length} funcionários · a busca
              atualiza enquanto você digita
            </p>
          </div>
          {(search ||
            companyFilter ||
            groupFilter ||
            needs ||
            statusFilter !== "active") && (
            <button
              className="ghost"
              onClick={() => {
                setSearch("");
                setCompanyFilter("");
                setGroupFilter("");
                setNeeds("");
                setStatusFilter("active");
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
        {items.length === 0 ? (
          loadState.pending || loadState.error ? null : (
            <Empty>Nenhum funcionário encontrado.</Empty>
          )
        ) : (
          <div className="table-wrap">
            <DataTable>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Empresa</th>
                  <th>Matrícula</th>
                  <th>Grupo</th>
                  <th>Cargo</th>
                  <th>Jornada / Local</th>
                  <th>Admissão</th>
                  <th>Biometria</th>
                  <th>Dispositivo</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.name}</strong>
                      <div className="muted">
                        {i.cpf || "CPF não informado"}
                      </div>
                    </td>
                    <td>{i.company_name}</td>
                    <td>{i.registration_number || "-"}</td>
                    <td>{i.group_name || "Sem grupo"}</td>
                    <td>{i.position_name || "-"}</td>
                    <td>
                      {i.schedule_name || (
                        <span className="warning-text">Sem jornada</span>
                      )}
                      <div className="muted">
                        {i.location_names || "Sem local vinculado"}
                      </div>
                    </td>
                    <td>{brDate(i.admission_date)}</td>
                    <td>
                      <Badge tone={i.biometric_exempt ? "neutral" : "success"}>
                        {i.biometric_exempt ? "Dispensada" : "Obrigatória"}
                      </Badge>
                    </td>
                    <td>
                      <Badge
                        tone={
                          Number(i.device_count || 0) > 0
                            ? "success"
                            : "warning"
                        }
                      >
                        {Number(i.device_count || 0) > 0
                          ? `${i.device_count} vinculado(s)`
                          : "Pendente"}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={i.active ? "success" : "neutral"}>
                        {i.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                    <td className="actions">
                      {editable && (
                        <button className="ghost" onClick={() => open(i)}>
                          Editar
                        </button>
                      )}
                      {editable && (
                        <details className="row-actions">
                          <summary>Mais ações</summary>
                          <button
                            className="ghost"
                            onClick={() => toggleBiometric(i)}
                          >
                            {i.biometric_exempt
                              ? "Habilitar biometria"
                              : "Desabilitar biometria"}
                          </button>
                          {Number(i.device_count || 0) > 0 && (
                            <button
                              className="ghost"
                              onClick={() => revokeDevices(i)}
                            >
                              Revogar aparelho
                            </button>
                          )}
                          <button
                            className="danger-link"
                            onClick={() => deactivate(i)}
                          >
                            Inativar
                          </button>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </div>

      {editing !== undefined && (
        <Modal
          title={editing ? "Editar funcionário" : "Novo funcionário"}
          onClose={() => {
            editRequest.current++;
            setEditing(undefined);
          }}
          wide
        >
          {formLoading ? (
            <p role="status">Carregando cadastro e locais autorizados…</p>
          ) : formError ? (
            <p role="alert" className="form-error">
              {formError}
            </p>
          ) : (
            <AsyncForm className="form-grid" onSubmit={save}>
              <div className="section-label span-2">Dados pessoais</div>
              <div className="form-intro span-2">
                <strong>Organize o cadastro em três partes</strong>
                <p>
                  Identifique o funcionário, vincule sua jornada e os locais de
                  trabalho, depois configure o acesso ao aplicativo. Dados
                  complementares podem ser preenchidos depois.
                </p>
              </div>
              <label className="span-2">
                Nome completo
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                CPF
                <input
                  value={form.cpf}
                  onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                />
              </label>
              <label>
                PIS
                <input
                  value={form.pis}
                  onChange={(e) => setForm({ ...form, pis: e.target.value })}
                />
              </label>
              <label>
                Matrícula
                <input
                  value={form.registrationNumber}
                  onChange={(e) =>
                    setForm({ ...form, registrationNumber: e.target.value })
                  }
                />
              </label>
              <label>
                CTPS
                <input
                  value={form.ctps}
                  onChange={(e) => setForm({ ...form, ctps: e.target.value })}
                />
              </label>
              <label>
                Data de admissão
                <input
                  type="date"
                  value={form.admissionDate}
                  onChange={(e) =>
                    setForm({ ...form, admissionDate: e.target.value })
                  }
                />
              </label>
              <div />

              <div className="section-label span-2">Vínculo profissional</div>
              <label>
                Empresa
                <select
                  required
                  value={form.companyId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      companyId: Number(e.target.value),
                      groupId: null,
                      workScheduleId: null,
                      workLocationIds: [],
                    })
                  }
                >
                  <option value={0}>Selecione</option>
                  {companies
                    .filter((c) => c.active)
                    .map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.trade_name || c.legal_name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Jornada
                <select
                  value={form.workScheduleId || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      workScheduleId: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                >
                  <option value="">Sem jornada</option>
                  {filteredSchedules.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cargo
                <input
                  value={form.positionName}
                  onChange={(e) =>
                    setForm({ ...form, positionName: e.target.value })
                  }
                />
              </label>
              <label>
                Setor
                <input
                  value={form.departmentName}
                  onChange={(e) =>
                    setForm({ ...form, departmentName: e.target.value })
                  }
                />
              </label>

              <label>
                Grupo
                <select
                  value={form.groupId || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      groupId: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                >
                  <option value="">Sem grupo</option>
                  {groups
                    .filter(
                      (g) => Number(g.company_id) === Number(form.companyId),
                    )
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                </select>
                <small>Cadastre novas equipes em Gerenciar grupos.</small>
              </label>
              <div className="section-label span-2">Locais autorizados</div>
              <div className="location-checks span-2">
                {filteredLocations.length === 0 ? (
                  <span className="muted">
                    Nenhum local ativo cadastrado para esta empresa.
                  </span>
                ) : (
                  filteredLocations.map((l) => (
                    <label className="location-check" key={l.id}>
                      <input
                        type="checkbox"
                        checked={(form.workLocationIds || []).includes(l.id)}
                        onChange={() => toggleLocation(l.id)}
                      />
                      <span>
                        <b>{l.name}</b>
                        <small>
                          {l.geo_mode === "DISABLED"
                            ? "GPS desativado"
                            : `${l.geo_mode} · raio ${l.radius_meters} m`}
                        </small>
                      </span>
                    </label>
                  ))
                )}
              </div>

              <div className="section-label span-2">
                Segurança do registro de ponto
              </div>
              <label className="checkbox-row span-2">
                <input
                  type="checkbox"
                  checked={Boolean(form.biometricExempt)}
                  onChange={(e) =>
                    setForm({ ...form, biometricExempt: e.target.checked })
                  }
                />
                Desabilitar biometria para este funcionário
              </label>
              <div className="muted span-2">
                Quando marcado, o funcionário continua sujeito ao GPS, raio
                permitido, jornada e horário oficial do servidor. Se esta opção
                for alterada, os aparelhos vinculados serão revogados para
                aplicar a nova política com segurança.
              </div>

              <div className="section-label span-2">Acesso ao aplicativo</div>
              <label>
                E-mail de acesso
                <input
                  type="email"
                  value={form.accessEmail}
                  onChange={(e) =>
                    setForm({ ...form, accessEmail: e.target.value })
                  }
                />
              </label>
              <label>
                {editing ? "Nova senha (opcional)" : "Senha inicial"}
                <input
                  type="password"
                  value={form.accessPassword}
                  onChange={(e) =>
                    setForm({ ...form, accessPassword: e.target.value })
                  }
                  placeholder={
                    editing ? "Deixe vazio para manter" : "mínimo 6 caracteres"
                  }
                />
              </label>
              <label className="checkbox-row span-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm({ ...form, active: e.target.checked })
                  }
                />{" "}
                Funcionário ativo
              </label>
              <div className="form-actions span-2">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setEditing(undefined)}
                >
                  Cancelar
                </button>
                <button className="primary">Salvar funcionário</button>
              </div>
            </AsyncForm>
          )}
        </Modal>
      )}
    </>
  );
}
