import { Router } from "express";
import { createTenantInTransaction } from "../services/tenant-provisioning.service.js";
import { commercialRouter,safe } from "./saas-commercial.routes.js";
import { auditList } from "./team.routes.js";
import { proposalsRouter } from "./proposals.routes.js";
import { contractsRouter } from "./contracts.routes.js";
import { writeAudit } from "../utils/audit.js";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";

export const saasRouter = Router();
saasRouter.use(authMiddleware, requireRole("SUPER_ADMIN"));
saasRouter.use(commercialRouter);
saasRouter.use("/proposals",proposalsRouter);
saasRouter.use("/contracts",contractsRouter);
saasRouter.get("/audit",safe((req,res)=>auditList(req,res,true)));

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
      WHERE NOT EXISTS (SELECT 1 FROM users su WHERE su.tenant_id=t.id AND su.role='SUPER_ADMIN')
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
    const {tenantId,companyId} = await createTenantInTransaction(conn,d);
    await conn.commit();
    await writeAudit(req,"CREATE","tenant",tenantId,undefined,{companyId,planId:d.planId});
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
  await writeAudit(req,"UPDATE_STATUS","tenant",id,undefined,parsed.data);
  res.json({ ok: true });
});
