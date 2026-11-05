import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { PageHeader } from "../components/Ui";
import type { Company } from "../types";
import { apiMessage, brDateTime } from "../utils";

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
  const [form, setForm] = useState({ name: "Recepção", serialNumber: "", vendorDeviceId: "" });
  const [credential, setCredential] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const company = useMemo(
    () => companies.find((item) => String(item.id) === companyId),
    [companies, companyId],
  );
  const apiBase = String(api.defaults.baseURL || location.origin).replace(/\/$/, "");

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
  }

  useEffect(() => {
    loadCompanies()
      .catch((error) => notify(apiMessage(error), "error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    setCredential(null);
    loadTerminal(companyId)
      .catch((error) => notify(apiMessage(error), "error"))
      .finally(() => setLoading(false));
  }, [companyId]);

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

      {credential && (
        <section className="panel autopoint-code-card" role="status">
          <div>
            <span className="eyebrow">CREDENCIAL EXIBIDA UMA ÚNICA VEZ</span>
            <h3 style={{ wordBreak: "break-all" }}>{credential}</h3>
            <p>Configure como Bearer token no Push e no Monitor. Não será possível consultar este valor novamente.</p>
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
          <section className="panel">
            <div className="section-label">Configuração no iDFace</div>
            <p><strong>Push:</strong> <code>{apiBase}/push</code></p>
            <p><strong>Resultado:</strong> <code>{apiBase}/result</code></p>
            <p><strong>Monitor:</strong> host e porta da API; caminho <code>control-id/monitor</code>.</p>
            <p>Ative o Modo Ponto sem tipos personalizados e deixe apenas o leitor facial habilitado.</p>
          </section>
        </>
      ) : (
        <section className="panel">Carregando equipamento…</section>
      )}
    </>
  );
}
