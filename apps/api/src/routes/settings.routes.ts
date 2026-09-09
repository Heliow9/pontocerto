import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";

export const settingsRouter = Router();
settingsRouter.use(authMiddleware, requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH", "GESTOR", "SUPERVISOR"));

settingsRouter.get("/", async (req, res) => {
  const [rows] = await pool.query<any[]>(
    `SELECT t.id, t.name, t.slug, t.status, s.report_title, s.report_footer, s.timezone
       FROM tenants t
       LEFT JOIN tenant_settings s ON s.tenant_id=t.id
      WHERE t.id=? LIMIT 1`,
    [req.auth!.tenantId]
  );
  res.json(rows[0]);
});

const schema = z.object({
  name: z.string().min(2),
  reportTitle: z.string().min(2).max(120).default("Relatório de Pontos"),
  reportFooter: z.string().max(255).optional().nullable(),
  timezone: z.string().max(80).default("America/Sao_Paulo")
});

settingsRouter.put("/", requireRole("SUPER_ADMIN", "TENANT_ADMIN"), async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Dados inválidos." });
  const d = parsed.data;
  await pool.query(`UPDATE tenants SET name=?, updated_at=${BRASILIA_NOW_SQL} WHERE id=?`, [d.name, req.auth!.tenantId]);
  await pool.query(
    `INSERT INTO tenant_settings (tenant_id, report_title, report_footer, timezone, created_at, updated_at)
     VALUES (?, ?, ?, ?, ${BRASILIA_NOW_SQL}, ${BRASILIA_NOW_SQL})
     ON DUPLICATE KEY UPDATE report_title=VALUES(report_title), report_footer=VALUES(report_footer),
       timezone=VALUES(timezone), updated_at=VALUES(updated_at)`,
    [req.auth!.tenantId, d.reportTitle, d.reportFooter || null, d.timezone]
  );
  res.json({ ok: true });
});
