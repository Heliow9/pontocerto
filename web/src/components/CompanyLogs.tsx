import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { apiMessage } from "../utils";
import { Badge } from "./Ui";

type Range = "24h" | "7d" | "30d" | "90d";
type Level = "ALL" | "INFO" | "WARNING" | "ERROR";
type Module = "ALL" | "WHATSAPP" | "POINT" | "OFFLINE" | "SYNC" | "API" | "SYSTEM";
type LogRow = {
  id: number;
  level: Exclude<Level, "ALL">;
  module: Exclude<Module, "ALL">;
  event_type: string;
  message: string;
  details?: Record<string, unknown> | null;
  employee_id?: number | null;
  recipient?: string | null;
  created_at: string;
};
type Summary = {
  errors: number;
  warnings: number;
  whatsappDelivered: number;
  whatsappPending: number;
  lastError?: string | null;
  lastErrorAt?: string | null;
  whatsappStatus?: { ready?: boolean; status?: string; phone?: string | null };
};

const ranges: { id: Range; label: string }[] = [
  { id: "24h", label: "24 horas" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "90d", label: "90 dias" },
];
const modules: { id: Module; label: string }[] = [
  { id: "ALL", label: "Todos os módulos" },
  { id: "WHATSAPP", label: "WhatsApp" },
  { id: "POINT", label: "Ponto" },
  { id: "OFFLINE", label: "Offline" },
  { id: "SYNC", label: "Sincronização" },
  { id: "API", label: "API" },
  { id: "SYSTEM", label: "Sistema" },
];
const levels: { id: Level; label: string }[] = [
  { id: "ALL", label: "Todos os níveis" },
  { id: "INFO", label: "Informação" },
  { id: "WARNING", label: "Aviso" },
  { id: "ERROR", label: "Erro" },
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value.replace(" ", "T") + (value.includes("T") ? "" : "-03:00"));
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(date);
}
function statusLabel(status?: string) {
  const map: Record<string, string> = {
    CONNECTED: "Conectado",
    CONNECTING: "Conectando",
    RECONNECTING: "Reconectando",
    DISCONNECTED: "Desconectado",
    LOGGED_OUT: "Sessão encerrada",
    ERROR: "Erro",
    QR: "Aguardando QR",
  };
  return map[status || ""] || status || "Desconectado";
}

export function CompanyLogs({ id }: { id: number }) {
  const [range, setRange] = useState<Range>("24h");
  const [level, setLevel] = useState<Level>("ALL");
  const [module, setModule] = useState<Module>("ALL");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: LogRow[]; total: number; pages: number }>({ items: [], total: 0, pages: 1 });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [logs, stats] = await Promise.all([
        api.get(`/logs/companies/${id}`, { params: { range, level, module, page, pageSize: 50 } }),
        api.get(`/logs/companies/${id}/summary`, { params: { range } }),
      ]);
      setData(logs.data);
      setSummary(stats.data);
    } catch (err) {
      setError(apiMessage(err, "Não foi possível carregar os logs da empresa."));
    } finally {
      setLoading(false);
    }
  }, [id, range, level, module, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const whatsappTone = useMemo(
    () => (summary?.whatsappStatus?.status === "CONNECTED" ? "success" : summary?.whatsappStatus?.status === "ERROR" ? "danger" : "neutral"),
    [summary],
  );

  return (
    <section className="card company-logs" aria-label="Logs da empresa" aria-busy={loading}>
      <div className="company-logs-head">
        <div>
          <h3>Logs da empresa</h3>
          <p className="muted">WhatsApp, erros e eventos operacionais dos últimos 90 dias.</p>
        </div>
        <button type="button" className="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      <div className="log-summary-grid">
        <div className="log-kpi"><span>Erros</span><strong>{summary?.errors ?? 0}</strong><small>no período</small></div>
        <div className="log-kpi"><span>Avisos</span><strong>{summary?.warnings ?? 0}</strong><small>no período</small></div>
        <div className="log-kpi"><span>WhatsApp entregue</span><strong>{summary?.whatsappDelivered ?? 0}</strong><small>mensagens</small></div>
        <div className="log-kpi"><span>WhatsApp pendente</span><strong>{summary?.whatsappPending ?? 0}</strong><small>fila atual</small></div>
        <div className="log-kpi"><span>Status WhatsApp</span><Badge tone={whatsappTone as any}>{statusLabel(summary?.whatsappStatus?.status)}</Badge><small>{summary?.whatsappStatus?.phone || "—"}</small></div>
      </div>

      {summary?.lastError && (
        <div className="log-last-error" role="status">
          <strong>Último erro:</strong> {summary.lastError} <span>{formatDate(summary.lastErrorAt)}</span>
        </div>
      )}

      <div className="log-range-tabs" aria-label="Período dos logs">
        {ranges.map((item) => (
          <button key={item.id} type="button" className={range === item.id ? "active" : ""} onClick={() => { setRange(item.id); setPage(1); }}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="log-filters">
        <label>Nível<select value={level} onChange={(e) => { setLevel(e.target.value as Level); setPage(1); }}>{levels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Módulo<select value={module} onChange={(e) => { setModule(e.target.value as Module); setPage(1); }}>{modules.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <span className="muted log-total">{data.total} registro(s)</span>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="table-wrap log-table-wrap">
        <table>
          <thead><tr><th>Data/Hora</th><th>Nível</th><th>Módulo</th><th>Evento</th><th>Descrição</th><th>Destinatário</th><th>Detalhes</th></tr></thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr><td colSpan={7} className="muted">{loading ? "Carregando logs…" : "Nenhum log encontrado para os filtros selecionados."}</td></tr>
            ) : data.items.map((row) => (
              <tr key={row.id}>
                <td className="log-date">{formatDate(row.created_at)}</td>
                <td><Badge tone={row.level === "ERROR" ? "danger" : row.level === "WARNING" ? "warning" : "neutral"}>{row.level === "ERROR" ? "Erro" : row.level === "WARNING" ? "Aviso" : "Info"}</Badge></td>
                <td>{modules.find((item) => item.id === row.module)?.label || row.module}</td>
                <td><code>{row.event_type}</code></td>
                <td>{row.message}</td>
                <td>{row.recipient || "—"}</td>
                <td>{row.details ? <details><summary>Ver detalhes</summary><pre className="log-details">{JSON.stringify(row.details, null, 2)}</pre></details> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="log-pagination">
        <button type="button" className="ghost" disabled={page <= 1 || loading} onClick={() => setPage((v) => Math.max(1, v - 1))}>← Anterior</button>
        <span>Página {page} de {data.pages || 1}</span>
        <button type="button" className="ghost" disabled={page >= (data.pages || 1) || loading} onClick={() => setPage((v) => v + 1)}>Próxima →</button>
      </div>
    </section>
  );
}
