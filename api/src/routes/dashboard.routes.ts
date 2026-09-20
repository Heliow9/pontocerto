import { Router } from "express";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { BRASILIA_DATE_SQL } from "../utils/db-time.js";

export const dashboardRouter = Router();
dashboardRouter.use(authMiddleware, requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH", "GESTOR", "SUPERVISOR"));

dashboardRouter.get("/", async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const [[employees]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS total FROM employees WHERE tenant_id=? AND active=1",
    [tenantId]
  );
  const [[working]] = await pool.query<any[]>(
    `SELECT COUNT(*) AS total FROM (
       SELECT employee_id
         FROM time_entries
        WHERE tenant_id=? AND DATE(registered_at)=${BRASILIA_DATE_SQL}
        GROUP BY employee_id
       HAVING MOD(COUNT(*), 2)=1
     ) x`,
    [tenantId]
  );
  const [[late]] = await pool.query<any[]>(
    `SELECT COUNT(*) AS total FROM daily_time_calculations
      WHERE tenant_id=? AND work_date=${BRASILIA_DATE_SQL} AND late_minutes>0`,
    [tenantId]
  );
  const [[pending]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS total FROM time_adjustments WHERE tenant_id=? AND status='PENDING'",
    [tenantId]
  );
  const [[entries]] = await pool.query<any[]>(
    `SELECT COUNT(*) AS total FROM time_entries WHERE tenant_id=? AND DATE(registered_at)=${BRASILIA_DATE_SQL}`,
    [tenantId]
  );
  const [recent] = await pool.query<any[]>(
    `SELECT te.id, te.registered_at, te.entry_type, te.source, te.manually_adjusted,
            e.name AS employee_name, e.registration_number
       FROM time_entries te
       JOIN employees e ON e.id=te.employee_id AND e.tenant_id=te.tenant_id
      WHERE te.tenant_id=?
      ORDER BY te.registered_at DESC LIMIT 8`,
    [tenantId]
  );

  res.json({
    employees: Number(employees.total || 0),
    workingNow: Number(working.total || 0),
    lateToday: Number(late.total || 0),
    pendingAdjustments: Number(pending.total || 0),
    entriesToday: Number(entries.total || 0),
    recentEntries: recent
  });
});
