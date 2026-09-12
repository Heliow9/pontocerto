import { useEffect, useState } from "react";
import { api } from "../api";
import { apiMessage } from "../utils";
type Recipient = { name: string; phone: string };
type Settings = {
  overtimeEnabled: boolean;
  remoteEnabled: boolean;
  offlineEnabled: boolean;
  recipients: Recipient[];
  whatsappEnabled?: boolean;
  whatsapp?: any;
  alerts?: any[];
};
const labels: Record<string, string> = {
  DISCONNECTED: "Desconectado",
  CONNECTING: "Conectando",
  CONNECTED: "Conectado",
  QR: "Escaneie o QR Code",
  ERROR: "Falha de conexão",
  AUTH_ERROR: "Falha ao salvar sessão",
  PENDING: "Na fila",
  SENDING: "Enviando",
  SENT: "Enviado",
  DELIVERED: "Entregue",
  UNKNOWN: "Envio não confirmado",
  CANCELED: "Cancelado",
  EXPIRED: "Competência encerrada",
};
export function CompanyAutomation({ id }: { id: number }) {
  const [data, setData] = useState<Settings | null>(null),
    [status, setStatus] = useState<any>(null),
    [alerts, setAlerts] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [summary, setSummary] = useState<any[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  useEffect(() => {
    let live = true;
    setData(null);
    setMessage("");
    const load = async (initial = false) => {
      try {
        const { data: d } = await api.get(`/automation/companies/${id}`);
        if (live) {
          if (initial) setData(d);
          setStatus(d.whatsapp);
          setAlerts(d.alerts || []);
        }
      } catch (e) {
        if (live) setMessage(apiMessage(e));
      }
    };
    void load(true);
    const timer = setInterval(() => void load(), 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [id]);
  async function action(path: string, body?: unknown) {
    setBusy(true);
    setMessage("");
    try {
      if (path === "save") await api.put(`/automation/companies/${id}`, body);
      else await api.post(`/automation/companies/${id}/whatsapp/${path}`);
      setMessage(
        path === "save"
          ? "Configurações salvas."
          : "Solicitação recebida. Aguarde a atualização do status.",
      );
    } catch (e) {
      setMessage(apiMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function report() {
    setBusy(true);
    try {
      const { data: d } = await api.get(`/automation/companies/${id}/summary`, {
        params: { month },
      });
      setSummary(d);
    } catch (e) {
      setMessage(apiMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="card company-automation"
      style={{ marginTop: 20 }}
      aria-label="Automação da empresa"
      aria-busy={busy}
    >
      <h3>Horas extras, WhatsApp e ponto remoto</h3>
      {!data ? (
        <p role="status">{message || "Carregando configurações…"}</p>
      ) : (
        <>
          <label>
            <input
              type="checkbox"
              checked={data.overtimeEnabled}
              onChange={(e) =>
                setData({ ...data, overtimeEnabled: e.target.checked })
              }
            />{" "}
            Ativar acompanhamento mensal e alertas de horas extras
          </label>
          <p>
            Configure a quantidade no grupo ou funcionário. Avisos em 50%, 100%
            e ao ultrapassar 100%, sem bloquear o ponto. Os avisos consideram os
            registros apurados; cada marco é avisado uma vez por mês e
            destinatário.
          </p>
          <label>
            <input
              type="checkbox"
              checked={data.remoteEnabled}
              onChange={(e) =>
                setData({
                  ...data,
                  remoteEnabled: e.target.checked,
                  offlineEnabled: e.target.checked && data.offlineEnabled,
                })
              }
            />{" "}
            Permitir ponto de qualquer lugar, sem exigir GPS ou janela da
            jornada, com selfie e segurança do aparelho
          </label>
          <label>
            <input
              type="checkbox"
              disabled={!data.remoteEnabled}
              checked={data.offlineEnabled}
              onChange={(e) =>
                setData({ ...data, offlineEnabled: e.target.checked })
              }
            />{" "}
            Permitir capturar offline e enviar depois (PWA e Android)
          </label>
          <p>
            Offline exige acesso prévio com internet. O horário vem do aparelho
            e fica identificado na conferência. As exigências de vínculo e
            biometria continuam valendo; biometria nativa exige Android.
          </p>
          <h4>Quem recebe os alertas pelo WhatsApp</h4>
          {data.recipients.map((r, index) => (
            <div key={index} className="form-grid">
              <label>
                Nome do destinatário
                <input
                  value={r.name}
                  onChange={(e) =>
                    setData({
                      ...data,
                      recipients: data.recipients.map((v, i) =>
                        i === index ? { ...v, name: e.target.value } : v,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Telefone com DDI e DDD
                <input
                  placeholder="5511999999999"
                  value={r.phone}
                  onChange={(e) =>
                    setData({
                      ...data,
                      recipients: data.recipients.map((v, i) =>
                        i === index
                          ? { ...v, phone: e.target.value.replace(/\D/g, "") }
                          : v,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  setData({
                    ...data,
                    recipients: data.recipients.filter((_, i) => i !== index),
                  })
                }
              >
                Remover destinatário
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary"
            disabled={data.recipients.length >= 20}
            onClick={() =>
              setData({
                ...data,
                recipients: [...data.recipients, { name: "", phone: "" }],
              })
            }
          >
            Adicionar destinatário
          </button>{" "}
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              void action("save", {
                overtimeEnabled: data.overtimeEnabled,
                remoteEnabled: data.remoteEnabled,
                offlineEnabled: data.offlineEnabled,
                recipients: data.recipients,
              })
            }
          >
            Salvar automação da empresa
          </button>
          <h4>Conexão WhatsApp</h4>
          <p>
            {labels[status?.status] || "Desconectado"}{" "}
            {status?.phone ? `· ${status.phone}` : ""}
          </p>
          {!status?.ready && (
            <p>Serviço aguardando configuração no servidor.</p>
          )}
          {status?.qr && (
            <img
              src={status.qr}
              alt="QR Code para conectar o WhatsApp desta empresa"
              width="240"
              height="240"
            />
          )}
          <p>
            No WhatsApp, abra Aparelhos conectados → Conectar aparelho. A
            conexão usa Baileys e pode exigir novo pareamento. Ao conectar, os
            alertas serão enviados aos números salvos acima.
          </p>
          <button
            type="button"
            className="secondary"
            disabled={busy || !status?.ready}
            onClick={() => void action("connect")}
          >
            Conectar WhatsApp
          </button>{" "}
          <button
            type="button"
            className="ghost"
            disabled={busy || !status?.ready}
            onClick={() => void action("disconnect")}
          >
            Desconectar WhatsApp
          </button>
          {message && <p role="status">{message}</p>}
          <h4>Acompanhamento mensal</h4>
          <label>
            Competência
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void report()}
          >
            Atualizar totalizador
          </button>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Funcionário</th>
                  <th>Grupo</th>
                  <th>Horas extras</th>
                  <th>Referência</th>
                  <th>Percentual</th>
                  <th>Origem</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.group_name || "—"}</td>
                    <td>{(Number(r.overtime_minutes) / 60).toFixed(2)} h</td>
                    <td>
                      {r.reference_minutes == null
                        ? "Não configurada"
                        : `${Number(r.reference_minutes) / 60} h`}
                    </td>
                    <td>
                      {r.reference_minutes
                        ? `${Math.floor((Number(r.overtime_minutes) / Number(r.reference_minutes)) * 100)}%`
                        : "—"}
                    </td>
                    <td>
                      {r.reference_minutes == null
                        ? "—"
                        : r.reference_source === "INDIVIDUAL"
                          ? "Individual"
                          : "Grupo"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4>Últimos alertas</h4>
          <p>
            “Enviado” indica aceitação pelo serviço. “Entregue” depende de
            confirmação do WhatsApp. Envios incertos não são repetidos
            automaticamente.
          </p>
          {alerts.length === 0 ? (
            <p>Nenhum alerta registrado.</p>
          ) : (
            <div style={{ maxHeight: 300, overflow: "auto" }}>
              {alerts.map((a) => (
                <details key={a.id}>
                  <summary>
                    {a.month_key} · {a.recipient} ·{" "}
                    {a.threshold_key === "OVER"
                      ? "Ultrapassou"
                      : `${a.threshold_key}%`}{" "}
                    · {labels[a.status] || a.status}
                  </summary>
                  <p style={{ whiteSpace: "pre-wrap" }}>{a.message_text}</p>
                </details>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
