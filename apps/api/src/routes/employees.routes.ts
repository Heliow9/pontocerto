import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { writeAudit } from "../utils/audit.js";

export const employeesRouter = Router();
employeesRouter.use(authMiddleware, requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH", "GESTOR", "SUPERVISOR"));

const listSql = `SELECT e.id, e.company_id, e.name, e.cpf, e.pis, e.registration_number,
                        e.admission_date, e.ctps, e.position_name, e.department_name,
                        e.group_id, g.name AS group_name, e.work_schedule_id, e.biometric_exempt, e.active,
                        c.legal_name AS company_name,
                        s.name AS schedule_name,
                        u.id AS user_id, u.email AS access_email,
                        (SELECT COUNT(*) FROM devices d WHERE d.tenant_id=e.tenant_id AND d.employee_id=e.id AND d.active=1) AS device_count,
                        (SELECT MAX(d.last_seen_at) FROM devices d WHERE d.tenant_id=e.tenant_id AND d.employee_id=e.id AND d.active=1) AS last_device_seen_at,
                        (SELECT GROUP_CONCAT(wl.name ORDER BY wl.name SEPARATOR ', ')
                           FROM employee_locations el
                           JOIN work_locations wl ON wl.id=el.work_location_id AND wl.tenant_id=el.tenant_id
                          WHERE el.employee_id=e.id AND el.tenant_id=e.tenant_id AND wl.active=1) AS location_names
                   FROM employees e
                   JOIN companies c ON c.id=e.company_id AND c.tenant_id=e.tenant_id
                   LEFT JOIN employee_groups g ON g.id=e.group_id AND g.tenant_id=e.tenant_id AND g.company_id=e.company_id
                   LEFT JOIN work_schedules s ON s.id=e.work_schedule_id AND s.tenant_id=e.tenant_id
                   LEFT JOIN users u ON u.employee_id=e.id AND u.tenant_id=e.tenant_id
                  WHERE e.tenant_id=?`;

employeesRouter.get("/", async (req, res) => {
  const includeInactive = req.query.includeInactive === "1";
  const companyId = req.query.companyId ? Number(req.query.companyId) : null;
  const search = String(req.query.search || "").trim();
  const clauses: string[] = [];
  const params: any[] = [req.auth!.tenantId];
  if (!includeInactive) clauses.push("e.active=1");
  if (companyId) { clauses.push("e.company_id=?"); params.push(companyId); }
  if (search) {
    clauses.push("(e.name LIKE ? OR e.cpf LIKE ? OR e.registration_number LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const [rows] = await pool.query<any[]>(
    `${listSql} ${clauses.length ? "AND " + clauses.join(" AND ") : ""} ORDER BY e.name`,
    params
  );
  res.json(rows);
});

employeesRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await pool.query<any[]>(`${listSql} AND e.id=? LIMIT 1`, [req.auth!.tenantId, id]);
  if (!rows[0]) return res.status(404).json({ message: "Funcionário não encontrado." });
  res.json(rows[0]);
});

const employeeSchema = z.object({
  companyId: z.number().int().positive(),
  groupId: z.number().int().positive().optional().nullable(),
  name: z.string().min(3),
  cpf: z.string().optional().nullable(),
  pis: z.string().optional().nullable(),
  registrationNumber: z.string().optional().nullable(),
  admissionDate: z.string().optional().nullable(),
  ctps: z.string().optional().nullable(),
  positionName: z.string().optional().nullable(),
  departmentName: z.string().optional().nullable(),
  workScheduleId: z.number().int().positive().optional().nullable(),
  biometricExempt: z.boolean().optional().default(false),
  workLocationIds: z.array(z.number().int().positive()).optional().default([]),
  active: z.boolean().optional().default(true),
  accessEmail: z.string().email().optional().nullable().or(z.literal("")),
  accessPassword: z.string().min(6).optional().nullable().or(z.literal(""))
});

async function validateRelations(tenantId: number, companyId: number, scheduleId?: number | null, groupId?: number | null) {
  const [companies] = await pool.query<any[]>(
    "SELECT id FROM companies WHERE id=? AND tenant_id=? AND active=1 LIMIT 1",
    [companyId, tenantId]
  );
  if (!companies[0]) return "Empresa não encontrada neste tenant.";
  if (scheduleId) {
    const [schedules] = await pool.query<any[]>(
      "SELECT id FROM work_schedules WHERE id=? AND tenant_id=? AND company_id=? AND active=1 LIMIT 1",
      [scheduleId, tenantId, companyId]
    );
    if (!schedules[0]) return "Jornada não pertence à empresa selecionada.";
  }
  if (groupId) {
    const [groups] = await pool.query<any[]>("SELECT id FROM employee_groups WHERE id=? AND tenant_id=? AND company_id=?", [groupId, tenantId, companyId]);
    if (!groups.length) return "Grupo não pertence à empresa selecionada.";
  }
  return null;
}

async function validateLocations(tenantId: number, companyId: number, locationIds: number[]) {
  if (!locationIds.length) return null;
  const placeholders = locationIds.map(() => "?").join(",");
  const [rows] = await pool.query<any[]>(
    `SELECT id FROM work_locations WHERE tenant_id=? AND company_id=? AND active=1 AND id IN (${placeholders})`,
    [tenantId, companyId, ...locationIds]
  );
  return rows.length === locationIds.length ? null : "Um ou mais locais de trabalho são inválidos para a empresa selecionada.";
}

async function enforceEmployeePlanLimit(tenantId: number) {
  const [plans] = await pool.query<any[]>(
    `SELECT p.max_employees, s.status
       FROM subscriptions s JOIN plans p ON p.id=s.plan_id
      WHERE s.tenant_id=? ORDER BY s.id DESC LIMIT 1`,
    [tenantId]
  );
  const plan = plans[0];
  if (!plan || plan.max_employees == null || !["TRIAL", "ACTIVE"].includes(plan.status)) return null;
  const [counts] = await pool.query<any[]>(
    "SELECT COUNT(*) AS total FROM employees WHERE tenant_id=? AND active=1",
    [tenantId]
  );
  return Number(counts[0]?.total || 0) >= Number(plan.max_employees)
    ? `Limite do plano atingido (${plan.max_employees} funcionários).`
    : null;
}

employeesRouter.post(
  "/",
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"),
  async (req, res) => {
    const parsed = employeeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos.", issues: parsed.error.flatten() });
    const e = parsed.data;
    const relationError = await validateRelations(req.auth!.tenantId, e.companyId, e.workScheduleId, e.groupId);
    if (relationError) return res.status(400).json({ message: relationError });
    const locationError = await validateLocations(req.auth!.tenantId, e.companyId, e.workLocationIds);
    if (locationError) return res.status(400).json({ message: locationError });
    const planError = await enforceEmployeePlanLimit(req.auth!.tenantId);
    if (planError) return res.status(403).json({ message: planError });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query<any>(
        `INSERT INTO employees
         (tenant_id, company_id, name, cpf, pis, registration_number, admission_date, ctps,
          position_name, department_name, group_id, work_schedule_id, biometric_exempt, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${BRASILIA_NOW_SQL}, ${BRASILIA_NOW_SQL})`,
        [
          req.auth!.tenantId, e.companyId, e.name, e.cpf || null, e.pis || null,
          e.registrationNumber || null, e.admissionDate || null, e.ctps || null,
          e.positionName || null, e.departmentName || null, e.groupId || null, e.workScheduleId || null, e.biometricExempt ? 1 : 0, e.active ? 1 : 0
        ]
      );
      const employeeId = Number(result.insertId);

      for (const locationId of e.workLocationIds) {
        await conn.query(
          "INSERT INTO employee_locations (tenant_id, employee_id, work_location_id) VALUES (?, ?, ?)",
          [req.auth!.tenantId, employeeId, locationId]
        );
      }

      if (e.accessEmail && e.accessPassword) {
        const hash = await bcrypt.hash(e.accessPassword, 10);
        await conn.query(
          `INSERT INTO users
           (tenant_id, company_id, employee_id, name, email, password_hash, role, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'FUNCIONARIO', 1, ${BRASILIA_NOW_SQL}, ${BRASILIA_NOW_SQL})`,
          [req.auth!.tenantId, e.companyId, employeeId, e.name, e.accessEmail, hash]
        );
      }
      await conn.commit();
      await writeAudit(req, "CREATE", "employee", employeeId, undefined, { ...e, accessPassword: e.accessPassword ? "***" : null });
      res.status(201).json({ id: employeeId });
    } catch (error: any) {
      await conn.rollback();
      if (error?.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "CPF, matrícula ou e-mail já cadastrado." });
      throw error;
    } finally {
      conn.release();
    }
  }
);

employeesRouter.put(
  "/:id",
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"),
  async (req, res) => {
    const id = Number(req.params.id);
    const parsed = employeeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos." });
    const e = parsed.data;
    const relationError = await validateRelations(req.auth!.tenantId, e.companyId, e.workScheduleId, e.groupId);
    if (relationError) return res.status(400).json({ message: relationError });
    const locationError = await validateLocations(req.auth!.tenantId, e.companyId, e.workLocationIds);
    if (locationError) return res.status(400).json({ message: locationError });

    const [beforeRows] = await pool.query<any[]>(
      "SELECT * FROM employees WHERE id=? AND tenant_id=? LIMIT 1",
      [id, req.auth!.tenantId]
    );
    if (!beforeRows[0]) return res.status(404).json({ message: "Funcionário não encontrado." });
    // Older clients do not send groupId; preserve its existing association within the same company.
    if (e.groupId === undefined) e.groupId = Number(beforeRows[0].company_id) === e.companyId ? beforeRows[0].group_id : null;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE employees SET company_id=?, name=?, cpf=?, pis=?, registration_number=?, admission_date=?,
          ctps=?, position_name=?, department_name=?, group_id=?, work_schedule_id=?, biometric_exempt=?, active=?, updated_at=${BRASILIA_NOW_SQL}
          WHERE id=? AND tenant_id=?`,
        [
          e.companyId, e.name, e.cpf || null, e.pis || null, e.registrationNumber || null,
          e.admissionDate || null, e.ctps || null, e.positionName || null, e.departmentName || null, e.groupId || null,
          e.workScheduleId || null, e.biometricExempt ? 1 : 0, e.active ? 1 : 0, id, req.auth!.tenantId
        ]
      );

      const biometricPolicyChanged =
        Boolean(beforeRows[0].biometric_exempt) !== Boolean(e.biometricExempt);
      if (biometricPolicyChanged) {
        await conn.query(
          `UPDATE devices SET active=0,revoked_at=${BRASILIA_NOW_SQL}
            WHERE tenant_id=? AND employee_id=? AND active=1`,
          [req.auth!.tenantId, id]
        );
      }

      await conn.query("DELETE FROM employee_locations WHERE employee_id=? AND tenant_id=?", [id, req.auth!.tenantId]);
      for (const locationId of e.workLocationIds) {
        await conn.query(
          "INSERT INTO employee_locations (tenant_id, employee_id, work_location_id) VALUES (?, ?, ?)",
          [req.auth!.tenantId, id, locationId]
        );
      }

      const [users] = await conn.query<any[]>(
        "SELECT id FROM users WHERE employee_id=? AND tenant_id=? LIMIT 1",
        [id, req.auth!.tenantId]
      );
      if (users[0]) {
        if (e.accessEmail) {
          if (e.accessPassword) {
            const hash = await bcrypt.hash(e.accessPassword, 10);
            await conn.query(
              `UPDATE users SET company_id=?, name=?, email=?, password_hash=?, active=?, updated_at=${BRASILIA_NOW_SQL}
                WHERE id=? AND tenant_id=?`,
              [e.companyId, e.name, e.accessEmail, hash, e.active ? 1 : 0, users[0].id, req.auth!.tenantId]
            );
          } else {
            await conn.query(
              `UPDATE users SET company_id=?, name=?, email=?, active=?, updated_at=${BRASILIA_NOW_SQL}
                WHERE id=? AND tenant_id=?`,
              [e.companyId, e.name, e.accessEmail, e.active ? 1 : 0, users[0].id, req.auth!.tenantId]
            );
          }
        }
      } else if (e.accessEmail && e.accessPassword) {
        const hash = await bcrypt.hash(e.accessPassword, 10);
        await conn.query(
          `INSERT INTO users
           (tenant_id, company_id, employee_id, name, email, password_hash, role, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'FUNCIONARIO', ?, ${BRASILIA_NOW_SQL}, ${BRASILIA_NOW_SQL})`,
          [req.auth!.tenantId, e.companyId, id, e.name, e.accessEmail, hash, e.active ? 1 : 0]
        );
      }
      await conn.commit();
      await writeAudit(req, "UPDATE", "employee", id, beforeRows[0], { ...e, accessPassword: e.accessPassword ? "***" : null });
      res.json({ ok: true });
    } catch (error: any) {
      await conn.rollback();
      if (error?.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "CPF, matrícula ou e-mail já cadastrado." });
      throw error;
    } finally {
      conn.release();
    }
  }
);


employeesRouter.patch(
  "/:id/biometric",
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"),
  async (req, res) => {
    const id = Number(req.params.id);
    const parsed = z.object({ disabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Informe disabled=true ou false." });

    const [rows] = await pool.query<any[]>(
      "SELECT id,name,biometric_exempt FROM employees WHERE id=? AND tenant_id=? LIMIT 1",
      [id, req.auth!.tenantId]
    );
    const employee = rows[0];
    if (!employee) return res.status(404).json({ message: "Funcionário não encontrado." });

    const disabled = parsed.data.disabled;
    const previous = Boolean(employee.biometric_exempt);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE employees
            SET biometric_exempt=?, updated_at=${BRASILIA_NOW_SQL}
          WHERE id=? AND tenant_id=?`,
        [disabled ? 1 : 0, id, req.auth!.tenantId]
      );

      let revoked = 0;
      if (previous !== disabled) {
        const [result] = await conn.query<any>(
          `UPDATE devices
              SET active=0, revoked_at=${BRASILIA_NOW_SQL}
            WHERE tenant_id=? AND employee_id=? AND active=1`,
          [req.auth!.tenantId, id]
        );
        revoked = Number(result.affectedRows || 0);
      }

      await conn.commit();
      await writeAudit(
        req,
        disabled ? "BIOMETRIC_DISABLE" : "BIOMETRIC_ENABLE",
        "employee",
        id,
        { biometricExempt: previous },
        { biometricExempt: disabled, revokedDevices: revoked }
      );

      res.json({
        ok: true,
        biometricExempt: disabled,
        revokedDevices: revoked,
        message: disabled
          ? "Biometria desabilitada para o funcionário."
          : "Biometria habilitada para o funcionário."
      });
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
);

employeesRouter.delete(
  "/:id",
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"),
  async (req, res) => {
    const id = Number(req.params.id);
    const [result] = await pool.query<any>(
      `UPDATE employees SET active=0, updated_at=${BRASILIA_NOW_SQL} WHERE id=? AND tenant_id=?`,
      [id, req.auth!.tenantId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Funcionário não encontrado." });
    await pool.query(
      `UPDATE users SET active=0, updated_at=${BRASILIA_NOW_SQL} WHERE employee_id=? AND tenant_id=?`,
      [id, req.auth!.tenantId]
    );
    await writeAudit(req, "DEACTIVATE", "employee", id);
    res.json({ ok: true });
  }
);
