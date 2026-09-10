import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { createHash } from "node:crypto";
import { pool } from "../db/pool.js";
import { requireRole } from "../middlewares/require-role.js";
import { processPeriod } from "../services/calculation.service.js";
import { writeAudit } from "../utils/audit.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import {
  aggregatePayroll,
  exportSchema,
  formatSchema,
  payrollEvents,
  payrollFormats,
  PayrollValidationError,
  profileSchema,
  renderPayroll,
  validateProfile,
  type ExportEmployee,
  type PayrollDay,
} from "../services/payroll-export.service.js";

// Mounted beneath reportsRouter, which authenticates the session.
export const payrollExportsRouter = Router();
payrollExportsRouter.use(requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"));
payrollExportsRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
const safe =
  (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch((error) => {
      if (error instanceof PayrollValidationError)
        return res.status(422).json({ message: error.message });
      if (
        error?.code === "ER_NO_SUCH_TABLE" &&
        String(error.sqlMessage).includes("payroll_export_profiles")
      )
        return res.status(503).json({
          message:
            "Atualize o banco de dados para salvar/carregar configurações de exportação (migração 008).",
        });
      next(error);
    });
  };

async function companyFor(req: Request, companyId: number) {
  if (
    !Number.isSafeInteger(companyId) ||
    companyId <= 0 ||
    (req.auth!.companyId && Number(req.auth!.companyId) !== companyId)
  )
    return null;
  const [rows] = await pool.query<any[]>(
    "SELECT id, legal_name FROM companies WHERE tenant_id=? AND id=?",
    [req.auth!.tenantId, companyId],
  );
  return rows[0] || null;
}

payrollExportsRouter.get(
  "/options",
  safe(async (req, res) => {
    const params: number[] = [req.auth!.tenantId];
    const scope = req.auth!.companyId ? " AND c.id=?" : "";
    if (req.auth!.companyId) params.push(Number(req.auth!.companyId));
    const [companies] = await pool.query<any[]>(
      `SELECT c.id, c.legal_name FROM companies c WHERE c.tenant_id=?${scope} ORDER BY c.legal_name`,
      params,
    );
    const [employees] = await pool.query<any[]>(
      `SELECT e.id, e.company_id, e.name, e.registration_number, e.active,
      e.work_schedule_id, e.admission_date FROM employees e
      JOIN companies c ON c.id=e.company_id AND c.tenant_id=e.tenant_id
      WHERE e.tenant_id=? AND e.active=1${scope} ORDER BY e.name`,
      params,
    );
    res.json({
      companies,
      employees,
      formats: payrollFormats,
      events: payrollEvents,
    });
  }),
);

payrollExportsRouter.get(
  "/profiles/:companyId/:format",
  safe(async (req, res) => {
    const companyId = Number(req.params.companyId);
    const format = formatSchema.safeParse(req.params.format);
    if (!format.success)
      return res.status(400).json({ message: "Formato inválido." });
    if (!(await companyFor(req, companyId)))
      return res.status(404).json({ message: "Empresa não encontrada." });
    const [rows] = await pool.query<any[]>(
      "SELECT settings FROM payroll_export_profiles WHERE tenant_id=? AND company_id=? AND format=?",
      [req.auth!.tenantId, companyId, format.data],
    );
    const value = rows[0]?.settings;
    res.json({
      profile: value
        ? profileSchema.parse(
            typeof value === "string" ? JSON.parse(value) : value,
          )
        : null,
    });
  }),
);

payrollExportsRouter.put(
  "/profiles/:companyId/:format",
  safe(async (req, res) => {
    const companyId = Number(req.params.companyId);
    const format = formatSchema.safeParse(req.params.format);
    const parsed = profileSchema.safeParse(req.body);
    if (!format.success || !parsed.success)
      return res
        .status(400)
        .json({ message: "Configuração de exportação inválida." });
    if (!(await companyFor(req, companyId)))
      return res.status(404).json({ message: "Empresa não encontrada." });
    validateProfile(format.data, parsed.data);
    const ids = Object.keys(parsed.data.employeeCodes).map(Number);
    if (ids.length > 500)
      return res
        .status(400)
        .json({ message: "Configure até 500 funcionários por perfil." });
    if (ids.length) {
      const [employees] = await pool.query<any[]>(
        `SELECT id FROM employees WHERE tenant_id=? AND company_id=? AND id IN (${ids.map(() => "?").join(",")})`,
        [req.auth!.tenantId, companyId, ...ids],
      );
      if (employees.length !== ids.length)
        return res.status(400).json({
          message:
            "Configuração contém funcionários que não pertencem à empresa.",
        });
    }
    await pool.query(
      `INSERT INTO payroll_export_profiles (tenant_id, company_id, format, settings, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ${BRASILIA_NOW_SQL}) ON DUPLICATE KEY UPDATE settings=VALUES(settings), updated_by=VALUES(updated_by), updated_at=VALUES(updated_at)`,
      [
        req.auth!.tenantId,
        companyId,
        format.data,
        JSON.stringify(parsed.data),
        req.auth!.userId,
      ],
    );
    await writeAudit(
      req,
      "PAYROLL_PROFILE_SAVED",
      "company",
      companyId,
      undefined,
      { format: format.data },
    );
    res.json({ message: "Configuração salva para esta empresa e ERP." });
  }),
);

payrollExportsRouter.post(
  "/generate",
  safe(async (req, res) => {
    const parsed = exportSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        message:
          "Informe empresa, formato, competência, funcionários únicos e um período válido de até 62 dias.",
      });
    const { companyId, format, start, end, competence, employeeIds, profile } =
      parsed.data;
    const company = await companyFor(req, companyId);
    if (!company)
      return res.status(404).json({ message: "Empresa não encontrada." });
    const today = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    if (end >= today)
      return res.status(400).json({
        message:
          "Exporte apenas dias encerrados, até ontem. O dia atual pode ter uma jornada em andamento.",
      });
    const placeholders = employeeIds.map(() => "?").join(",");
    const [employees] = await pool.query<any[]>(
      `SELECT id, name, registration_number, admission_date, work_schedule_id, active
    FROM employees WHERE tenant_id=? AND company_id=? AND id IN (${placeholders}) ORDER BY id`,
      [req.auth!.tenantId, companyId, ...employeeIds],
    );
    if (employees.length !== employeeIds.length)
      return res.status(400).json({
        message: "Um ou mais funcionários não pertencem à empresa selecionada.",
      });
    if (employees.some((e) => !e.active || !e.work_schedule_id))
      return res.status(422).json({
        message:
          "Selecione funcionários ativos e com escala cadastrada para apurar a jornada.",
      });
    validateProfile(format, profile, employees);
    const [pending] = await pool.query<any[]>(
      `SELECT id FROM time_adjustments WHERE tenant_id=? AND employee_id IN (${placeholders})
    AND status='PENDING' AND (DATE(requested_time) BETWEEN ? AND ? OR DATE(original_time) BETWEEN ? AND ?) LIMIT 1`,
      [req.auth!.tenantId, ...employeeIds, start, end, start, end],
    );
    if (pending.length)
      return res.status(422).json({
        message:
          "Há solicitações de ajuste pendentes no período. Analise-as antes de exportar.",
      });
    const [incomplete] = await pool.query<any[]>(
      `SELECT employee_id, DATE(registered_at) AS work_date FROM time_entries
    WHERE tenant_id=? AND company_id=? AND employee_id IN (${placeholders}) AND DATE(registered_at) BETWEEN ? AND ?
    GROUP BY employee_id, DATE(registered_at) HAVING MOD(COUNT(*), 2)=1 LIMIT 1`,
      [req.auth!.tenantId, companyId, ...employeeIds, start, end],
    );
    if (incomplete.length) {
      const employee = employees.find(
        (e) => Number(e.id) === Number(incomplete[0].employee_id),
      );
      return res.status(422).json({
        message: `${employee?.name || "Funcionário"}: marcações sem par em ${String(incomplete[0].work_date).slice(0, 10)}. Corrija entrada/saída antes de exportar.`,
      });
    }
    await processPeriod({
      tenantId: req.auth!.tenantId,
      start,
      end,
      employeeIds,
    });
    const [days] = await pool.query<any[]>(
      `SELECT employee_id, work_date, normal_minutes, overtime_minutes, late_minutes, absence_minutes
    FROM daily_time_calculations WHERE tenant_id=? AND company_id=? AND employee_id IN (${placeholders}) AND work_date BETWEEN ? AND ? ORDER BY employee_id, work_date`,
      [req.auth!.tenantId, companyId, ...employeeIds, start, end],
    );
    const { rows, warnings } = aggregatePayroll(
      employees as ExportEmployee[],
      days as PayrollDay[],
      profile,
    );
    if (!rows.length)
      return res.status(422).json({
        message: "Nenhum evento com horas e rubrica configurada para exportar.",
        warnings,
      });
    const layout = payrollFormats.find((f) => f.id === format)!;
    const content = renderPayroll(format, rows, profile, competence);
    const sha256 = createHash("sha256").update(content, "utf8").digest("hex");
    const filename = `ponto-${format.toLowerCase()}-empresa-${companyId}-${competence}-${start}-${end}.${layout.extension}`;
    const generatedAt = new Date().toISOString();
    await writeAudit(
      req,
      "PAYROLL_EXPORT_GENERATED",
      "company",
      companyId,
      undefined,
      {
        format,
        start,
        end,
        competence,
        employeeIds,
        events: profile.events,
        rows: rows.length,
        sha256,
        filename,
      },
    );
    res.json({
      filename,
      content,
      mimeType:
        layout.extension === "csv"
          ? "text/csv;charset=utf-8"
          : "text/plain;charset=utf-8",
      sha256,
      generatedAt,
      companyName: company.legal_name,
      selectedCount: employees.length,
      exportedCount: new Set(rows.map((r) => r.employeeId)).size,
      rows,
      warnings,
      instructions: layout.instructions,
    });
  }),
);
