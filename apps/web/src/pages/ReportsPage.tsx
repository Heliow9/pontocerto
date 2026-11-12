import {
  InitialPageState,
  LoadState,
  useLoadState,
} from "../components/LoadState";
import { DataTable } from "../components/DataTable";
import { useEffect, useState } from "react";
import { api } from "../api";
import { Employee } from "../types";
import { Empty, PageHeader } from "../components/Ui";
import { apiMessage, brDate, minutesToHHMM, monthRange } from "../utils";
import { PayrollExportPanel } from "../components/PayrollExportPanel";
import { useAccess } from "../components/Access";
import {
  canReprocessReport,
  dailyOvertimeAction,
  overtimePermissionNotice,
} from "../report-overtime";

export function ReportsPage({
  notify,
}: {
  notify: (m: string, t?: "ok" | "error") => void;
}) {
  const range = monthRange();
  const { canManage, can } = useAccess();
  const canManageOvertime = can("overtime.manage");
  const [tab, setTab] = useState<"monthly" | "payroll">(
    canManage &&
      new URLSearchParams(location.hash.split("?")[1]).get("tab") === "payroll"
      ? "payroll"
      : "monthly",
  );
  const [employees, setEmployees] = useState<Employee[]>([]),
    [employeeId, setEmployeeId] = useState(""),
    [start, setStart] = useState(range.start),
    [end, setEnd] = useState(range.end),
    [report, setReport] = useState<any>(null),
    [loading, setLoading] = useState(false),
    [overrideBusy, setOverrideBusy] = useState("");
  const state = useLoadState();
  const loadEmployees = () =>
    state.run(async () => {
      const { data } = await api.get("/employees");
      setEmployees(data);
      if (data[0]) setEmployeeId(String(data[0].id));
    });
  useEffect(() => {
    void loadEmployees();
  }, []);
  async function preview() {
    if (!employeeId || loading) return;
    if (start > end) {
      notify("A data inicial deve ser anterior à final.", "error");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get(`/reports/monthly-data/${employeeId}`, {
        params: { start, end },
      });
      setReport(data);
      notify("Espelho processado e atualizado.");
    } catch (err) {
      notify(apiMessage(err), "error");
    } finally {
      setLoading(false);
    }
  }
  async function pdf() {
    if (!employeeId || loading) return;
    if (start > end) {
      notify("A data inicial deve ser anterior à final.", "error");
      return;
    }
    setLoading(true);
    try {
      const r = await api.get(`/reports/monthly/${employeeId}`, {
        params: { start, end },
        responseType: "blob",
      });
      const url = URL.createObjectURL(r.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `espelho-${start}-${end}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      notify(apiMessage(err), "error");
    } finally {
      setLoading(false);
    }
  }
  async function ignoreOvertime(day: any) {
    const reason = window.prompt(
      `Justificativa para ignorar a hora extra de ${brDate(day.work_date)}:`,
      day.overtime_ignore_reason || "",
    )?.trim();
    if (!reason) return;
    if (reason.length < 3) {
      notify("Informe uma justificativa com pelo menos 3 caracteres.", "error");
      return;
    }
    setOverrideBusy(day.work_date);
    try {
      await api.put(`/reports/overtime-override/${employeeId}/${day.work_date.slice(0,10)}`, { reason });
      await preview();
      notify("Hora extra ignorada e espelho recalculado.");
    } catch (err) {
      notify(apiMessage(err), "error");
    } finally {
      setOverrideBusy("");
    }
  }
  async function restoreOvertime(day: any) {
    if (!confirm(`Restaurar a hora extra calculada de ${brDate(day.work_date)}?`)) return;
    setOverrideBusy(day.work_date);
    try {
      await api.delete(`/reports/overtime-override/${employeeId}/${day.work_date.slice(0,10)}`);
      await preview();
      notify("Hora extra restaurada e espelho recalculado.");
    } catch (err) {
      notify(apiMessage(err), "error");
    } finally {
      setOverrideBusy("");
    }
  }
  const totals = report?.days?.reduce(
    (a: any, d: any) => ({
      expected: a.expected + Number(d.expected_minutes || 0),
      normal: a.normal + Number(d.normal_minutes || 0),
      excused: a.excused + Number(d.excused_minutes || 0),
      extra: a.extra + Number(d.overtime_minutes || 0),
      late: a.late + Number(d.late_minutes || 0),
      absence: a.absence + Number(d.absence_minutes || 0),
    }),
    { expected: 0, normal: 0, excused: 0, extra: 0, late: 0, absence: 0 },
  );
  const overtimeNotice = overtimePermissionNotice(canManage, canManageOvertime);
  if (!state.ready && tab === "monthly")
    return (
      <InitialPageState
        title="Relatórios"
        subtitle="Espelho mensal e exportação de pontos para a folha de pagamento"
        state={state}
        retry={loadEmployees}
      />
    );
  return (
    <>
      <PageHeader
        title="Relatórios"
        subtitle="Espelho mensal e exportação de pontos para a folha de pagamento"
      />
      {canManage && (
        <div className="report-choices" aria-label="Tipo de relatório">
          <button
            className={tab === "monthly" ? "primary" : "secondary"}
            aria-pressed={tab === "monthly"}
            aria-label="Espelho mensal"
            onClick={() => setTab("monthly")}
          >
            Espelho mensal
            <small>Consultar horas e baixar o PDF de um funcionário</small>
          </button>
          <button
            className={tab === "payroll" ? "primary" : "secondary"}
            aria-pressed={tab === "payroll"}
            aria-label="Exportar para ERP"
            onClick={() => setTab("payroll")}
          >
            Exportar para ERP
            <small>Preparar as horas da equipe para a contabilidade</small>
          </button>
        </div>
      )}
      {canManage && tab === "payroll" && <PayrollExportPanel notify={notify} />}
      <section hidden={canManage && tab === "payroll"}>
        <LoadState state={state} retry={loadEmployees} />
        <div className="toolbar filters">
          <label>
            Funcionário
            <select
              disabled={loading}
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                setReport(null);
              }}
            >
              <option value="">Selecione</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Início
            <input
              disabled={loading}
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setReport(null);
              }}
            />
          </label>
          <label>
            Fim
            <input
              disabled={loading}
              type="date"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                setReport(null);
              }}
            />
          </label>
          <button className="secondary" onClick={preview} disabled={loading}>
            {loading ? "Processando..." : "Visualizar"}
          </button>
          <button
            className="primary"
            onClick={pdf}
            disabled={loading || !employeeId}
          >
            Baixar PDF
          </button>
          {report && canReprocessReport(canManage) && (
            <button className="secondary" onClick={preview} disabled={loading}>
              {loading ? "Reprocessando..." : "Reprocessar período"}
            </button>
          )}
        </div>
        {overtimeNotice && <p className="muted" role="note">{overtimeNotice}</p>}
        {!report ? (
          <div className="panel">
            <Empty>
              Selecione o funcionário e clique em Visualizar. O relatório mostra
              carga prevista, horas trabalhadas, extras, atrasos e faltas.
            </Empty>
          </div>
        ) : (
          <>
            <div className="report-head panel">
              <div>
                <h2>{report.employee.name}</h2>
                <p>
                  {report.employee.company_name} · Matrícula{" "}
                  {report.employee.registration_number || "-"}
                </p>
              </div>
              <div className="report-totals">
                <span>
                  CH <b>{minutesToHHMM(totals.expected)}</b>
                </span>
                <span>
                  Normais <b>{minutesToHHMM(totals.normal)}</b>
                </span>
                <span>
                  Abonadas <b>{minutesToHHMM(totals.excused)}</b>
                </span>
                <span>
                  Extras <b>{minutesToHHMM(totals.extra)}</b>
                </span>
                <span>
                  Atraso <b>{minutesToHHMM(-totals.late)}</b>
                </span>
                <span>
                  Falta <b>{minutesToHHMM(-totals.absence)}</b>
                </span>
              </div>
            </div>
            <div className="panel">
              <div className="table-wrap">
                <DataTable className="report-table">
                  <thead>
                    <tr>
                      <th>DATA</th>
                      <th>STATUS</th>
                      <th>PONTOS</th>
                      <th>Carga prevista</th>
                      <th>Horas normais</th>
                      <th>Abonadas</th>
                      <th>Horas extras</th>
                      <th>Atrasos</th>
                      <th>Faltas</th>
                      {canManage && canManageOvertime && <th>Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {report.days.map((d: any) => (
                      <tr key={d.work_date}>
                        <td>{brDate(d.work_date)}</td>
                        <td>
                          {d.status === "NORMAL"
                            ? ""
                            : d.status_label || d.status}
                        </td>
                        <td>
                          {d.points_text || ""}
                          {Number(d.break_deducted_minutes || 0) > 0 && (
                            <small className="muted">Intervalo previsto descontado: {minutesToHHMM(d.break_deducted_minutes)}</small>
                          )}
                        </td>
                        <td>
                          {d.expected_minutes
                            ? minutesToHHMM(d.expected_minutes)
                            : ""}
                        </td>
                        <td>
                          {d.normal_minutes
                            ? minutesToHHMM(d.normal_minutes)
                            : ""}
                        </td>
                        <td>
                          {d.excused_minutes
                            ? minutesToHHMM(d.excused_minutes)
                            : ""}
                        </td>
                        <td>
                          {d.overtime_minutes
                            ? minutesToHHMM(d.overtime_minutes)
                            : ""}
                          {Boolean(d.overtime_ignored) && (
                            <small className="muted" title={d.overtime_ignore_reason || ""}>Ignorada: {d.overtime_ignore_reason}</small>
                          )}
                        </td>
                        <td className="negative">
                          {d.late_minutes ? minutesToHHMM(-d.late_minutes) : ""}
                        </td>
                        <td className="negative">
                          {d.absence_minutes
                            ? minutesToHHMM(-d.absence_minutes)
                            : ""}
                        </td>
                        {canManage && canManageOvertime && (
                          <td>
                            {dailyOvertimeAction(d, canManage, canManageOvertime) === "ignore" && (
                              <button className="ghost" disabled={overrideBusy === d.work_date} onClick={() => ignoreOvertime(d)}>Ignorar hora extra</button>
                            )}
                            {dailyOvertimeAction(d, canManage, canManageOvertime) === "restore" && (
                              <button className="ghost" disabled={overrideBusy === d.work_date} onClick={() => restoreOvertime(d)}>Restaurar hora extra</button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
