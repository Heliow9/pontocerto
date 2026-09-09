import { LoadState, useLoadState } from "../components/LoadState";
import { DataTable } from "../components/DataTable";
import { useEffect, useState } from "react";
import { api } from "../api";
import { PageHeader, Empty, Badge } from "../components/Ui";
import { brDateTime, entryTypeLabel } from "../utils";

export function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const state = useLoadState();
  const [updated, setUpdated] = useState("");
  const load = () =>
    state.run(async () => {
      const { data } = await api.get("/dashboard");
      setData(data);
      setUpdated(new Date().toLocaleTimeString("pt-BR"));
    });
  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);
  if (!data)
    return (
      <>
        <PageHeader
          title="Visão geral"
          subtitle={
            updated
              ? `Última consulta às ${updated}`
              : "Visão operacional da empresa"
          }
          action={
            <button className="ghost" disabled={state.pending} onClick={load}>
              Atualizar
            </button>
          }
        />
        <LoadState state={state} retry={load} />
      </>
    );

  return (
    <>
      <PageHeader
        title="Visão geral"
        subtitle={
          updated
            ? `Última consulta às ${updated}`
            : "Visão operacional da empresa"
        }
        action={
          <button className="ghost" disabled={state.pending} onClick={load}>
            Atualizar
          </button>
        }
      />
      <LoadState state={state} retry={load} />
      <section className="stats-grid">
        <a href="#employees" className="stat-card stat-link">
          <span>Funcionários</span>
          <strong>{data.employees}</strong>
          <small>ativos na organização</small>
        </a>
        <a href="#points" className="stat-card stat-link">
          <span>Trabalhando agora</span>
          <strong>{data.workingNow}</strong>
          <small>consultar marcações</small>
        </a>
        <a href="#reports" className="stat-card stat-link">
          <span>Atrasos hoje</span>
          <strong>{data.lateToday}</strong>
          <small>conforme último processamento</small>
        </a>
        <a href="#adjustments" className="stat-card stat-link">
          <span>Ajustes pendentes</span>
          <strong>{data.pendingAdjustments}</strong>
          <small>abrir solicitações</small>
        </a>
      </section>

      <section className="content-grid two-thirds">
        <div className="panel">
          <div className="panel-title">
            <div>
              <h2>Marcações recentes</h2>
              <p>{data.entriesToday} registros realizados hoje</p>
            </div>
          </div>
          {data.recentEntries.length === 0 ? (
            <Empty>Nenhuma marcação registrada.</Empty>
          ) : (
            <div className="table-wrap">
              <DataTable>
                <thead>
                  <tr>
                    <th>Funcionário</th>
                    <th>Tipo</th>
                    <th>Data/hora</th>
                    <th>Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentEntries.map((e: any) => (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.employee_name}</strong>
                        <div className="muted">
                          {e.registration_number || "Sem matrícula"}
                        </div>
                      </td>
                      <td>
                        {entryTypeLabel[e.entry_type] || e.entry_type}
                        {e.manually_adjusted ? " *" : ""}
                      </td>
                      <td>{brDateTime(e.registered_at)}</td>
                      <td>
                        <Badge
                          tone={e.source === "MANUAL" ? "warning" : "info"}
                        >
                          {e.source}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          )}
        </div>
        <div className="panel quick-panel">
          <h2>Atalhos da equipe</h2>
          <div className="quick-links">
            <a href="#employees?needs=schedule">
              Revisar funcionários sem jornada
            </a>
            <a href="#employees?needs=location">Revisar locais autorizados</a>
            <a href="#employees?needs=device">Revisar aparelhos pendentes</a>
          </div>
          <div className="quick-kpi">
            <span>Marcações hoje</span>
            <strong>{data.entriesToday}</strong>
          </div>
          <div className="quick-kpi">
            <span>Em jornada</span>
            <strong>{data.workingNow}</strong>
          </div>
          <p className="muted">
            Os indicadores de atraso e falta são atualizados quando o período é
            processado pelo relatório ou pela tela de pontos.
          </p>
        </div>
      </section>
    </>
  );
}
