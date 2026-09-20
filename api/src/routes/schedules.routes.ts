import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { calculateExpectedMinutes } from "../utils/date.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { writeAudit } from "../utils/audit.js";

export const schedulesRouter = Router();
schedulesRouter.use(authMiddleware, requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH", "GESTOR", "SUPERVISOR"));

const daySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  isDayOff: z.boolean().default(false),
  entry1: z.string().optional().nullable(),
  exit1: z.string().optional().nullable(),
  entry2: z.string().optional().nullable(),
  exit2: z.string().optional().nullable()
});

const scheduleSchema = z.object({
  companyId: z.number().int().positive(),
  name: z.string().min(2),
  toleranceLateMinutes: z.number().int().min(0).max(120).default(10),
  toleranceOvertimeMinutes: z.number().int().min(0).max(120).default(10),
  active: z.boolean().default(true),
  days: z.array(daySchema).length(7)
});

schedulesRouter.get("/", async (req, res) => {
  const companyId = req.query.companyId ? Number(req.query.companyId) : null;
  const params: any[] = [req.auth!.tenantId];
  let filter = "";
  if (companyId) { filter = " AND s.company_id=?"; params.push(companyId); }
  const [rows] = await pool.query<any[]>(
    `SELECT s.id, s.company_id, s.name, s.weekly_minutes, s.tolerance_late_minutes,
            s.tolerance_overtime_minutes, s.active, c.legal_name AS company_name,
            COUNT(e.id) AS employee_count
       FROM work_schedules s
       JOIN companies c ON c.id=s.company_id AND c.tenant_id=s.tenant_id
       LEFT JOIN employees e ON e.work_schedule_id=s.id AND e.tenant_id=s.tenant_id AND e.active=1
      WHERE s.tenant_id=? ${filter}
      GROUP BY s.id, s.company_id, s.name, s.weekly_minutes, s.tolerance_late_minutes,
               s.tolerance_overtime_minutes, s.active, c.legal_name
      ORDER BY s.active DESC, s.name`,
    params
  );
  res.json(rows);
});

schedulesRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await pool.query<any[]>(
    `SELECT id, company_id, name, weekly_minutes, tolerance_late_minutes,
            tolerance_overtime_minutes, active
       FROM work_schedules WHERE id=? AND tenant_id=? LIMIT 1`,
    [id, req.auth!.tenantId]
  );
  if (!rows[0]) return res.status(404).json({ message: "Jornada não encontrada." });
  const [days] = await pool.query<any[]>(
    `SELECT weekday, is_day_off, entry_1, exit_1, entry_2, exit_2, expected_minutes
       FROM work_schedule_days WHERE work_schedule_id=? AND tenant_id=? ORDER BY weekday`,
    [id, req.auth!.tenantId]
  );
  res.json({ ...rows[0], days });
});

async function saveSchedule(req: any, res: any, id?: number) {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Dados inválidos.", issues: parsed.error.flatten() });
  const d = parsed.data;
  const [companies] = await pool.query<any[]>(
    "SELECT id FROM companies WHERE id=? AND tenant_id=? AND active=1 LIMIT 1",
    [d.companyId, req.auth.tenantId]
  );
  if (!companies[0]) return res.status(400).json({ message: "Empresa inválida." });

  const calculatedDays = d.days.map((day) => ({ ...day, expectedMinutes: calculateExpectedMinutes(day) }));
  const weeklyMinutes = calculatedDays.reduce((sum, day) => sum + day.expectedMinutes, 0);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let scheduleId = id || 0;
    if (id) {
      const [existing] = await conn.query<any[]>(
        "SELECT id FROM work_schedules WHERE id=? AND tenant_id=? LIMIT 1",
        [id, req.auth.tenantId]
      );
      if (!existing[0]) { await conn.rollback(); return res.status(404).json({ message: "Jornada não encontrada." }); }
      await conn.query(
        `UPDATE work_schedules SET company_id=?, name=?, weekly_minutes=?, tolerance_late_minutes=?,
          tolerance_overtime_minutes=?, active=?, updated_at=${BRASILIA_NOW_SQL}
          WHERE id=? AND tenant_id=?`,
        [d.companyId, d.name, weeklyMinutes, d.toleranceLateMinutes, d.toleranceOvertimeMinutes, d.active ? 1 : 0, id, req.auth.tenantId]
      );
      await conn.query("DELETE FROM work_schedule_days WHERE work_schedule_id=? AND tenant_id=?", [id, req.auth.tenantId]);
    } else {
      const [result] = await conn.query<any>(
        `INSERT INTO work_schedules
         (tenant_id, company_id, name, weekly_minutes, tolerance_late_minutes,
          tolerance_overtime_minutes, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ${BRASILIA_NOW_SQL}, ${BRASILIA_NOW_SQL})`,
        [req.auth.tenantId, d.companyId, d.name, weeklyMinutes, d.toleranceLateMinutes, d.toleranceOvertimeMinutes, d.active ? 1 : 0]
      );
      scheduleId = Number(result.insertId);
    }

    for (const day of calculatedDays) {
      await conn.query(
        `INSERT INTO work_schedule_days
         (tenant_id, work_schedule_id, weekday, is_day_off, entry_1, exit_1, entry_2, exit_2, expected_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.auth.tenantId, scheduleId, day.weekday, day.isDayOff ? 1 : 0, day.entry1 || null, day.exit1 || null, day.entry2 || null, day.exit2 || null, day.expectedMinutes]
      );
    }
    await conn.commit();
    await writeAudit(req, id ? "UPDATE" : "CREATE", "work_schedule", scheduleId, undefined, d);
    res.status(id ? 200 : 201).json({ id: scheduleId, weeklyMinutes });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

schedulesRouter.post("/", requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"), (req, res) => saveSchedule(req, res));
schedulesRouter.put("/:id", requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"), (req, res) => saveSchedule(req, res, Number(req.params.id)));

schedulesRouter.delete(
  "/:id",
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"),
  async (req, res) => {
    const id = Number(req.params.id);
    const [result] = await pool.query<any>(
      `UPDATE work_schedules SET active=0, updated_at=${BRASILIA_NOW_SQL} WHERE id=? AND tenant_id=?`,
      [id, req.auth!.tenantId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Jornada não encontrada." });
    await writeAudit(req, "DEACTIVATE", "work_schedule", id);
    res.json({ ok: true });
  }
);
