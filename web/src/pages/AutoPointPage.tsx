import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { PageHeader } from "../components/Ui";
import { apiMessage, brDateTime } from "../utils";
import type { Company } from "../types";

type AutoPointSettings = {
  enabled: boolean;
  scanIntervalSeconds: number;
  resultDisplaySeconds: number;
  cooldownSeconds: number;
};
type Terminal = {
  id: number;
  name: string;
  active: number | boolean;
  activated_at?: string | null;
  last_seen_at?: string | null;
  activation_expires_at?: string | null;
};

const defaults: AutoPointSettings = {
  enabled: false,
  scanIntervalSeconds: 3,
  resultDisplaySeconds: 3,
  cooldownSeconds: 10,
};

export function AutoPointPage({
  notify,
}: {
  notify: (message: string, type?: "ok" | "error") => void;
}) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [settings, setSettings] = useState<AutoPointSettings>(defaults);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [faces, setFaces] = useState({ photos: 0, indexed: 0 });
  const [terminalName, setTerminalName] = useState("");
  const [activationCode, setActivationCode] = useState<string | null>(null);
  const [activationTerminal, setActivationTerminal] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const selected = useMemo(
    () => companies.find((c) => String(c.id) === companyId),
    [companies, companyId],
  );

  async function loadCompanies() {
    const { data } = await api.get<Company[]>("/companies");
    const active = data.filter((c) => Boolean(c.active));
    setCompanies(active);
    setCompanyId((current) => current || String(active[0]?.id || ""));
  }

  async function loadCompany(id = companyId) {
    if (!id) return;
    const [config, terminalList] = await Promise.all([
      api.get(`/autopoint/admin/settings/${id}`),
      api.get(`/autopoint/admin/terminals/${id}`),
    ]);
    setSettings(config.data.settings || defaults);
    setFaces(config.data.faces || { photos: 0, indexed: 0 });
    setTerminals(terminalList.data || []);
  }

  useEffect(() => {
    setLoading(true);
    loadCompanies()
      .catch((error) => notify(apiMessage(error), "error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    setActivationCode(null);
    loadCompany(companyId)
      .catch((error) => notify(apiMessage(error), "error"))
      .finally(() => setLoading(false));
  }, [companyId]);

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    if (!companyId || busy) return;
    setBusy(true);
    try {
      const { data } = await api.put(
        `/autopoint/admin/settings/${companyId}`,
        settings,
      );
      setSettings(data.settings);
      notify("Configurações do AutoPonto salvas.");
      await loadCompany();
    } catch (error) {
      notify(apiMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function createTerminal(event: React.FormEvent) {
    event.preventDefault();
    if (!companyId || !terminalName.trim() || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post("/autopoint/admin/terminals", {
        companyId: Number(companyId),
        name: terminalName.trim(),
      });
      setActivationCode(data.activationCode);
      setActivationTerminal(data.name);
      setTerminalName("");
      notify("Terminal criado. Use o código no aparelho em até 15 minutos.");
      await loadCompany();
    } catch (error) {
      notify(apiMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function newCode(terminal: Terminal) {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(
        `/autopoint/admin/terminals/${terminal.id}/activation-code`,
      );
      setActivationCode(data.activationCode);
      setActivationTerminal(terminal.name);
      notify("Novo código gerado. O vínculo anterior foi invalidado.");
      await loadCompany();
    } catch (error) {
      notify(apiMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTerminal(terminal: Terminal) {
    if (busy) return;
    if (!Boolean(terminal.active)) {
      await newCode(terminal);
      return;
    }
    setBusy(true);
    try {
      await api.patch(`/autopoint/admin/terminals/${terminal.id}`, {
        active: false,
      });
      notify("Terminal revogado. O vínculo armazenado no aparelho deixou de funcionar.");
      await loadCompany();
    } catch (error) {
      notify(apiMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function reindex() {
    if (!companyId || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/autopoint/admin/reindex/${companyId}`);
      notify(
        `Rostos sincronizados: ${data.indexed}/${data.total}${data.failed?.length ? ` · ${data.failed.length} falha(s)` : ""}`,
        data.failed?.length ? "error" : "ok",
      );
      await loadCompany();
    } catch (error) {
      notify(apiMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="AutoPonto"
        subtitle="Transforme um celular ou tablet em um relógio de ponto facial compartilhado"
      />

      <section className="panel autopoint-hero">
        <div>
          <span className="eyebrow">RECONHECIMENTO FACIAL · AWS</span>
          <h2>Terminal facial da empresa</h2>
          <p>
            O funcionário apenas posiciona o rosto. O Ponto Certo identifica,
            consulta a jornada e registra a próxima marcação automaticamente.
          </p>
        </div>
        <label className="autopoint-company-select">
          Empresa
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.trade_name || company.legal_name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {activationCode && (
        <section className="panel autopoint-code-card" role="status">
          <div>
            <span className="eyebrow">CÓDIGO TEMPORÁRIO · {activationTerminal}</span>
            <h2>{activationCode}</h2>
            <p>Digite este código na opção AutoPonto da tela de login. Expira em 15 minutos.</p>
          </div>
          <button className="ghost" onClick={() => setActivationCode(null)}>
            Ocultar código
          </button>
        </section>
      )}

      <div className="autopoint-grid">
        <form className="panel form-grid" onSubmit={saveSettings}>
          <div className="section-label span-2">Funcionamento</div>
          <label className="checkbox-row span-2">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            />
            Habilitar AutoPonto nesta empresa
          </label>
          <label>
            Intervalo para escanear (segundos)
            <input
              type="number"
              min={1}
              max={10}
              value={settings.scanIntervalSeconds}
              onChange={(e) => setSettings({ ...settings, scanIntervalSeconds: Number(e.target.value) })}
            />
          </label>
          <label>
            Tempo para voltar à câmera (segundos)
            <input
              type="number"
              min={1}
              max={10}
              value={settings.resultDisplaySeconds}
              onChange={(e) => setSettings({ ...settings, resultDisplaySeconds: Number(e.target.value) })}
            />
          </label>
          <label>
            Proteção contra ponto duplicado (segundos)
            <input
              type="number"
              min={5}
              max={120}
              value={settings.cooldownSeconds}
              onChange={(e) => setSettings({ ...settings, cooldownSeconds: Number(e.target.value) })}
            />
          </label>
          <div className="autopoint-face-status">
            <strong>{faces.indexed}/{faces.photos}</strong>
            <span>rostos indexados</span>
          </div>
          <div className="form-actions span-2">
            <button type="button" className="secondary" disabled={busy || !companyId} onClick={reindex}>
              Sincronizar rostos cadastrados
            </button>
            <button className="primary" disabled={busy || !companyId}>
              {busy ? "Aguarde…" : "Salvar AutoPonto"}
            </button>
          </div>
        </form>

        <section className="panel">
          <div className="section-label">Novo terminal</div>
          <form className="autopoint-terminal-form" onSubmit={createTerminal}>
            <label>
              Nome do aparelho/local
              <input
                value={terminalName}
                onChange={(e) => setTerminalName(e.target.value)}
                placeholder="Ex.: Portaria Obra Recife"
                maxLength={120}
              />
            </label>
            <button className="primary" disabled={busy || !companyId || !terminalName.trim()}>
              Criar terminal e gerar código
            </button>
          </form>
          <div className="info-box">
            O aparelho recebe apenas uma credencial de AutoPonto. Ele não terá acesso ao painel administrativo.
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="autopoint-section-head">
          <div>
            <div className="section-label">Terminais de {selected?.trade_name || selected?.legal_name || "empresa"}</div>
            <p>{loading ? "Atualizando…" : `${terminals.length} terminal(is) cadastrado(s)`}</p>
          </div>
        </div>
        <div className="autopoint-terminals">
          {terminals.length === 0 && !loading ? (
            <div className="empty-state">Nenhum terminal AutoPonto cadastrado.</div>
          ) : (
            terminals.map((terminal) => (
              <article className="autopoint-terminal-row" key={terminal.id}>
                <div className={`autopoint-terminal-dot ${Boolean(terminal.active) ? "active" : ""}`} />
                <div>
                  <strong>{terminal.name}</strong>
                  <span>
                    {terminal.activated_at ? "Ativado" : "Aguardando ativação"}
                    {terminal.last_seen_at ? ` · Último acesso ${brDateTime(terminal.last_seen_at)}` : ""}
                  </span>
                </div>
                <div className="autopoint-terminal-actions">
                  <button className="secondary" disabled={busy} onClick={() => newCode(terminal)}>
                    Novo código
                  </button>
                  <button className={Boolean(terminal.active) ? "danger" : "secondary"} disabled={busy} onClick={() => toggleTerminal(terminal)}>
                    {Boolean(terminal.active) ? "Revogar" : "Gerar código para reativar"}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </>
  );
}
