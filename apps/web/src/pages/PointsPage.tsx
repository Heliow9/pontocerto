import { useAccess } from "../components/Access";
import { LoadState, useLoadState } from "../components/LoadState";
import { AsyncForm } from "../components/AsyncForm";
import { DataTable } from "../components/DataTable";
import { useEffect, useState } from "react";
import { api } from "../api";
import { Employee, TimeEntry } from "../types";
import { Badge, Empty, PageHeader } from "../components/Ui";
import { Modal } from "../components/Modal";
import {
  apiMessage,
  brDate,
  brDateTime,
  entryTypeLabel,
  localIsoDate,
} from "../utils";
const today = localIsoDate();
export function PointsPage({
  notify,
}: {
  notify: (m: string, t?: "ok" | "error") => void;
}) {
  const { canManage, canAdjust, role } = useAccess();
  const editable = canAdjust;
  const [securityDetails, setSecurityDetails] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [applied, setApplied] = useState({
    start: today,
    end: today,
    employeeId: "",
  });
  const [items, setItems] = useState<TimeEntry[]>([]),
    [employees, setEmployees] = useState<Employee[]>([]),
    [start, setStart] = useState(today),
    [end, setEnd] = useState(today),
    [employeeId, setEmployeeId] = useState(""),
    [manual, setManual] = useState(false),
    [selfieUrl, setSelfieUrl] = useState<string | null>(null),
    [selfieTitle, setSelfieTitle] = useState("Foto da marcação"),
    [form, setForm] = useState<any>({
      employeeId: 0,
      registeredAt: `${today}T08:00`,
      type: "CLOCK_IN",
      reason: "",
    });
  const loadState = useLoadState();
  async function fetchData() {
    if (start > end)
      throw new Error("A data inicial deve ser anterior à final.");
    const [a, b] = await Promise.all([
      api.get("/time-entries", {
        params: { start, end, employeeId: employeeId || undefined },
      }),
      api.get("/employees"),
    ]);
    setItems(a.data);
    setEmployees(b.data);
    setApplied({ start, end, employeeId });
  }
  const load = () => loadState.run(fetchData);
  useEffect(() => {
    load();
  }, []);
  async function process() {
    if (processing) return;
    if (!start || !end || start > end) {
      notify("Confira as datas antes de calcular as horas.", "error");
      return;
    }
    setProcessing(true);
    try {
      await api.post("/calculations/process", {
        start,
        end,
        employeeId: employeeId ? Number(employeeId) : undefined,
      });
      notify("Período processado.");
    } catch (e) {
      notify(apiMessage(e), "error");
    } finally {
      setProcessing(false);
    }
  }
  async function saveManual(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/time-entries/manual", {
        ...form,
        employeeId: Number(form.employeeId),
      });
      notify("Ponto manual incluído.");
      setManual(false);
      load();
    } catch (err) {
      notify(apiMessage(err), "error");
    }
  }
  async function viewSelfie(i: TimeEntry) {
    try {
      const { data } = await api.get(`/time-entries/${i.id}/selfie`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      if (selfieUrl) URL.revokeObjectURL(selfieUrl);
      setSelfieUrl(url);
      setSelfieTitle(`${i.employee_name} · ${brDateTime(i.registered_at)}`);
    } catch (err) {
      notify(apiMessage(err), "error");
    }
  }
  async function remove(i: TimeEntry) {
    if (!confirm(`Excluir a marcação de ${i.employee_name}?`)) return;
    try {
      await api.delete(`/time-entries/${i.id}`);
      notify("Marcação excluída.");
      load();
    } catch (err) {
      notify(apiMessage(err), "error");
    }
  }
  return (
    <>
      <LoadState state={loadState} retry={load} />
      <PageHeader
        title="Marcações de ponto"
        subtitle="Consulte entradas e saídas. Abra os detalhes de segurança quando precisar conferir um registro."
        action={
          editable && (
            <button
              className="primary"
              onClick={() => {
                setForm({
                  ...form,
                  employeeId: employees[0]?.id || 0,
                  registeredAt: `${today}T08:00`,
                });
                setManual(true);
              }}
            >
              + Ponto manual
            </button>
          )
        }
      />
      <div className="toolbar filters">
        <label>
          De
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <label>
          Funcionário
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">Todos</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={load} disabled={loadState.pending}>
          {loadState.pending ? "Buscando..." : "Filtrar"}
        </button>
        {canAdjust && (
          <button
            className="secondary"
            onClick={process}
            disabled={processing}
            title="Recalcula horas, atrasos e faltas do período selecionado"
          >
            {processing ? "Calculando..." : "Calcular horas do período"}
          </button>
        )}
      </div>
      {(applied.start !== start ||
        applied.end !== end ||
        applied.employeeId !== employeeId) && (
        <div className="info-box" role="status">
          Filtros alterados. Clique em Filtrar para atualizar a lista abaixo.
        </div>
      )}
      <div className="panel">
        <div className="list-summary">
          <div>
            <h2>Registros encontrados</h2>
            <p>
              {items.length} marcações · {brDate(applied.start)} a{" "}
              {brDate(applied.end)}
            </p>
          </div>
          <label className="detail-toggle">
            <input
              type="checkbox"
              checked={securityDetails}
              onChange={(e) => setSecurityDetails(e.target.checked)}
            />
            Detalhes de segurança
          </label>
        </div>
        {items.length === 0 ? (
          loadState.pending || loadState.error ? null : (
            <Empty>Nenhuma marcação no período.</Empty>
          )
        ) : (
          <div className="table-wrap">
            <DataTable>
              <thead>
                <tr>
                  <th>Funcionário</th>
                  <th>Data/hora</th>
                  <th>Tipo</th>
                  <th>Origem</th>
                  {securityDetails && (
                    <>
                      <th>Jornada</th>
                      <th>Localização</th>
                      <th>Biometria / aparelho</th>
                    </>
                  )}
                  <th>Foto</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.employee_name}</strong>
                      <div className="muted">
                        {i.registration_number || "-"}
                      </div>
                    </td>
                    <td>
                      {brDateTime(i.registered_at)}
                      {i.manually_adjusted ? (
                        <b className="manual-star"> *</b>
                      ) : null}
                    </td>
                    <td>{entryTypeLabel[i.entry_type] || i.entry_type}</td>
                    <td>
                      <Badge tone={i.source === "MANUAL" ? "warning" : "info"}>
                        {i.source}
                      </Badge>
                      {i.remote_entry_id && <div className="muted">Remoto · {i.was_offline?"envio posterior":"online"}<br/>Horário do aparelho{i.synced_at&&<> · Recebido em {brDateTime(i.synced_at)}</>}</div>}
                    </td>
                    {securityDetails && (
                      <>
                        <td>
                          {i.schedule_decision ? (
                            <>
                              <Badge
                                tone={
                                  i.schedule_decision === "ALLOWED"
                                    ? "success"
                                    : "neutral"
                                }
                              >
                                {i.schedule_decision}
                              </Badge>
                              <div className="muted">
                                {i.schedule_text ||
                                  i.scheduled_work_date ||
                                  "Jornada validada"}
                              </div>
                            </>
                          ) : i.source === "MANUAL" ? (
                            <Badge tone="warning">Manual</Badge>
                          ) : (
                            <Badge tone="neutral">N/A</Badge>
                          )}
                        </td>
                        <td>
                          {i.geo_decision ? (
                            <>
                              <Badge
                                tone={
                                  i.geo_decision === "ALLOWED"
                                    ? "success"
                                    : i.geo_decision === "WARNED"
                                      ? "warning"
                                      : "neutral"
                                }
                              >
                                {i.geo_decision}
                              </Badge>
                              <div className="muted">
                                {i.distance_meters != null
                                  ? `${Math.round(Number(i.distance_meters))} m · `
                                  : ""}
                                {i.geo_location_name || ""}
                                {i.location_mocked ? " · GPS simulado" : ""}
                              </div>
                            </>
                          ) : i.latitude && i.longitude ? (
                            `${Number(i.latitude).toFixed(5)}, ${Number(i.longitude).toFixed(5)}`
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>
                          {i.device_biometric_verified ? (
                            <>
                              <Badge tone="success">Biometria validada</Badge>
                              <div className="muted">
                                {[i.device_manufacturer, i.device_model]
                                  .filter(Boolean)
                                  .join(" ") || "Dispositivo vinculado"}
                              </div>
                            </>
                          ) : i.source === "MANUAL" ? (
                            <Badge tone="warning">Manual</Badge>
                          ) : (
                            <Badge tone="neutral">N/A</Badge>
                          )}
                        </td>
                      </>
                    )}
                    <td>
                      {i.has_selfie ? (
                        <button className="ghost" onClick={() => viewSelfie(i)}>
                          📷 Ver foto
                        </button>
                      ) : i.source === "MANUAL" ? (
                        <Badge tone="warning">Manual</Badge>
                      ) : (
                        <Badge tone="neutral">Sem foto</Badge>
                      )}
                    </td>
                    <td>
                      {canManage && (
                        <button
                          className="danger-link"
                          onClick={() => remove(i)}
                        >
                          Excluir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </div>
      {selfieUrl && (
        <Modal
          title={selfieTitle}
          onClose={() => {
            URL.revokeObjectURL(selfieUrl);
            setSelfieUrl(null);
          }}
        >
          <div style={{ display: "grid", gap: 12 }}>
            <img
              src={selfieUrl}
              alt="Foto da marcação de ponto"
              style={{
                width: "100%",
                maxHeight: "68vh",
                objectFit: "contain",
                borderRadius: 14,
                background: "#111",
              }}
            />
            <div className="info-box">
              Foto capturada pelo aplicativo antes da gravação desta marcação.
            </div>
          </div>
        </Modal>
      )}
      {manual && (
        <Modal title="Incluir ponto manual" onClose={() => setManual(false)}>
          <AsyncForm className="form-grid" onSubmit={saveManual}>
            <label className="span-2">
              Funcionário
              <select
                required
                value={form.employeeId}
                onChange={(e) =>
                  setForm({ ...form, employeeId: Number(e.target.value) })
                }
              >
                <option value={0}>Selecione</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data e hora
              <input
                type="datetime-local"
                required
                value={form.registeredAt}
                onChange={(e) =>
                  setForm({ ...form, registeredAt: e.target.value })
                }
              />
            </label>
            <label>
              Tipo
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="CLOCK_IN">Entrada</option>
                <option value="BREAK_OUT">Saída intervalo</option>
                <option value="BREAK_IN">Retorno intervalo</option>
                <option value="CLOCK_OUT">Saída</option>
                <option value="OTHER">Outro</option>
              </select>
            </label>
            <label className="span-2">
              Justificativa
              <textarea
                required
                rows={3}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </label>
            <div className="info-box span-2">
              Marcações manuais ficam auditadas e aparecem com <b>*</b> no
              espelho de ponto.
            </div>
            <div className="form-actions span-2">
              <button
                type="button"
                className="ghost"
                onClick={() => setManual(false)}
              >
                Cancelar
              </button>
              <button className="primary">Salvar marcação</button>
            </div>
          </AsyncForm>
        </Modal>
      )}
    </>
  );
}
