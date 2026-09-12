import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { maskRecipient } from "../services/system-log.service.js";
import { whatsappStatus } from "../services/whatsapp.service.js";

export const logsRouter = Router();
logsRouter.use(
  authMiddleware,
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"),
  (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  },
);

const rangeSql = {
  "24h": "INTERVAL 24 HOUR",
  "7d": "INTERVAL 7 DAY",
  "30d": "INTERVAL 30 DAY",
  "90d": "INTERVAL 90 DAY",
} as const;

const querySchema = z.object({
  range: z.enum(["24h", "7d", "30d", "90d"]).default("24h"),
  level: z.enum(["ALL", "INFO", "WARNING", "ERROR"]).default("ALL"),
  module: z
    .enum(["ALL", "WHATSAPP", "POINT", "OFFLINE", "SYNC", "API", "SYSTEM"])
    .default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(50),
});

async function accessibleCompany(req: any, companyId: number) {
  if (!Number.isSafeInteger(companyId) || companyId <= 0) return false;
  if (req.auth.companyId && Number(req.auth.companyId) !== companyId) return false;
  const [rows] = await pool.query<any[]>(
    "SELECT id FROM companies WHERE tenant_id=? AND id=? AND active=1",
    [req.auth.tenantId, companyId],
  );
  return Boolean(rows[0]);
}

logsRouter.get("/companies/:id/summary", async (req, res, next) => {
  try {
    const companyId = Number(req.params.id);
    if (!(await accessibleCompany(req, companyId))) return res.sendStatus(404);
    const parsed = querySchema.pick({ range: true }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: "Período inválido." });
    const interval = rangeSql[parsed.data.range];
    const [rows] = await pool.query<any[]>(
      `SELECT
         SUM(level='ERROR') AS errors,
         SUM(level='WARNING') AS warnings,
         MAX(CASE WHEN level='ERROR' THEN created_at END) AS last_error_at,
         SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN level='ERROR' THEN message END ORDER BY created_at DESC SEPARATOR '\\n'), '\\n', 1) AS last_error
       FROM system_logs
       WHERE tenant_id=? AND company_id=? AND created_at>=DATE_SUB(NOW(), ${interval})`,
      [req.auth!.tenantId, companyId],
    );
    const [delivery] = await pool.query<any[]>(
      `SELECT
         SUM(status IN ('DELIVERED','READ')) AS delivered,
         SUM(status IN ('PENDING','SENDING','ACCEPTED')) AS pending
       FROM overtime_alerts
       WHERE tenant_id=? AND company_id=? AND created_at>=DATE_SUB(NOW(), ${interval})`,
      [req.auth!.tenantId, companyId],
    );
    res.json({
      range: parsed.data.range,
      errors: Number(rows[0]?.errors || 0),
      warnings: Number(rows[0]?.warnings || 0),
      whatsappDelivered: Number(delivery[0]?.delivered || 0),
      whatsappPending: Number(delivery[0]?.pending || 0),
      lastError: rows[0]?.last_error || null,
      lastErrorAt: rows[0]?.last_error_at || null,
      whatsappStatus: whatsappStatus(req.auth!.tenantId, companyId),
    });
  } catch (error) {
    next(error);
  }
});

logsRouter.get("/companies/:id", async (req, res, next) => {
  try {
    const companyId = Number(req.params.id);
    if (!(await accessibleCompany(req, companyId))) return res.sendStatus(404);
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: "Filtros inválidos." });
    const q = parsed.data;
    const interval = rangeSql[q.range];
    const where = [
      "tenant_id=?",
      "company_id=?",
      `created_at>=DATE_SUB(NOW(), ${interval})`,
    ];
    const params: any[] = [req.auth!.tenantId, companyId];
    if (q.level !== "ALL") {
      where.push("level=?");
      params.push(q.level);
    }
    if (q.module !== "ALL") {
      where.push("module=?");
      params.push(q.module);
    }
    const [countRows] = await pool.query<any[]>(
      `SELECT COUNT(*) AS total FROM system_logs WHERE ${where.join(" AND ")}`,
      params,
    );
    const offset = (q.page - 1) * q.pageSize;
    const [rows] = await pool.query<any[]>(
      `SELECT id,level,module,event_type,message,details_json,employee_id,recipient,created_at
       FROM system_logs WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
      [...params, q.pageSize, offset],
    );
    res.json({
      items: rows.map((row) => ({
        ...row,
        recipient: maskRecipient(row.recipient),
        details: row.details_json
          ? typeof row.details_json === "string"
            ? JSON.parse(row.details_json)
            : row.details_json
          : null,
        details_json: undefined,
      })),
      total: Number(countRows[0]?.total || 0),
      page: q.page,
      pageSize: q.pageSize,
      pages: Math.max(1, Math.ceil(Number(countRows[0]?.total || 0) / q.pageSize)),
    });
  } catch (error) {
    next(error);
  }
});
