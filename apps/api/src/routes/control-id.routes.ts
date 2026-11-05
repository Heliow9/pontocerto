import { randomBytes } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { writeAudit } from "../utils/audit.js";
import { hashControlIdSecret, normalizeControlIdSerial } from "../services/control-id-core.js";
import {
  createControlIdTerminal,
  resolveControlIdTerminal,
  type ControlIdTerminalChannel,
  type ControlIdTerminalStore,
  type StoredControlIdTerminal,
} from "../services/control-id.service.js";
import {
  claimControlIdPushJob,
  completeControlIdPushJob,
  enqueueControlIdCompanySync,
} from "../services/control-id-sync.service.js";
import { receiveControlIdDao, retryControlIdPendingEvents } from "../services/control-id-punch.service.js";

export const controlIdRouter = Router();
export const controlIdDeviceRouter = Router();

const safe =
  (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };

function stored(row: any): StoredControlIdTerminal {
  return {
    id: Number(row.id),
    tenantId: Number(row.tenant_id),
    companyId: Number(row.company_id),
    companyName: row.company_name,
    name: row.name,
    serialNumber: row.serial_number,
    vendorDeviceId: String(row.vendor_device_id),
    credentialHash: row.credential_hash,
    status: row.status,
    active: Boolean(row.active),
  };
}

export const mysqlControlIdTerminalStore: ControlIdTerminalStore = {
  async findCompany(tenantId, companyId) {
    const [rows] = await pool.query<any[]>(
      "SELECT id,active,COALESCE(trade_name,legal_name) AS name FROM companies WHERE tenant_id=? AND id=? LIMIT 1",
      [tenantId, companyId],
    );
    return rows[0]
      ? { id: Number(rows[0].id), active: Boolean(rows[0].active), name: rows[0].name }
      : null;
  },
  async findActiveByCompany(tenantId, companyId) {
    const [rows] = await pool.query<any[]>(
      `SELECT t.*,COALESCE(c.trade_name,c.legal_name) AS company_name
         FROM control_id_terminals t
         JOIN companies c ON c.id=t.company_id AND c.tenant_id=t.tenant_id
        WHERE t.tenant_id=? AND t.company_id=? AND t.active=1 LIMIT 1`,
      [tenantId, companyId],
    );
    return rows[0] ? stored(rows[0]) : null;
  },
  async insertTerminal(input) {
    const [result] = await pool.query<any>(
      `INSERT INTO control_id_terminals
       (tenant_id,company_id,name,serial_number,vendor_device_id,credential_hash,active,status,created_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,1,'PENDING',?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,
      [
        input.tenantId,
        input.companyId,
        input.name,
        input.serialNumber,
        input.vendorDeviceId,
        input.credentialHash,
        input.actorUserId,
      ],
    );
    return {
      id: Number(result.insertId),
      tenantId: input.tenantId,
      companyId: input.companyId,
      name: input.name,
      serialNumber: input.serialNumber,
      vendorDeviceId: input.vendorDeviceId,
      credentialHash: input.credentialHash,
      status: input.status,
      active: true,
    };
  },
  async findByCredentialHash(hash) {
    const [rows] = await pool.query<any[]>(
      `SELECT t.*,COALESCE(c.trade_name,c.legal_name) AS company_name
         FROM control_id_terminals t
         JOIN companies c ON c.id=t.company_id AND c.tenant_id=t.tenant_id AND c.active=1
        WHERE t.credential_hash=? AND t.active=1 LIMIT 1`,
      [hash],
    );
    return rows[0] ? stored(rows[0]) : null;
  },
  async touchTerminal(id: number, channel: ControlIdTerminalChannel) {
    const column = channel === "PUSH" ? "last_push_at" : "last_monitor_at";
    await pool.query(
      `UPDATE control_id_terminals SET ${column}=${BRASILIA_NOW_SQL},status='ONLINE',updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,
      [id],
    );
  },
};

const admin = Router();
admin.use(authMiddleware, requireRole("TENANT_ADMIN", "RH"));
controlIdRouter.use("/admin", admin);

admin.get(
  "/companies/:companyId",
  safe(async (req, res) => {
    const companyId = Number(req.params.companyId);
    const company = await mysqlControlIdTerminalStore.findCompany(req.auth!.tenantId, companyId);
    if (!company) return res.status(404).json({ message: "Empresa não encontrada." });
    const [rows] = await pool.query<any[]>(
      `SELECT t.id,t.name,t.serial_number,t.vendor_device_id,t.model,t.firmware_version,t.active,
              CASE
                WHEN t.active=0 THEN 'DISABLED'
                WHEN t.last_push_at IS NULL AND t.last_monitor_at IS NULL THEN t.status
                WHEN COALESCE(t.last_push_at,'1970-01-01')<DATE_SUB(${BRASILIA_NOW_SQL},INTERVAL 2 MINUTE)
                 AND COALESCE(t.last_monitor_at,'1970-01-01')<DATE_SUB(${BRASILIA_NOW_SQL},INTERVAL 2 MINUTE) THEN 'OFFLINE'
                ELSE t.status
              END AS status,
              t.last_push_at,t.last_monitor_at,t.last_event_at,t.created_at,
              SUM(m.sync_status='SYNCED') AS synced,
              SUM(m.sync_status='PENDING') AS pending,
              SUM(m.sync_status='ERROR') AS errors,
              (SELECT COUNT(*) FROM control_id_events ev WHERE ev.terminal_id=t.id AND ev.status='QUARANTINED') AS quarantined
         FROM control_id_terminals t
         LEFT JOIN control_id_employee_mappings m ON m.terminal_id=t.id
        WHERE t.tenant_id=? AND t.company_id=?
        GROUP BY t.id ORDER BY t.active DESC,t.id DESC LIMIT 1`,
      [req.auth!.tenantId, companyId],
    );
    const terminal = rows[0]
      ? {
          ...rows[0],
          active: Boolean(rows[0].active),
          synced: Number(rows[0].synced || 0),
          pending: Number(rows[0].pending || 0),
          errors: Number(rows[0].errors || 0),
          quarantined: Number(rows[0].quarantined || 0),
        }
      : null;
    res.json({ company, terminal });
  }),
);

const createSchema = z.object({
  companyId: z.number().int().positive(),
  name: z.string().trim().min(2).max(120),
  serialNumber: z.string().trim().min(8).max(64),
  vendorDeviceId: z.string().trim().regex(/^\d{1,20}$/),
});

admin.post(
  "/terminals",
  requireRole("TENANT_ADMIN"),
  safe(async (req, res) => {
    const data = createSchema.parse(req.body);
    const created = await createControlIdTerminal({
      store: mysqlControlIdTerminalStore,
      tenantId: req.auth!.tenantId,
      actorUserId: req.auth!.userId,
      companyId: data.companyId,
      name: data.name,
      serialNumber: data.serialNumber,
      vendorDeviceId: data.vendorDeviceId,
      pepper: env.JWT_SECRET,
    });
    await writeAudit(req, "CONTROL_ID_TERMINAL_CREATE", "control_id_terminal", created.terminal.id, undefined, created.terminal);
    res.status(201).json(created);
  }),
);

admin.post(
  "/terminals/:id/rotate",
  requireRole("TENANT_ADMIN"),
  safe(async (req, res) => {
    const id = Number(req.params.id);
    const credential = randomBytes(32).toString("hex");
    const [result] = await pool.query<any>(
      `UPDATE control_id_terminals SET credential_hash=?,status='PENDING',updated_at=${BRASILIA_NOW_SQL}
        WHERE id=? AND tenant_id=? AND active=1`,
      [hashControlIdSecret(credential, env.JWT_SECRET), id, req.auth!.tenantId],
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Equipamento não encontrado." });
    await writeAudit(req, "CONTROL_ID_CREDENTIAL_ROTATE", "control_id_terminal", id);
    res.json({ id, credential });
  }),
);

admin.patch(
  "/terminals/:id",
  requireRole("TENANT_ADMIN"),
  safe(async (req, res) => {
    const id = Number(req.params.id);
    const data = z.object({ active: z.boolean(), name: z.string().trim().min(2).max(120).optional() }).parse(req.body);
    const [result] = await pool.query<any>(
      `UPDATE control_id_terminals
          SET active=?,status=?,name=COALESCE(?,name),updated_at=${BRASILIA_NOW_SQL}
        WHERE id=? AND tenant_id=?`,
      [data.active ? 1 : 0, data.active ? "PENDING" : "DISABLED", data.name || null, id, req.auth!.tenantId],
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Equipamento não encontrado." });
    await writeAudit(req, data.active ? "CONTROL_ID_TERMINAL_ENABLE" : "CONTROL_ID_TERMINAL_DISABLE", "control_id_terminal", id);
    res.json({ ok: true, id, active: data.active });
  }),
);

admin.post(
  "/companies/:companyId/sync",
  requireRole("TENANT_ADMIN"),
  safe(async (req, res) => {
    const companyId = Number(req.params.companyId);
    const company = await mysqlControlIdTerminalStore.findCompany(req.auth!.tenantId, companyId);
    if (!company) return res.status(404).json({ message: "Empresa não encontrada." });
    const result = await enqueueControlIdCompanySync(req.auth!.tenantId, companyId);
    await writeAudit(req, "CONTROL_ID_FULL_SYNC", "company", companyId, undefined, result);
    res.json(result);
  }),
);

async function publicTerminal(req: Request, channel: ControlIdTerminalChannel, deviceId?: unknown) {
  return resolveControlIdTerminal({
    store: mysqlControlIdTerminalStore,
    authorization: req.header("authorization"),
    vendorDeviceId: deviceId ?? req.query.deviceId ?? req.body?.device_id,
    pepper: env.JWT_SECRET,
    channel,
  });
}

controlIdDeviceRouter.get(
  "/push",
  safe(async (req, res) => {
    const terminal = await publicTerminal(req, "PUSH");
    const command = await claimControlIdPushJob(terminal.id, req.query.uuid);
    if (!command) return res.status(200).send();
    res.json(command);
  }),
);

controlIdDeviceRouter.post(
  "/result",
  safe(async (req, res) => {
    const terminal = await publicTerminal(req, "PUSH");
    await completeControlIdPushJob({
      terminalId: terminal.id,
      uuid: req.query.uuid,
      response: req.body?.response,
      error: req.body?.error,
    });
    res.status(200).send();
  }),
);

controlIdDeviceRouter.post(
  "/control-id/monitor/dao",
  safe(async (req, res) => {
    const terminal = await publicTerminal(req, "MONITOR", req.body?.device_id);
    const result = await receiveControlIdDao(terminal, req.body);
    res.status(200).json({ ok: true, ...result });
  }),
);

controlIdDeviceRouter.post(
  "/control-id/monitor/device_is_alive",
  safe(async (req, res) => {
    const terminal = await publicTerminal(req, "MONITOR", req.body?.device_id);
    await retryControlIdPendingEvents(terminal.id);
    res.status(200).send();
  }),
);

export function controlIdSerialForDisplay(value: unknown) {
  return normalizeControlIdSerial(value);
}
