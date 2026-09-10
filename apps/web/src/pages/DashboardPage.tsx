import { LoadState, useLoadState } from "../components/LoadState";
import { DataTable } from "../components/DataTable";
import { useEffect, useState } from "react";
import { api } from "../api";
import { PageHeader, Empty, Badge } from "../components/Ui";
import { brDateTime, entryTypeLabel } from "../utils";
import { Icon } from "../components/Icon";
import { useAccess } from "../components/Access";

export function DashboardPage() {
  const { canManage, canAdjust } = useAccess();
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
      <section className="dashboard-welcome">
        <div>
          <span className="eyebrow">SUA ROTINA, MAIS ORGANIZADA</span>
          <h2>
            Um bom dia começa
            <br />
            com tudo em dia.
          </h2>
          <p>
            Acompanhe os pontos, resolva pendências e prepare o fechamento da
            equipe.
          </p>
        </div>
        <div className="today-focus">
          <span className="focus-icon">
            <Icon name="adjustments" size={26} />
          </span>
          <strong>
            {data.pendingAdjustments > 0
              ? `${data.pendingAdjustments} ajuste${data.pendingAdjustments === 1 ? "" : "s"} aguardando análise`
              : "Nenhum ajuste pendente"}
          </strong>
          <p>
            {data.pendingAdjustments > 0
              ? "Confira os horários e motivos enviados pela equipe."
              : "Continue acompanhando as marcações e as ocorrências do período."}
          </p>
          <a href="#adjustments">
            {canAdjust ? "Analisar solicitações" : "Consultar solicitações"}
            <Icon name="arrow" size={17} />
          </a>
        </div>
      </section>
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

      <section className="task-section" aria-label="Ações do dia a dia">
        <div className="section-heading">
          <div>
            <span className="eyebrow">POR ONDE COMEÇAR</span>
            <h2>O que você precisa fazer?</h2>
          </div>
          <span className="muted">Escolha uma tarefa para continuar</span>
        </div>
        <div className="task-cards">
          <a className="task-card" href="#points">
            <span className="task-icon">
              <Icon name="points" />
            </span>
            <h3>Conferir os pontos</h3>
            <p>Veja entradas, saídas e os detalhes de cada registro.</p>
            <span className="task-action">
              Ver marcações <Icon name="arrow" size={16} />
            </span>
          </a>
          <a className="task-card" href="#reports">
            <span className="task-icon">
              <Icon name="reports" />
            </span>
            <h3>Fechar o período</h3>
            <p>Confira as horas da equipe e gere o espelho mensal.</p>
            <span className="task-action">
              Abrir relatórios <Icon name="arrow" size={16} />
            </span>
          </a>
          {canManage ? (
            <a className="task-card" href="#reports?tab=payroll">
              <span className="task-icon">
                <Icon name="companies" />
              </span>
              <h3>Enviar para a contabilidade</h3>
              <p>Prepare um arquivo de horas para importar na folha.</p>
              <span className="task-action">
                Exportar para ERP <Icon name="arrow" size={16} />
              </span>
            </a>
          ) : (
            <a className="task-card" href="#employees">
              <span className="task-icon">
                <Icon name="employees" />
              </span>
              <h3>Consultar a equipe</h3>
              <p>Encontre jornadas, locais e informações dos funcionários.</p>
              <span className="task-action">
                Ver funcionários <Icon name="arrow" size={16} />
              </span>
            </a>
          )}
        </div>
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
