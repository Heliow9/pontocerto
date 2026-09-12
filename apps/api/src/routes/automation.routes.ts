import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { writeAudit } from "../utils/audit.js";
import { overtimeSummary } from "../services/overtime.service.js";
import {
  whatsappStatus,
  whatsappReady,
  disconnectWhatsApp,
} from "../services/whatsapp.service.js";
export const automationRouter = Router();
const safe =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
automationRouter.use(
  authMiddleware,
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"),
  (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  },
);
async function company(req: Request, id: number) {
  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    (req.auth!.companyId && Number(req.auth!.companyId) !== id)
  )
    return false;
  const [rows] = await pool.query<any[]>(
    "SELECT id FROM companies WHERE id=? AND tenant_id=? AND active=1",
    [id, req.auth!.tenantId],
  );
  return Boolean(rows[0]);
}
const settings = z
  .object({
    overtimeEnabled: z.boolean(),
    remoteEnabled: z.boolean(),
    offlineEnabled: z.boolean(),
    recipients: z
      .array(
        z.object({
          name: z.string().trim().min(2).max(80),
          phone: z.string().regex(/^[1-9]\d{9,14}$/),
        }),
      )
      .max(20),
  })
  .refine((d) => !d.offlineEnabled || d.remoteEnabled, {
    message: "Ative ponto remoto antes de permitir offline.",
  })
  .refine(
    (d) =>
      new Set(d.recipients.map((r) => r.phone)).size === d.recipients.length,
    { message: "Telefones repetidos." },
  );
automationRouter.get(
  "/companies/:id",
  safe(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await company(req, id))) return res.sendStatus(404);
    const [rows] = await pool.query<any[]>(
      "SELECT * FROM company_automation WHERE tenant_id=? AND company_id=?",
      [req.auth!.tenantId, id],
    );
    const s = rows[0];
    const [alerts] = await pool.query<any[]>(
      "SELECT id,employee_id,month_key,threshold_key,recipient,status,error_code,created_at,sent_at,message_text FROM overtime_alerts WHERE tenant_id=? AND company_id=? ORDER BY id DESC LIMIT 100",
      [req.auth!.tenantId, id],
    );
    res.json({
      overtimeEnabled: Boolean(s?.overtime_enabled),
      remoteEnabled: Boolean(s?.remote_enabled),
      offlineEnabled: Boolean(s?.offline_enabled),
      recipients: JSON.parse(s?.recipients || "[]"),
      whatsappEnabled: Boolean(s?.whatsapp_enabled),
      whatsapp: whatsappStatus(req.auth!.tenantId, id),
      alerts,
    });
  }),
);
automationRouter.put(
  "/companies/:id",
  safe(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await company(req, id))) return res.sendStatus(404);
    const parsed = settings.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({
          message:
            "Confira as opções e os telefones com DDI e DDD, somente números.",
        });
    const d = parsed.data;
    await pool.query(
      `INSERT INTO company_automation(tenant_id,company_id,overtime_enabled,remote_enabled,offline_enabled,recipients) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE overtime_enabled=VALUES(overtime_enabled),remote_enabled=VALUES(remote_enabled),offline_enabled=VALUES(offline_enabled),recipients=VALUES(recipients)`,
      [
        req.auth!.tenantId,
        id,
        d.overtimeEnabled ? 1 : 0,
        d.remoteEnabled ? 1 : 0,
        d.offlineEnabled ? 1 : 0,
        JSON.stringify(d.recipients),
      ],
    );
    await writeAudit(req, "UPDATE", "company_automation", id, undefined, d);
    res.json({ ok: true });
  }),
);
automationRouter.post(
  "/companies/:id/whatsapp/:action",
  safe(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await company(req, id))) return res.sendStatus(404);
    const action = String(req.params.action);
    if (!["connect", "disconnect"].includes(action)) return res.sendStatus(404);
    if (!whatsappReady())
      return res
        .status(503)
        .json({
          message:
            "O serviço WhatsApp ainda não está pronto. Confira a chave de criptografia e o processo da API.",
        });
    const [rows] = await pool.query<any[]>(
      "SELECT overtime_enabled FROM company_automation WHERE tenant_id=? AND company_id=?",
      [req.auth!.tenantId, id],
    );
    if (!rows[0] || (action === "connect" && !rows[0].overtime_enabled))
      return res
        .status(400)
        .json({
          message:
            "Salve e ative o acompanhamento de horas extras antes de conectar.",
        });
    await pool.query(
      "UPDATE company_automation SET whatsapp_enabled=? WHERE tenant_id=? AND company_id=?",
      [action === "connect" ? 1 : 0, req.auth!.tenantId, id],
    );
    if (action === "disconnect")
      await disconnectWhatsApp(req.auth!.tenantId, id);
    await writeAudit(req, action.toUpperCase(), "company_whatsapp", id);
    res.json({ ok: true });
  }),
);
automationRouter.get(
  "/companies/:id/summary",
  safe(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await company(req, id))) return res.sendStatus(404);
    const month = String(
      req.query.month ||
        new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 7),
    );
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))
      return res.status(400).json({ message: "Competência inválida." });
    res.json(await overtimeSummary(req.auth!.tenantId, id, month));
  }),
);
async function entity(req: Request) {
  const kind = String(req.params.kind),
    id = Number(req.params.id);
  if (
    !["employee", "group"].includes(kind) ||
    !Number.isSafeInteger(id) ||
    id <= 0
  )
    return null;
  const [rows] = await pool.query<any[]>(
    `SELECT id,company_id${kind === "employee" ? ",group_id" : ""} FROM ${kind === "employee" ? "employees" : "employee_groups"} WHERE id=? AND tenant_id=?`,
    [id, req.auth!.tenantId],
  );
  const row = rows[0];
  return row && (await company(req, Number(row.company_id)))
    ? { ...row, kind }
    : null;
}
automationRouter.get(
  "/limits/:kind/:id",
  safe(async (req, res) => {
    const e = await entity(req);
    if (!e) return res.sendStatus(404);
    const [rows] = await pool.query<any[]>(
      "SELECT monthly_minutes FROM overtime_references WHERE tenant_id=? AND company_id=? AND entity_kind=? AND entity_id=?",
      [req.auth!.tenantId, e.company_id, e.kind, e.id],
    );
    let inherited = null;
    if (e.group_id) {
      const [g] = await pool.query<any[]>(
        "SELECT monthly_minutes FROM overtime_references WHERE tenant_id=? AND company_id=? AND entity_kind='group' AND entity_id=?",
        [req.auth!.tenantId, e.company_id, e.group_id],
      );
      inherited = g[0]?.monthly_minutes ?? null;
    }
    res.json({
      minutes: rows[0]?.monthly_minutes ?? null,
      inheritedMinutes: inherited,
    });
  }),
);
automationRouter.put(
  "/limits/:kind/:id",
  safe(async (req, res) => {
    const e = await entity(req);
    if (!e) return res.sendStatus(404);
    const parsed = z
      .object({ minutes: z.number().int().min(1).max(44640).nullable() })
      .safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({
          message:
            "Informe uma referência positiva em minutos ou deixe sem configuração.",
        });
    if (parsed.data.minutes == null)
      await pool.query(
        "DELETE FROM overtime_references WHERE tenant_id=? AND entity_kind=? AND entity_id=?",
        [req.auth!.tenantId, e.kind, e.id],
      );
    else
      await pool.query(
        "INSERT INTO overtime_references(tenant_id,company_id,entity_kind,entity_id,monthly_minutes) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE company_id=VALUES(company_id),monthly_minutes=VALUES(monthly_minutes)",
        [req.auth!.tenantId, e.company_id, e.kind, e.id, parsed.data.minutes],
      );
    await writeAudit(
      req,
      "UPDATE",
      `overtime_${e.kind}`,
      e.id,
      undefined,
      parsed.data,
    );
    res.json({ ok: true });
  }),
);
