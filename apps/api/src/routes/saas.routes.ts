import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";

export const saasRouter = Router();
saasRouter.use(authMiddleware, requireRole("SUPER_ADMIN"));

saasRouter.get("/plans", async (_req, res) => {
  const [rows] = await pool.query<any[]>(
    "SELECT id, name, code, max_employees, price_monthly, active FROM plans WHERE active=1 ORDER BY price_monthly"
  );
  res.json(rows);
});

saasRouter.get("/tenants", async (_req, res) => {
  const [rows] = await pool.query<any[]>(
    `SELECT t.id, t.name, t.slug, t.status, t.created_at,
            COUNT(DISTINCT c.id) AS company_count,
            COUNT(DISTINCT e.id) AS employee_count,
            p.name AS plan_name, s.status AS subscription_status,
            s.trial_ends_at, s.current_period_end
       FROM tenants t
       LEFT JOIN companies c ON c.tenant_id=t.id AND c.active=1
       LEFT JOIN employees e ON e.tenant_id=t.id AND e.active=1
       LEFT JOIN subscriptions s ON s.tenant_id=t.id AND s.id=(
         SELECT MAX(s2.id) FROM subscriptions s2 WHERE s2.tenant_id=t.id
       )
       LEFT JOIN plans p ON p.id=s.plan_id
      GROUP BY t.id, t.name, t.slug, t.status, t.created_at, p.name, s.status, s.trial_ends_at, s.current_period_end
      ORDER BY t.created_at DESC`
  );
  res.json(rows);
});

const tenantSchema = z.object({
  tenantName: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  companyName: z.string().min(2),
  cnpj: z.string().optional().nullable(),
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(6),
  planId: z.number().int().positive().optional().nullable(),
  trialDays: z.number().int().min(0).max(365).default(14)
});

saasRouter.post("/tenants", async (req, res) => {
  const parsed = tenantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Dados inválidos.", issues: parsed.error.flatten() });
  const d = parsed.data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [tenantResult] = await conn.query<any>(
      `INSERT INTO tenants (name, slug, status, created_at, updated_at)
       VALUES (?, ?, 'ACTIVE', ${BRASILIA_NOW_SQL}, ${BRASILIA_NOW_SQL})`,
      [d.tenantName, d.slug]
    );
    const tenantId = Number(tenantResult.insertId);
    const [companyResult] = await conn.query<any>(
      `INSERT INTO companies (tenant_id, legal_name, trade_name, cnpj, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ${BRASILIA_NOW_SQL}, ${BRASILIA_NOW_SQL})`,
      [tenantId, d.companyName, d.companyName, d.cnpj || null]
    );
    const companyId = Number(companyResult.insertId);
    await conn.query(
      `INSERT INTO company_profiles (tenant_id, company_id, created_at, updated_at)
       VALUES (?, ?, ${BRASILIA_NOW_SQL}, ${BRASILIA_NOW_SQL})`,
      [tenantId, companyId]
    );
    await conn.query(
      `INSERT INTO tenant_settings (tenant_id, report_title, report_footer, timezone, created_at, updated_at)
       VALUES (?, 'Relatório de Pontos', 'Ponto Certo SaaS - Sistema de gestão de jornada',
               'America/Sao_Paulo', ${BRASILIA_NOW_SQL}, ${BRASILIA_NOW_SQL})`,
      [tenantId]
    );
    const hash = await bcrypt.hash(d.adminPassword, 10);
    await conn.query(
      `INSERT INTO users
       (tenant_id, company_id, employee_id, name, email, password_hash, role, active, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, 'TENANT_ADMIN', 1, ${BRASILIA_NOW_SQL}, ${BRASILIA_NOW_SQL})`,
      [tenantId, companyId, d.adminName, d.adminEmail, hash]
    );
    if (d.planId) {
      await conn.query(
        `INSERT INTO subscriptions
         (tenant_id, plan_id, status, starts_at, trial_ends_at, current_period_end, created_at, updated_at)
         VALUES (?, ?, ?, ${BRASILIA_NOW_SQL}, DATE_ADD(${BRASILIA_NOW_SQL}, INTERVAL ? DAY),
                 DATE_ADD(${BRASILIA_NOW_SQL}, INTERVAL 1 MONTH), ${BRASILIA_NOW_SQL}, ${BRASILIA_NOW_SQL})`,
        [tenantId, d.planId, d.trialDays > 0 ? "TRIAL" : "ACTIVE", d.trialDays]
      );
    }
    await conn.commit();
    res.status(201).json({ tenantId, companyId });
  } catch (error: any) {
    await conn.rollback();
    if (error?.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Slug, CNPJ ou e-mail já cadastrado." });
    throw error;
  } finally {
    conn.release();
  }
});

saasRouter.patch("/tenants/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "CANCELED"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Status inválido." });
  const [result] = await pool.query<any>(
    `UPDATE tenants SET status=?, updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,
    [parsed.data.status, id]
  );
  if (!result.affectedRows) return res.status(404).json({ message: "Tenant não encontrado." });
  res.json({ ok: true });
});
