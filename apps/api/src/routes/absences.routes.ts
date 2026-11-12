import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { processPeriod } from "../services/calculation.service.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { writeAudit } from "../utils/audit.js";

export const absencesRouter = Router();
absencesRouter.use(
  authMiddleware,
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH", "GESTOR", "SUPERVISOR"),
);

function supervisorCompanyId(req: any): number | null {
  if (req.auth.role !== "SUPERVISOR") return null;
  const companyId = Number(req.auth.companyId || 0);
  return companyId > 0 ? companyId : -1;
}

absencesRouter.get("/", async (req, res) => {
  const companyId = supervisorCompanyId(req);
  const [rows] = await pool.query<any[]>(
    `SELECT a.id, a.employee_id, a.start_date, a.end_date, a.start_time, a.end_time,
            a.type, a.reason, a.status, e.name AS employee_name, e.company_id
       FROM absences a
       JOIN employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id
      WHERE a.tenant_id=?${companyId !== null ? " AND e.company_id=?" : ""}
      ORDER BY a.start_date DESC, a.start_time DESC LIMIT 500`,
    companyId !== null
      ? [req.auth!.tenantId, companyId]
      : [req.auth!.tenantId],
  );
  res.json(rows);
});

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const common = {
  employeeId: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("APPROVED"),
};
const fullDaySchema = z.object({
  ...common,
  startDate: date,
  endDate: date,
  type: z.enum(["ATESTADO", "FERIAS", "AFASTAMENTO", "LICENCA", "ABONO", "OUTRO"]),
});
const declarationSchema = z.object({
  ...common,
  startDate: date,
  endDate: date,
  startTime: time,
  endTime: time,
  type: z.literal("DECLARACAO"),
});
const schema = z.discriminatedUnion("type", [fullDaySchema, declarationSchema]);

absencesRouter.post(
  "/",
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH", "GESTOR"),
  async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        message: "Preencha o período e a observação para auditoria.",
        issues: parsed.error.flatten(),
      });
    const d = parsed.data;
    if (d.endDate < d.startDate)
      return res.status(400).json({ message: "Data final menor que a inicial." });
    if (
      d.type === "DECLARACAO" &&
      (d.startDate !== d.endDate || d.endTime <= d.startTime)
    )
      return res.status(400).json({
        message: "A declaração deve usar uma única data e um intervalo de horas válido.",
      });

    const companyId = supervisorCompanyId(req);
    const [employees] = await pool.query<any[]>(
      `SELECT id,company_id FROM employees WHERE id=? AND tenant_id=?${
        companyId !== null ? " AND company_id=?" : ""
      } LIMIT 1`,
      companyId !== null
        ? [d.employeeId, req.auth!.tenantId, companyId]
        : [d.employeeId, req.auth!.tenantId],
    );
    if (!employees[0])
      return res.status(400).json({ message: "Funcionário inválido." });

    const startTime = d.type === "DECLARACAO" ? d.startTime : null;
    const endTime = d.type === "DECLARACAO" ? d.endTime : null;
    const [result] = await pool.query<any>(
      `INSERT INTO absences
       (tenant_id, employee_id, start_date, end_date, start_time, end_time, type,
        reason, status, created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${BRASILIA_NOW_SQL}, ${BRASILIA_NOW_SQL})`,
      [
        req.auth!.tenantId,
        d.employeeId,
        d.startDate,
        d.endDate,
        startTime,
        endTime,
        d.type,
        d.reason,
        d.status,
        req.auth!.userId,
      ],
    );
    const id = Number(result.insertId);
    const recalculation = await processPeriod({
      tenantId: req.auth!.tenantId,
      employeeId: d.employeeId,
      start: d.startDate,
      end: d.endDate,
    });
    await writeAudit(req, "OCCURRENCE_CREATE", "absence", id, undefined, {
      ...d,
      startTime,
      endTime,
    });
    res.status(201).json({ id, recalculation });
  },
);

absencesRouter.delete(
  "/:id",
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1)
      return res.status(404).json({ message: "Ocorrência não encontrada." });
    const companyId = supervisorCompanyId(req);
    const [before] = await pool.query<any[]>(
      `SELECT a.*,e.company_id
         FROM absences a
         JOIN employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id
        WHERE a.id=? AND a.tenant_id=?${companyId !== null ? " AND e.company_id=?" : ""}
        LIMIT 1`,
      companyId !== null
        ? [id, req.auth!.tenantId, companyId]
        : [id, req.auth!.tenantId],
    );
    if (!before[0])
      return res.status(404).json({ message: "Ocorrência não encontrada." });
    await pool.query("DELETE FROM absences WHERE id=? AND tenant_id=?", [
      id,
      req.auth!.tenantId,
    ]);
    const recalculation = await processPeriod({
      tenantId: req.auth!.tenantId,
      employeeId: Number(before[0].employee_id),
      start: String(before[0].start_date).slice(0, 10),
      end: String(before[0].end_date).slice(0, 10),
    });
    await writeAudit(
      req,
      "OCCURRENCE_DELETE",
      "absence",
      id,
      before[0],
      undefined,
    );
    res.json({ ok: true, recalculation });
  },
);
