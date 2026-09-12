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
import { collectOvertimeAlerts } from "./overtime.service.js";

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
  busy = false,
  lastCollection = 0;
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
      }
    })().catch(() => {
      c.status = "ERROR";
    });
  });
  socket.ev.on("messages.update", (updates) => {
    for (const u of updates)
      if (u.key.fromMe && u.key.id && Number(u.update.status) >= 3)
        void pool
          .query(
            "UPDATE overtime_alerts SET status='DELIVERED' WHERE tenant_id=? AND company_id=? AND message_id=? AND status IN ('SENDING','SENT','UNKNOWN')",
            [tenant, company, u.key.id],
          )
          .catch(() => {});
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
      await connect(company.tenant_id, company.company_id).catch(() => {
        const c = connections.get(`${company.tenant_id}:${company.company_id}`);
        if (c) {
          c.status = "ERROR";
          c.next = Date.now() + 60000;
        }
      });
    if (Date.now() - lastCollection >= 60000) {
      await collectOvertimeAlerts();
      lastCollection = Date.now();
    }
    for (const company of companies) {
      const c = connections.get(`${company.tenant_id}:${company.company_id}`);
      if (c?.status !== "CONNECTED" || !c.socket) continue;
      const month = new Date(Date.now() - 3 * 3600000)
        .toISOString()
        .slice(0, 7);
      const [rows] = await pool.query<any[]>(
        "SELECT * FROM overtime_alerts WHERE tenant_id=? AND company_id=? AND status='PENDING' AND month_key=? ORDER BY id LIMIT 1",
        [company.tenant_id, company.company_id, month],
      );
      const alert = rows[0];
      if (!alert) continue;
      const recipients = JSON.parse(company.recipients || "[]");
      if (!recipients.some((r: any) => r.phone === alert.recipient)) {
        await pool.query(
          "UPDATE overtime_alerts SET status='CANCELED' WHERE id=?",
          [alert.id],
        );
        continue;
      }
      const messageId = generateMessageIDV2(c.socket.user?.id);
      const [claim] = await pool.query<any>(
        "UPDATE overtime_alerts SET status='SENDING',message_id=? WHERE id=? AND status='PENDING'",
        [messageId, alert.id],
      );
      if (!claim.affectedRows) continue;
      try {
        const result = await c.socket.sendMessage(
          `${alert.recipient}@s.whatsapp.net`,
          { text: alert.message_text },
          { messageId },
        );
        await pool.query(
          "UPDATE overtime_alerts SET status='SENT',message_id=?,sent_at=NOW() WHERE id=? AND status='SENDING'",
          [result?.key.id || messageId, alert.id],
        );
      } catch {
        await pool.query(
          "UPDATE overtime_alerts SET status='UNKNOWN',error_code='SEND_UNCONFIRMED' WHERE id=? AND status='SENDING'",
          [alert.id],
        );
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
