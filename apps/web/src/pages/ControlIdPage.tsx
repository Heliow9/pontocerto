import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { PageHeader } from "../components/Ui";
import type { Company } from "../types";
import { apiMessage, brDateTime } from "../utils";
import { buildControlIdDeviceUrls } from "../control-id-url";

type Terminal = {
  id: number;
  name: string;
  serial_number: string;
  vendor_device_id: string;
  active: boolean;
  status: "PENDING" | "ONLINE" | "OFFLINE" | "ERROR" | "DISABLED";
  last_push_at?: string | null;
  last_monitor_at?: string | null;
  last_event_at?: string | null;
  synced: number;
  pending: number;
  errors: number;
  quarantined: number;
};

type EmployeeDiagnostic = {
  employeeId: number;
  name: string;
  registration?: string | null;
  status: "READY" | "PROCESSING" | "SYNCED" | "ACTION_REQUIRED" | "REMOVING";
  code: string;
  stage: string;
  summary: string;
  technicalMessage?: string | null;
  action: string;
  attempts: number;
  updatedAt?: string | null;
};

const diagnosticLabels: Record<EmployeeDiagnostic["status"], string> = {
  READY: "Pronto",
  PROCESSING: "Processando",
  SYNCED: "Sincronizado",
  ACTION_REQUIRED: "Ação necessária",
  REMOVING: "Removendo",
};

export function ControlIdPage({
  notify,
  role,
}: {
  notify: (message: string, type?: "ok" | "error") => void;
  role?: string;
}) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [diagnostics, setDiagnostics] = useState<EmployeeDiagnostic[]>([]);
  const [form, setForm] = useState({ name: "Recepção", serialNumber: "", vendorDeviceId: "" });
  const [credential, setCredential] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const company = useMemo(
    () => companies.find((item) => String(item.id) === companyId),
    [companies, companyId],
  );
  const apiBase = String(api.defaults.baseURL || location.origin).replace(/\/$/, "");
  const deviceUrls = useMemo(
    () => credential ? buildControlIdDeviceUrls(apiBase, credential, location.origin) : null,
    [apiBase, credential],
  );

  async function copyConfiguration(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${label} copiado.`);
    } catch {
      notify(`Não foi possível copiar ${label.toLowerCase()}. Selecione o valor manualmente.`, "error");
    }
  }

  async function loadCompanies() {
    const { data } = await api.get<Company[]>("/companies");
    const active = data.filter((item) => Boolean(item.active));
    setCompanies(active);
    setCompanyId((current) => current || String(active[0]?.id || ""));
  }

  async function loadTerminal(id = companyId) {
    if (!id) return;
    const { data } = await api.get(`/control-id/admin/companies/${id}`);
    setTerminal(data.terminal || null);
    setDiagnostics(data.diagnostics || []);
    setLastRefresh(new Date());
  }

  useEffect(() => {
    loadCompanies()
      .catch((error) => notify(apiMessage(error), "error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!companyId) return;
    let mounted = true;
    let running = false;
    setLoading(true);
    setCredential(null);
    const refresh = async (reportError: boolean) => {
      if (running) return;
      running = true;
      try {
        const { data } = await api.get(`/control-id/admin/companies/${companyId}`);
        if (!mounted) return;
        setTerminal(data.terminal || null);
        setDiagnostics(data.diagnostics || []);
        setLastRefresh(new Date());
      } catch (error) {
        if (mounted && reportError) notify(apiMessage(error), "error");
      } finally {
        running = false;
        if (mounted) setLoading(false);
      }
    };
    void refresh(true);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(false);
    }, 5000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [companyId]);

  async function refreshNow() {
    if (!companyId || refreshing) return;
    setRefreshing(true);
    try {
      await loadTerminal(companyId);
    } catch (error) {
      notify(apiMessage(error), "error");
    } finally {
      setRefreshing(false);
    }
  }

  async function createTerminal(event: React.FormEvent) {
    event.preventDefault();
    if (!companyId || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post("/control-id/admin/terminals", {
        companyId: Number(companyId),
        name: form.name,
        serialNumber: form.serialNumber,
        vendorDeviceId: form.vendorDeviceId,
      });
      setCredential(data.credential);
      notify("Equipamento criado. Guarde a credencial antes de sair desta tela.");
      await loadTerminal();
    } catch (error) {
      notify(apiMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function syncEmployees() {
    if (!companyId || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/control-id/admin/companies/${companyId}/sync`);
      notify(`${data.queued} de ${data.eligible} funcionário(s) colocado(s) na fila.`);
      await loadTerminal();
    } catch (error) {
      notify(apiMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function rotateCredential() {
    if (!terminal || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/control-id/admin/terminals/${terminal.id}/rotate`);
      setCredential(data.credential);
      notify("Credencial substituída. Atualize o equipamento agora.");
      await loadTerminal();
    } catch (error) {
      notify(apiMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function disableTerminal() {
    if (!terminal || busy) return;
    setBusy(true);
    try {
      await api.patch(`/control-id/admin/terminals/${terminal.id}`, { active: false });
      setCredential(null);
      notify("Equipamento desativado.");
      await loadTerminal();
    } catch (error) {
      notify(apiMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function enableTerminal() {
    if (!terminal || busy) return;
    setBusy(true);
    try {
      await api.patch(`/control-id/admin/terminals/${terminal.id}`, { active: true });
      notify("Equipamento reativado. Sincronize os funcionários e confirme a credencial configurada.");
      await loadTerminal();
    } catch (error) {
      notify(apiMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Equipamentos Control iD"
        subtitle="Sincronização facial e recebimento de marcações do iDFace por Push + Monitor"
      />

      <section className="panel autopoint-hero">
        <div>
          <span className="eyebrow">IDFACE · RECONHECIMENTO FACIAL</span>
          <h2>Um equipamento dedicado por empresa</h2>
          <p>O Ponto Certo envia funcionários e fotos; o iDFace devolve as marcações realizadas.</p>
        </div>
        <label className="autopoint-company-select">
          Empresa
          <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
            {companies.map((item) => (
              <option key={item.id} value={item.id}>{item.trade_name || item.legal_name}</option>
            ))}
          </select>
        </label>
      </section>

      {credential && deviceUrls && (
        <section className="panel autopoint-code-card" role="status">
          <div>
            <span className="eyebrow">CONFIGURAÇÃO SECRETA EXIBIDA UMA ÚNICA VEZ</span>
            <h3>Preencha o iDFace antes de fechar</h3>
            <p><strong>Endereço do servidor no iDCloud:</strong></p>
            <p><code style={{ wordBreak: "break-all" }}>{deviceUrls.pushServer}</code></p>
            <button className="secondary" onClick={() => copyConfiguration(deviceUrls.pushServer, "Endereço do iDCloud")}>Copiar endereço</button>
            <p><strong>Período:</strong> <code>5</code> segundos</p>
            <p><strong>Host do Monitor:</strong> <code>{deviceUrls.monitorHost}</code> · <strong>Porta:</strong> <code>{deviceUrls.monitorPort}</code></p>
            <p><strong>Caminho do Monitor:</strong></p>
            <p><code style={{ wordBreak: "break-all" }}>{deviceUrls.monitorPath}</code></p>
            <button className="secondary" onClick={() => copyConfiguration(deviceUrls.monitorPath, "Caminho do Monitor")}>Copiar caminho</button>
            <p className="info-box">Esta URL contém a credencial do equipamento. Não compartilhe, não envie em capturas e não grave em logs. Depois de fechar, somente uma troca de credencial exibirá outra URL.</p>
          </div>
          <button className="ghost" onClick={() => setCredential(null)}>Já guardei</button>
        </section>
      )}

      {!terminal && !loading ? (
        role === "TENANT_ADMIN" ? <form className="panel form-grid" onSubmit={createTerminal}>
          <div className="section-label span-2">Cadastrar iDFace de {company?.trade_name || company?.legal_name}</div>
          <label>
            Nome/local
            <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label>
            Número de série
            <input required value={form.serialNumber} onChange={(event) => setForm({ ...form, serialNumber: event.target.value })} placeholder="0M0600/0110EB" />
          </label>
          <label>
            ID numérico do equipamento
            <input required inputMode="numeric" value={form.vendorDeviceId} onChange={(event) => setForm({ ...form, vendorDeviceId: event.target.value.replace(/\D/g, "") })} placeholder="Ex.: 478435" />
          </label>
          <div className="info-box">
            Use o ID exibido nas informações do dispositivo. Ele deve coincidir com o parâmetro <code>deviceId</code> enviado pelo Push.
          </div>
          <div className="form-actions span-2">
            <button className="primary" disabled={busy || !companyId}>{busy ? "Criando…" : "Criar equipamento"}</button>
          </div>
        </form> : <section className="panel">Nenhum equipamento Control iD cadastrado para esta empresa.</section>
      ) : terminal ? (
        <>
          <section className="panel">
            <div className="autopoint-section-head">
              <div>
                <span className="eyebrow">{terminal.status}</span>
                <h2>{terminal.name}</h2>
                <p>Série {terminal.serial_number} · Device ID {terminal.vendor_device_id}</p>
              </div>
              {role === "TENANT_ADMIN" && (
                <div className="form-actions">
                  {terminal.active ? (
                    <>
                      <button className="secondary" disabled={busy} onClick={syncEmployees}>Sincronizar funcionários</button>
                      <button className="secondary" disabled={busy} onClick={rotateCredential}>Trocar credencial</button>
                      <button className="danger" disabled={busy} onClick={disableTerminal}>Desativar</button>
                    </>
                  ) : (
                    <button className="primary" disabled={busy} onClick={enableTerminal}>Reativar equipamento</button>
                  )}
                </div>
              )}
            </div>
            <div className="dashboard-kpis">
              <div className="kpi"><strong>{terminal.synced}</strong><span>sincronizados</span></div>
              <div className="kpi"><strong>{terminal.pending}</strong><span>pendentes</span></div>
              <div className="kpi"><strong>{terminal.errors}</strong><span>com erro</span></div>
              <div className="kpi"><strong>{terminal.quarantined}</strong><span>em quarentena</span></div>
            </div>
            <div className="info-box">
              Push: {terminal.last_push_at ? brDateTime(terminal.last_push_at) : "aguardando"} · Monitor: {terminal.last_monitor_at ? brDateTime(terminal.last_monitor_at) : "aguardando"} · Última marcação: {terminal.last_event_at ? brDateTime(terminal.last_event_at) : "nenhuma"}
            </div>
          </section>
          <section className="panel" aria-live="polite">
            <div className="autopoint-section-head">
              <div>
                <span className="eyebrow">DIAGNÓSTICO DA SINCRONIZAÇÃO</span>
                <h2>Situação por funcionário</h2>
                <p>Atualização automática a cada 5 segundos{lastRefresh ? ` · última consulta ${lastRefresh.toLocaleTimeString("pt-BR")}` : ""}.</p>
              </div>
              <button className="secondary" disabled={refreshing} onClick={refreshNow}>
                {refreshing ? "Atualizando…" : "Atualizar agora"}
              </button>
            </div>
            {diagnostics.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Funcionário</th>
                      <th>Situação</th>
                      <th>Etapa</th>
                      <th>Diagnóstico e correção</th>
                      <th>Tentativas</th>
                      <th>Atualizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnostics.map((item) => (
                      <tr key={item.employeeId}>
                        <td><strong>{item.name}</strong><br /><small>Matrícula {item.registration || item.employeeId}</small></td>
                        <td><strong>{diagnosticLabels[item.status]}</strong><br /><small>{item.code}</small></td>
                        <td>{item.stage}</td>
                        <td>
                          <strong>{item.summary}</strong>
                          <p>{item.action}</p>
                          {item.technicalMessage && (
                            <details>
                              <summary>Detalhe técnico informado pelo iDFace</summary>
                              <code style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{item.technicalMessage}</code>
                            </details>
                          )}
                        </td>
                        <td>{item.attempts}</td>
                        <td>{item.updatedAt ? brDateTime(item.updatedAt) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="info-box">Nenhum funcionário cadastrado nesta empresa. Cadastre um funcionário ativo e salve a foto facial.</div>
            )}
          </section>
          <section className="panel">
            <div className="section-label">Configuração no iDFace</div>
            <p>A URL secreta é mostrada somente ao criar ou trocar a credencial. Se ainda não configurou o aparelho, clique em <strong>Trocar credencial</strong>.</p>
            <p>Firmwares com Bearer Token também podem continuar usando os endpoints nativos da API.</p>
            <p>Ative o Modo Ponto sem tipos personalizados e deixe apenas o leitor facial habilitado.</p>
          </section>
        </>
      ) : (
        <section className="panel">Carregando equipamento…</section>
      )}
    </>
  );
}
