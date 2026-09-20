import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";

export const holidaysRouter = Router();
holidaysRouter.use(authMiddleware, requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH", "GESTOR", "SUPERVISOR"));

holidaysRouter.get("/", async (req, res) => {
  const [rows] = await pool.query<any[]>(
    `SELECT h.id, h.company_id, h.holiday_date, h.name, h.scope, c.legal_name AS company_name
       FROM holidays h
       LEFT JOIN companies c ON c.id=h.company_id AND c.tenant_id=h.tenant_id
      WHERE h.tenant_id=? ORDER BY h.holiday_date DESC`,
    [req.auth!.tenantId]
  );
  res.json(rows);
});

const schema = z.object({
  companyId: z.number().int().positive().optional().nullable(),
  holidayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(2),
  scope: z.enum(["NATIONAL", "STATE", "MUNICIPAL", "COMPANY"]).default("COMPANY")
});

holidaysRouter.post("/", requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"), async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Dados inválidos." });
  const d = parsed.data;
  if (d.companyId) {
    const [companies] = await pool.query<any[]>("SELECT id FROM companies WHERE id=? AND tenant_id=? LIMIT 1", [d.companyId, req.auth!.tenantId]);
    if (!companies[0]) return res.status(400).json({ message: "Empresa inválida." });
  }
  const [result] = await pool.query<any>(
    `INSERT INTO holidays (tenant_id, company_id, holiday_date, name, scope, created_at)
     VALUES (?, ?, ?, ?, ?, ${BRASILIA_NOW_SQL})`,
    [req.auth!.tenantId, d.companyId || null, d.holidayDate, d.name, d.scope]
  );
  res.status(201).json({ id: Number(result.insertId) });
});

holidaysRouter.delete("/:id", requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"), async (req, res) => {
  const [result] = await pool.query<any>("DELETE FROM holidays WHERE id=? AND tenant_id=?", [Number(req.params.id), req.auth!.tenantId]);
  if (!result.affectedRows) return res.status(404).json({ message: "Feriado não encontrado." });
  res.json({ ok: true });
});
