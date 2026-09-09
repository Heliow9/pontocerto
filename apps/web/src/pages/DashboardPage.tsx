import { useEffect, useState } from "react";
import { api } from "../api";
import { PageHeader, Loader, Empty, Badge } from "../components/Ui";
import { brDateTime, entryTypeLabel } from "../utils";

export function DashboardPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.get("/dashboard").then((r) => setData(r.data)); }, []);
  if (!data) return <><PageHeader title="Dashboard" subtitle="Visão operacional da empresa" /><Loader /></>;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Visão operacional da empresa" />
      <section className="stats-grid">
        <div className="stat-card"><span>Funcionários</span><strong>{data.employees}</strong><small>ativos no tenant</small></div>
        <div className="stat-card"><span>Trabalhando agora</span><strong>{data.workingNow}</strong><small>jornada em aberto</small></div>
        <div className="stat-card"><span>Atrasos hoje</span><strong>{data.lateToday}</strong><small>após processamento</small></div>
        <div className="stat-card"><span>Ajustes pendentes</span><strong>{data.pendingAdjustments}</strong><small>aguardando análise</small></div>
      </section>

      <section className="content-grid two-thirds">
        <div className="panel">
          <div className="panel-title"><div><h2>Marcações recentes</h2><p>{data.entriesToday} registros realizados hoje</p></div></div>
          {data.recentEntries.length === 0 ? <Empty>Nenhuma marcação registrada.</Empty> : (
            <div className="table-wrap"><table><thead><tr><th>Funcionário</th><th>Tipo</th><th>Data/hora</th><th>Origem</th></tr></thead><tbody>
              {data.recentEntries.map((e: any) => <tr key={e.id}><td><strong>{e.employee_name}</strong><div className="muted">{e.registration_number || "Sem matrícula"}</div></td><td>{entryTypeLabel[e.entry_type] || e.entry_type}{e.manually_adjusted ? " *" : ""}</td><td>{brDateTime(e.registered_at)}</td><td><Badge tone={e.source === "MANUAL" ? "warning" : "info"}>{e.source}</Badge></td></tr>)}
            </tbody></table></div>
          )}
        </div>
        <div className="panel quick-panel">
          <h2>Operação</h2>
          <div className="quick-kpi"><span>Marcações hoje</span><strong>{data.entriesToday}</strong></div>
          <div className="quick-kpi"><span>Em jornada</span><strong>{data.workingNow}</strong></div>
          <p className="muted">Os indicadores de atraso e falta são atualizados quando o período é processado pelo relatório ou pela tela de pontos.</p>
        </div>
      </section>
    </>
  );
}
