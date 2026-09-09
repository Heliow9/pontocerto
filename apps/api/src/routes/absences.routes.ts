import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";

export const absencesRouter = Router();
absencesRouter.use(authMiddleware, requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH", "GESTOR", "SUPERVISOR"));

absencesRouter.get("/", async (req, res) => {
  const [rows] = await pool.query<any[]>(
    `SELECT a.id, a.employee_id, a.start_date, a.end_date, a.type, a.reason, a.status,
            e.name AS employee_name
       FROM absences a JOIN employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id
      WHERE a.tenant_id=? ORDER BY a.start_date DESC LIMIT 500`,
    [req.auth!.tenantId]
  );
  res.json(rows);
});

const schema = z.object({
  employeeId: z.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["ATESTADO", "FERIAS", "AFASTAMENTO", "LICENCA", "ABONO", "OUTRO"]),
  reason: z.string().optional().nullable(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("APPROVED")
});

absencesRouter.post("/", requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH", "GESTOR"), async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Dados inválidos." });
  const d = parsed.data;
  if (d.endDate < d.startDate) return res.status(400).json({ message: "Data final menor que a inicial." });
  const [employees] = await pool.query<any[]>("SELECT id FROM employees WHERE id=? AND tenant_id=? LIMIT 1", [d.employeeId, req.auth!.tenantId]);
  if (!employees[0]) return res.status(400).json({ message: "Funcionário inválido." });
  const [result] = await pool.query<any>(
    `INSERT INTO absences (tenant_id, employee_id, start_date, end_date, type, reason, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ${BRASILIA_NOW_SQL}, ${BRASILIA_NOW_SQL})`,
    [req.auth!.tenantId, d.employeeId, d.startDate, d.endDate, d.type, d.reason || null, d.status]
  );
  res.status(201).json({ id: Number(result.insertId) });
});

absencesRouter.delete("/:id", requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"), async (req, res) => {
  const [result] = await pool.query<any>("DELETE FROM absences WHERE id=? AND tenant_id=?", [Number(req.params.id), req.auth!.tenantId]);
  if (!result.affectedRows) return res.status(404).json({ message: "Ocorrência não encontrada." });
  res.json({ ok: true });
});
