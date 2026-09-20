import { adjustmentSchema } from "../utils/adjustment-validation.js";
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
export const adjustmentsRouter = Router();
adjustmentsRouter.use(authMiddleware);
const safe =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
adjustmentsRouter.get(
  "/",
  requireRole(
    "SUPER_ADMIN",
    "TENANT_ADMIN",
    "RH",
    "GESTOR",
    "SUPERVISOR",
    "FUNCIONARIO",
  ),
  safe(async (req, res) => {
    const params: any[] = [req.auth!.tenantId];
    let clause = "";
    if (req.auth!.role === "FUNCIONARIO") {
      if (!req.auth!.employeeId)
        return res.status(403).json({ message: "Funcionário necessário." });
      clause = " AND a.employee_id=?";
      params.push(req.auth!.employeeId);
    }
    const [rows] = await pool.query<any[]>(
      `SELECT a.*,e.name AS employee_name FROM time_adjustments a JOIN employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id WHERE a.tenant_id=? ${clause} ORDER BY a.requested_at DESC LIMIT 500`,
      params,
    );
    res.json(rows);
  }),
);
adjustmentsRouter.post(
  "/",
  requireRole("FUNCIONARIO"),
  safe(async (req, res) => {
    const parsed = adjustmentSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        message:
          "Informe data, horário, tipo e justificativa de pelo menos 5 caracteres.",
      });
    if (!req.auth!.employeeId)
      return res.status(403).json({ message: "Funcionário necessário." });
    const d = parsed.data;
    let original = null;
    if (d.timeEntryId) {
      const [rows] = await pool.query<any[]>(
        "SELECT registered_at FROM time_entries WHERE id=? AND tenant_id=? AND employee_id=?",
        [d.timeEntryId, req.auth!.tenantId, req.auth!.employeeId],
      );
      if (!rows[0])
        return res.status(404).json({ message: "Marcação não encontrada." });
      original = rows[0].registered_at;
    }
    const [result] = await pool.query<any>(
      `INSERT INTO time_adjustments (tenant_id,employee_id,time_entry_id,requested_at,original_time,requested_time,requested_entry_type,reason,status) VALUES (?,?,?,${BRASILIA_NOW_SQL},?,?,?,?,'PENDING')`,
      [
        req.auth!.tenantId,
        req.auth!.employeeId,
        d.timeEntryId || null,
        original,
        d.requestedTime.replace("T", " "),
        d.entryType,
        d.reason,
      ],
    );
    res.status(201).json({ id: result.insertId });
  }),
);
adjustmentsRouter.patch(
  "/:id",
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH", "GESTOR"),
  safe(async (req, res) => {
    const parsed = z
      .object({
        status: z.enum(["APPROVED", "REJECTED"]),
        note: z.string().trim().min(3).max(500),
      })
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        message: "Informe decisão e justificativa de pelo menos 3 caracteres.",
      });
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<any[]>(
        "SELECT a.*,e.company_id FROM time_adjustments a JOIN employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id WHERE a.id=? AND a.tenant_id=? FOR UPDATE",
        [Number(req.params.id), req.auth!.tenantId],
      );
      const item = rows[0];
      if (!item) {
        await conn.rollback();
        return res.status(404).json({ message: "Solicitação não encontrada." });
      }
      if (item.status !== "PENDING") {
        await conn.rollback();
        return res.status(409).json({
          message: "Esta solicitação já foi analisada. Atualize a lista.",
        });
      }
      if (parsed.data.status === "APPROVED") {
        if (item.time_entry_id) {
          const [current] = await conn.query<any[]>(
            "SELECT registered_at FROM time_entries WHERE id=? AND tenant_id=? AND employee_id=? FOR UPDATE",
            [item.time_entry_id, req.auth!.tenantId, item.employee_id],
          );
          if (
            !current[0] ||
            String(current[0].registered_at) !== String(item.original_time)
          ) {
            await conn.rollback();
            return res.status(409).json({
              message:
                "O registro foi alterado após a solicitação. Revise o pedido antes de aprovar.",
            });
          }
          await conn.query(
            "UPDATE time_entries SET registered_at=?,entry_type=?,manually_adjusted=1,adjustment_reason=? WHERE id=? AND tenant_id=? AND employee_id=?",
            [
              item.requested_time,
              item.requested_entry_type,
              item.reason,
              item.time_entry_id,
              req.auth!.tenantId,
              item.employee_id,
            ],
          );
        } else {
          const [insert] = await conn.query<any>(
            `INSERT INTO time_entries (tenant_id,company_id,employee_id,entry_type,registered_at,source,manually_adjusted,adjustment_reason,created_by_user_id,created_at) VALUES (?,?,?,?,?,'MANUAL',1,?,?,${BRASILIA_NOW_SQL})`,
            [
              req.auth!.tenantId,
              item.company_id,
              item.employee_id,
              item.requested_entry_type,
              item.requested_time,
              item.reason,
              req.auth!.userId,
            ],
          );
          await conn.query(
            "UPDATE time_adjustments SET time_entry_id=? WHERE id=? AND tenant_id=?",
            [insert.insertId, item.id, req.auth!.tenantId],
          );
        }
      }
      await conn.query(
        `UPDATE time_adjustments SET status=?,review_note=?,reviewed_by_user_id=?,reviewed_at=${BRASILIA_NOW_SQL} WHERE id=? AND tenant_id=?`,
        [
          parsed.data.status,
          parsed.data.note,
          req.auth!.userId,
          item.id,
          req.auth!.tenantId,
        ],
      );
      await conn.query(
        `INSERT INTO audit_logs (tenant_id,user_id,action,entity_type,entity_id,before_data,after_data,ip_address,user_agent,created_at) VALUES (?,?,?,?,?,?,?,?,?,${BRASILIA_NOW_SQL})`,
        [
          req.auth!.tenantId,
          req.auth!.userId,
          "REVIEW",
          "time_adjustment",
          item.id,
          JSON.stringify(item),
          JSON.stringify(parsed.data),
          req.ip || null,
          req.headers["user-agent"] || null,
        ],
      );
      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }),
);
