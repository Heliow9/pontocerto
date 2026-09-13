import makeWASocket, {
  BufferJSON,
  DisconnectReason,
  initAuthCreds,
  generateMessageIDV2,
  proto,
  type AuthenticationState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import { createHash } from "node:crypto";
import { pool } from "../db/pool.js";
import { encryptSession, decryptSession } from "./whatsapp-crypto.js";
import { writeSystemLog } from "./system-log.service.js";
import {
  consolidateOvertimeAlertMessage,
  receiptState,
  retryDelaySeconds,
  WHATSAPP_MAX_MESSAGES_PER_HOUR,
  WHATSAPP_MIN_RECIPIENT_INTERVAL_SECONDS,
} from "./whatsapp-delivery-rules.js";

type Connection = {
  socket?: ReturnType<typeof makeWASocket>;
  status: string;
  qr: string | null;
  phone?: string;
  next: number;
  stopped: boolean;
  writes: Promise<unknown>;
};
const connections = new Map<string, Connection>();
const key = () => process.env.WHATSAPP_ENCRYPTION_KEY || "";
let leader: any = null,
  busy = false;
export const whatsappReady = () =>
  /^[a-f0-9]{64}$/i.test(key()) && Boolean(leader);
export function whatsappStatus(tenant: number, company: number) {
  const c = connections.get(`${tenant}:${company}`);
  return {
    ready: whatsappReady(),
    status: c?.status || "DISCONNECTED",
    qr: c?.qr || null,
    phone: c?.phone || null,
  };
}
function logWhatsApp(tenantId: number, companyId: number, eventType: string, message: string, options: { level?: "INFO" | "WARNING" | "ERROR"; recipient?: string | null; employeeId?: number | null; details?: unknown } = {}) {
  void writeSystemLog({
    tenantId,
    companyId,
    level: options.level || "INFO",
    module: "WHATSAPP",
    eventType,
    message,
    recipient: options.recipient || null,
    employeeId: options.employeeId || null,
    details: options.details,
  });
}
async function connect(tenant: number, company: number) {
  const identity = `${tenant}:${company}`,
    previous = connections.get(identity);
  if (
    previous &&
    (previous.status === "CONNECTED" ||
      previous.status === "CONNECTING" ||
      previous.status === "QR" ||
      previous.next > Date.now())
  )
    return;
  if (previous) {
    // Pairing commonly closes once with restartRequired. Flush the credentials
    // written by Baileys before creating the replacement socket.
    await previous.writes.catch(() => {});
    previous.stopped = true;
    previous.socket?.end(undefined);
  }
  const c: Connection = {
    status: "CONNECTING",
    qr: null,
    next: 0,
    stopped: false,
    writes: Promise.resolve(),
  };
  connections.set(identity, c);
  const authKey = (category: string, id: string) =>
    createHash("sha256").update(`${category}:${id}`).digest("hex");
  const read = async (name: string) => {
    const [rows] = await pool.query<any[]>(
      "SELECT encrypted_value FROM whatsapp_auth WHERE tenant_id=? AND company_id=? AND auth_key=?",
      [tenant, company, name],
    );
    return rows[0]
      ? JSON.parse(
          decryptSession(rows[0].encrypted_value, key()),
          BufferJSON.reviver,
        )
      : null;
  };
  const rawWrite = async (name: string, value: any) => {
    if (c.stopped) return;
    if (value == null)
      await pool.query(
        "DELETE FROM whatsapp_auth WHERE tenant_id=? AND company_id=? AND auth_key=?",
        [tenant, company, name],
      );
    else
      await pool.query(
        "INSERT INTO whatsapp_auth(tenant_id,company_id,auth_key,encrypted_value) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE encrypted_value=VALUES(encrypted_value)",
        [
          tenant,
          company,
          name,
          encryptSession(JSON.stringify(value, BufferJSON.replacer), key()),
        ],
      );
  };
  const write = (name: string, value: any) => {
    const pending = c.writes.then(() => rawWrite(name, value));
    c.writes = pending.catch(() => {});
    return pending;
  };
  const creds = (await read("creds")) || initAuthCreds();
  const auth: AuthenticationState = {
    creds,
    keys: {
      get: async (type, ids) => {
        const values: any = {};
        for (const id of ids) {
          let value = await read(authKey(type, id));
          if (type === "app-state-sync-key" && value)
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          if (value != null) values[id] = value;
        }
        return values;
      },
      set: async (data) => {
        for (const [category, items] of Object.entries(data))
          for (const [id, value] of Object.entries(items || {}))
            await write(authKey(category, id), value);
      },
    },
  };
  if (c.stopped) return;
  const socket = makeWASocket({
    auth,
    logger: pino({ level: "silent" }),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    getMessage: async () => undefined,
  });
  c.socket = socket;
  socket.ev.on("creds.update", () => {
    void write("creds", creds).catch(() => {
      c.status = "AUTH_ERROR";
      socket.end(new Error("AUTH_STORAGE_FAILED"));
    });
  });
  socket.ev.on("connection.update", (update) => {
    void (async () => {
      if (c.stopped) return;
      if (update.connection === "connecting" && c.status !== "QR")
        c.status = "CONNECTING";
      if (update.qr) {
        const qr = await QRCode.toDataURL(update.qr);
        if (
          c.stopped ||
          c.socket !== socket ||
          ["CONNECTED", "RECONNECTING", "LOGGED_OUT"].includes(c.status)
        )
          return;
        c.qr = qr;
        c.status = "QR";
      }
      if (update.connection === "open") {
        await c.writes.catch(() => {});
        c.qr = null;
        c.next = 0;
        c.status = "CONNECTED";
        c.phone = socket.user?.id.split(":")[0].split("@")[0];
        logWhatsApp(tenant, company, "WHATSAPP_CONNECTED", "WhatsApp conectado com sucesso.", { details: { phone: c.phone || null } });
      }
      if (update.connection === "close") {
        c.qr = null;
        c.phone = undefined;
        const code = (update.lastDisconnect?.error as any)?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          c.status = "LOGGED_OUT";
          c.stopped = true;
          await c.writes.catch(() => {});
          await pool.query(
            "UPDATE company_automation SET whatsapp_enabled=0 WHERE tenant_id=? AND company_id=?",
            [tenant, company],
          );
          await pool.query(
            "DELETE FROM whatsapp_auth WHERE tenant_id=? AND company_id=?",
            [tenant, company],
          );
          logWhatsApp(tenant, company, "WHATSAPP_LOGGED_OUT", "Sessão do WhatsApp foi encerrada.", { level: "WARNING", details: { disconnectCode: code ?? null } });
          return;
        }
        // A restart immediately after scanning the QR is expected by Baileys.
        // Reconnect only after all auth writes are durable.
        await c.writes.catch(() => {});
        c.status = "RECONNECTING";
        c.next =
          code === DisconnectReason.restartRequired
            ? Date.now()
            : Date.now() + 5000;
        logWhatsApp(tenant, company, "WHATSAPP_RECONNECTING", "WhatsApp entrou em reconexão.", { level: "WARNING", details: { disconnectCode: code ?? null, restartRequired: code === DisconnectReason.restartRequired } });
      }
    })().catch((error) => {
      c.status = "ERROR";
      logWhatsApp(tenant, company, "WHATSAPP_CONNECTION_ERROR", "Falha ao atualizar a conexão do WhatsApp.", { level: "ERROR", details: { error: (error as any)?.message || String(error) } });
    });
  });
  socket.ev.on("messages.update", (updates) => {
    for (const u of updates)
      if (u.key.fromMe && u.key.id && Number(u.update.status) >= 3)
        void pool
          .query(
            "UPDATE overtime_alerts SET status='DELIVERED',error_code=NULL WHERE tenant_id=? AND company_id=? AND message_id=? AND status IN ('SENDING','SENT','ACCEPTED','UNKNOWN')",
            [tenant, company, u.key.id],
          )
          .catch(() => {});
  });
  socket.ev.on("message-receipt.update", (updates) => {
    for (const update of updates) {
      const messageId = update?.key?.id;
      const state = receiptState(update?.receipt);
      if (!messageId || !state) continue;
      if (state === "READ") {
        void pool
          .query(
            "UPDATE overtime_alerts SET status='READ',error_code=NULL WHERE tenant_id=? AND company_id=? AND message_id=? AND status IN ('SENDING','SENT','ACCEPTED','UNKNOWN','DELIVERED')",
            [tenant, company, messageId],
          )
          .catch(() => {});
        logWhatsApp(tenant, company, "WHATSAPP_READ", "Mensagem do WhatsApp foi lida.", { details: { messageId } });
      } else {
        void pool
          .query(
            "UPDATE overtime_alerts SET status='DELIVERED',error_code=NULL WHERE tenant_id=? AND company_id=? AND message_id=? AND status IN ('SENDING','SENT','ACCEPTED','UNKNOWN')",
            [tenant, company, messageId],
          )
          .catch(() => {});
        logWhatsApp(tenant, company, "WHATSAPP_DELIVERED", "Mensagem do WhatsApp foi entregue.", { details: { messageId } });
      }
    }
  });
}
export async function disconnectWhatsApp(tenant: number, company: number) {
  const identity = `${tenant}:${company}`,
    c = connections.get(identity);
  if (c) {
    c.stopped = true;
    c.qr = null;
    await c.socket?.logout().catch(() => {});
    c.socket?.end(undefined);
    await c.writes;
    connections.delete(identity);
  }
  await pool.query(
    "DELETE FROM whatsapp_auth WHERE tenant_id=? AND company_id=?",
    [tenant, company],
  );
  logWhatsApp(tenant, company, "WHATSAPP_DISCONNECTED", "WhatsApp desconectado pelo painel.", { level: "WARNING" });
}
export async function runWhatsAppTick() {
  if (busy) return;
  busy = true;
  try {
    if (!/^[a-f0-9]{64}$/i.test(key())) return;
    if (!leader) {
      const candidate = await pool.getConnection();
      const [rows] = await candidate.query<any[]>(
        "SELECT GET_LOCK('pc:whatsapp-worker',0) AS acquired",
      );
      if (!Number(rows[0]?.acquired)) {
        candidate.release();
        return;
      }
      leader = candidate;
      candidate.on("error", () => {
        leader = null;
        for (const c of connections.values()) {
          c.stopped = true;
          c.socket?.end(undefined);
        }
        connections.clear();
      });
      // A process may have stopped after submission. Never blindly resend an ambiguous delivery.
      await pool.query(
        "UPDATE overtime_alerts SET status='UNKNOWN',error_code='PROCESS_RESTART' WHERE status='SENDING'",
      );
    }
    await leader.ping();
    // A sendMessage result only confirms local/server acceptance. If no delivery
    // acknowledgement arrives within ten minutes, keep the record visible as
    // uncertain instead of reporting a false delivery success. A later ACK can
    // still move UNKNOWN to DELIVERED.
    const [timedOut] = await pool.query<any[]>(
      `SELECT tenant_id,company_id,employee_id,recipient,message_id
         FROM overtime_alerts
        WHERE status='ACCEPTED' AND sent_at IS NOT NULL
          AND sent_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
        GROUP BY tenant_id,company_id,employee_id,recipient,message_id`,
    );
    await pool.query(
      "UPDATE overtime_alerts SET status='UNKNOWN',error_code='ACK_TIMEOUT' WHERE status='ACCEPTED' AND sent_at IS NOT NULL AND sent_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)",
    );
    for (const item of timedOut)
      logWhatsApp(Number(item.tenant_id), Number(item.company_id), "WHATSAPP_ACK_TIMEOUT", "WhatsApp não confirmou a entrega dentro do prazo esperado.", { level: "WARNING", recipient: item.recipient, employeeId: Number(item.employee_id), details: { messageId: item.message_id } });
    const [companies] = await pool.query<any[]>(
      `SELECT a.* FROM company_automation a JOIN companies c ON c.id=a.company_id AND c.tenant_id=a.tenant_id AND c.active=1 JOIN tenants t ON t.id=a.tenant_id AND t.status='ACTIVE' WHERE a.whatsapp_enabled=1 AND a.overtime_enabled=1`,
    );
    const active = new Set(
      companies.map((c) => `${c.tenant_id}:${c.company_id}`),
    );
    for (const [identity, c] of connections)
      if (!active.has(identity)) {
        c.stopped = true;
        c.socket?.end(undefined);
        connections.delete(identity);
      }
    for (const company of companies)
      await connect(company.tenant_id, company.company_id).catch((error) => {
        const c = connections.get(`${company.tenant_id}:${company.company_id}`);
        if (c) {
          c.status = "ERROR";
          c.next = Date.now() + 60000;
        }
        logWhatsApp(company.tenant_id, company.company_id, "WHATSAPP_CONNECT_ERROR", "Não foi possível estabelecer a conexão do WhatsApp.", { level: "ERROR", details: { error: (error as any)?.message || String(error) } });
      });
    for (const company of companies) {
      const c = connections.get(`${company.tenant_id}:${company.company_id}`);
      if (c?.status !== "CONNECTED" || !c.socket) continue;
      const month = new Date(Date.now() - 3 * 3600000)
        .toISOString()
        .slice(0, 7);
      const [rows] = await pool.query<any[]>(
        `SELECT * FROM overtime_alerts WHERE tenant_id=? AND company_id=? AND status='PENDING'
           AND (month_key=? OR threshold_key LIKE 'D:%')
           AND (threshold_key NOT LIKE 'D:%' OR created_at>=DATE_SUB(NOW(),INTERVAL 1 DAY))
           AND (next_attempt_at IS NULL OR next_attempt_at<=NOW()) ORDER BY id LIMIT 1`,
        [company.tenant_id, company.company_id, month],
      );
      const alert = rows[0];
      if (!alert) continue;
      const recipients = JSON.parse(company.recipients || "[]");
      if (!recipients.some((r: any) => r.phone === alert.recipient)) {
        await pool.query(
          "UPDATE overtime_alerts SET status='CANCELED',error_code='RECIPIENT_REMOVED' WHERE id=? AND status='PENDING'",
          [alert.id],
        );
        logWhatsApp(company.tenant_id, company.company_id, "WHATSAPP_RECIPIENT_REMOVED", "Alerta cancelado porque o destinatário foi removido da configuração.", { level: "WARNING", recipient: alert.recipient, employeeId: Number(alert.employee_id) });
        continue;
      }

      const [pendingAlerts] = await pool.query<any[]>(
        `SELECT * FROM overtime_alerts
         WHERE tenant_id=? AND company_id=? AND employee_id=? AND month_key=? AND recipient=?
           AND status='PENDING' AND (next_attempt_at IS NULL OR next_attempt_at<=NOW())
         ORDER BY FIELD(threshold_key,'50','100','OVER'),id`,
        [
          company.tenant_id,
          company.company_id,
          alert.employee_id,
          alert.month_key,
          alert.recipient,
        ],
      );
      // Monthly milestones can share a message. Each live shift has its own
      // dated message and must never absorb another shift or monthly milestone.
      const liveAlert = String(alert.threshold_key).startsWith("D:");
      const pendingGroup = pendingAlerts.filter((item) =>
        liveAlert
          ? item.threshold_key === alert.threshold_key
          : !String(item.threshold_key).startsWith("D:"),
      );
      if (!pendingGroup.length) continue;
      const ids = pendingGroup.map((item: any) => Number(item.id));
      const placeholders = ids.map(() => "?").join(",");

      const [rateRows] = await pool.query<any[]>(
        `SELECT MAX(sent_at) AS last_sent, COUNT(DISTINCT message_id) AS sent_count
           FROM overtime_alerts
          WHERE tenant_id=? AND company_id=? AND recipient=?
            AND sent_at>=DATE_SUB(NOW(),INTERVAL 1 HOUR)
            AND message_id IS NOT NULL
            AND status IN ('ACCEPTED','DELIVERED','READ','UNKNOWN')`,
        [company.tenant_id, company.company_id, alert.recipient],
      );
      const sentCount = Number(rateRows[0]?.sent_count || 0);
      if (sentCount >= WHATSAPP_MAX_MESSAGES_PER_HOUR) {
        await pool.query(
          `UPDATE overtime_alerts
              SET error_code='RATE_LIMITED',next_attempt_at=DATE_ADD(NOW(),INTERVAL 5 MINUTE)
            WHERE id IN (${placeholders}) AND status='PENDING'`,
          ids,
        );
        logWhatsApp(company.tenant_id, company.company_id, "WHATSAPP_RATE_LIMITED", "Envio retido temporariamente pelo limite de mensagens.", { level: "WARNING", recipient: alert.recipient, employeeId: Number(alert.employee_id), details: { sentCount, limit: WHATSAPP_MAX_MESSAGES_PER_HOUR } });
        continue;
      }
      if (rateRows[0]?.last_sent) {
        const lastSent = new Date(String(rateRows[0].last_sent).replace(" ", "T") + "-03:00").getTime();
        const remaining =
          WHATSAPP_MIN_RECIPIENT_INTERVAL_SECONDS * 1000 -
          (Date.now() - lastSent);
        if (remaining > 0) {
          const waitSeconds = Math.max(1, Math.ceil(remaining / 1000));
          await pool.query(
            `UPDATE overtime_alerts
                SET error_code='THROTTLED',next_attempt_at=DATE_ADD(NOW(),INTERVAL ? SECOND)
              WHERE id IN (${placeholders}) AND status='PENDING'`,
            [waitSeconds, ...ids],
          );
          logWhatsApp(company.tenant_id, company.company_id, "WHATSAPP_THROTTLED", "Mensagem aguardando o intervalo mínimo entre envios.", { level: "INFO", recipient: alert.recipient, employeeId: Number(alert.employee_id), details: { waitSeconds } });
          continue;
        }
      }

      let resolvedJid: string | null = null;
      try {
        const lookup = await c.socket.onWhatsApp(alert.recipient);
        const match = Array.isArray(lookup)
          ? lookup.find((item: any) => item?.exists && item?.jid)
          : null;
        resolvedJid = match?.jid || null;
      } catch {
        const delay = retryDelaySeconds(Number(alert.attempt_count || 0));
        await pool.query(
          `UPDATE overtime_alerts
              SET error_code='RECIPIENT_LOOKUP_FAILED',attempt_count=attempt_count+1,
                  next_attempt_at=DATE_ADD(NOW(),INTERVAL ? SECOND)
            WHERE id IN (${placeholders}) AND status='PENDING'`,
          [delay, ...ids],
        );
        logWhatsApp(company.tenant_id, company.company_id, "WHATSAPP_RECIPIENT_LOOKUP_FAILED", "Não foi possível validar o destinatário no WhatsApp.", { level: "WARNING", recipient: alert.recipient, employeeId: Number(alert.employee_id), details: { retryInSeconds: delay } });
        continue;
      }
      if (!resolvedJid) {
        await pool.query(
          `UPDATE overtime_alerts
              SET status='CANCELED',error_code='INVALID_RECIPIENT',next_attempt_at=NULL
            WHERE id IN (${placeholders}) AND status='PENDING'`,
          ids,
        );
        logWhatsApp(company.tenant_id, company.company_id, "WHATSAPP_INVALID_RECIPIENT", "Destinatário não encontrado no WhatsApp.", { level: "ERROR", recipient: alert.recipient, employeeId: Number(alert.employee_id) });
        continue;
      }

      const messageText = consolidateOvertimeAlertMessage(pendingGroup);
      const messageId = generateMessageIDV2(c.socket.user?.id);
      const [claim] = await pool.query<any>(
        `UPDATE overtime_alerts
            SET status='SENDING',message_id=?,error_code=NULL,next_attempt_at=NULL,attempt_count=attempt_count+1
          WHERE id IN (${placeholders}) AND status='PENDING'`,
        [messageId, ...ids],
      );
      if (Number(claim.affectedRows) !== ids.length) continue;
      try {
        const result = await c.socket.sendMessage(
          resolvedJid,
          { text: messageText },
          { messageId },
        );
        const acceptedId = result?.key.id || messageId;
        await pool.query(
          `UPDATE overtime_alerts
              SET status='ACCEPTED',message_id=?,sent_at=NOW(),error_code=NULL,next_attempt_at=NULL
            WHERE id IN (${placeholders}) AND status='SENDING'`,
          [acceptedId, ...ids],
        );
        logWhatsApp(company.tenant_id, company.company_id, "WHATSAPP_ACCEPTED", "Mensagem aceita para envio pelo WhatsApp.", { recipient: alert.recipient, employeeId: Number(alert.employee_id), details: { messageId: acceptedId, alertIds: ids } });
      } catch (error) {
        await pool.query(
          `UPDATE overtime_alerts
              SET status='UNKNOWN',error_code='SEND_UNCONFIRMED',next_attempt_at=NULL
            WHERE id IN (${placeholders}) AND status='SENDING'`,
          ids,
        );
        logWhatsApp(company.tenant_id, company.company_id, "WHATSAPP_SEND_ERROR", "Falha ou resultado incerto ao enviar mensagem pelo WhatsApp.", { level: "ERROR", recipient: alert.recipient, employeeId: Number(alert.employee_id), details: { error: (error as any)?.message || String(error), alertIds: ids } });
      }
    }
  } finally {
    busy = false;
  }
}
export function startWhatsAppWorker() {
  const run = () =>
    void runWhatsAppTick().catch(() =>
      console.warn(
        "WhatsApp indisponível: confira migração 013, banco e chave de sessão.",
      ),
    );
  const timer = setInterval(run, 5000);
  timer.unref();
  run();
  return timer;
}
