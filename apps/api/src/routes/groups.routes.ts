import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { writeAudit } from "../utils/audit.js";

export const groupsRouter = Router();
groupsRouter.use(
  authMiddleware,
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH", "GESTOR", "SUPERVISOR"),
);
groupsRouter.param("id", (req, res, next, value) => {
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) <= 0
  )
    return res.status(400).json({ message: "Grupo inválido." });
  next();
});
const safe =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
const schema = z.object({
  companyId: z.number().int().positive(),
  name: z.string().trim().min(2).max(120),
});

groupsRouter.get(
  "/",
  safe(async (req, res) => {
    const companyId = req.auth!.companyId;
    const [rows] = await pool.query<any[]>(
      `SELECT g.id, g.company_id, g.name,
    COUNT(e.id) AS employee_count FROM employee_groups g
    LEFT JOIN employees e ON e.group_id=g.id AND e.tenant_id=g.tenant_id AND e.company_id=g.company_id AND e.active=1
    WHERE g.tenant_id=?${companyId ? " AND g.company_id=?" : ""}
    GROUP BY g.id,g.company_id,g.name ORDER BY g.name`,
      [req.auth!.tenantId, ...(companyId ? [companyId] : [])],
    );
    res.json(rows);
  }),
);

for (const method of ["post", "put"] as const) {
  groupsRouter[method](
    method === "post" ? "/" : "/:id",
    requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"),
    safe(async (req, res) => {
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({
          message: "Informe empresa e nome do grupo (2 a 120 caracteres).",
        });
      const { companyId, name } = parsed.data;
      if (req.auth!.companyId && Number(req.auth!.companyId) !== companyId)
        return res.status(404).json({ message: "Empresa não encontrada." });
      const [companies] = await pool.query<any[]>(
        "SELECT id FROM companies WHERE id=? AND tenant_id=? AND active=1",
        [companyId, req.auth!.tenantId],
      );
      if (!companies.length)
        return res.status(404).json({ message: "Empresa não encontrada." });
      try {
        const [result] =
          method === "post"
            ? await pool.query<any>(
                "INSERT INTO employee_groups (tenant_id,company_id,name) VALUES (?,?,?)",
                [req.auth!.tenantId, companyId, name],
              )
            : await pool.query<any>(
                "UPDATE employee_groups SET name=? WHERE id=? AND tenant_id=? AND company_id=?",
                [name, Number(req.params.id), req.auth!.tenantId, companyId],
              );
        if (method === "put" && !result.affectedRows)
          return res.status(404).json({ message: "Grupo não encontrado." });
        const id =
          method === "post" ? Number(result.insertId) : Number(req.params.id);
        await writeAudit(
          req,
          method === "post" ? "CREATE" : "UPDATE",
          "employee_group",
          id,
          undefined,
          { companyId, name },
        );
        res.status(method === "post" ? 201 : 200).json({ id });
      } catch (error: any) {
        if (error.code === "ER_DUP_ENTRY")
          return res.status(409).json({
            message: "Já existe um grupo com esse nome nesta empresa.",
          });
        throw error;
      }
    }),
  );
}

groupsRouter.put(
  "/:id/members",
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"),
  safe(async (req, res) => {
    const parsed = z
      .object({
        employeeIds: z
          .array(z.number().int().positive())
          .max(500)
          .refine((ids) => new Set(ids).size === ids.length),
      })
      .safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ message: "Selecione até 500 funcionários únicos." });
    const id = Number(req.params.id),
      tenantId = req.auth!.tenantId;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [groups] = await conn.query<any[]>(
        "SELECT id,company_id FROM employee_groups WHERE id=? AND tenant_id=? FOR UPDATE",
        [id, tenantId],
      );
      const group = groups[0];
      if (
        !group ||
        (req.auth!.companyId &&
          Number(req.auth!.companyId) !== Number(group.company_id))
      ) {
        await conn.rollback();
        return res.status(404).json({ message: "Grupo não encontrado." });
      }
      const ids = parsed.data.employeeIds;
      if (ids.length) {
        const [members] = await conn.query<any[]>(
          `SELECT id FROM employees WHERE tenant_id=? AND company_id=? AND id IN (${ids.map(() => "?").join(",")}) FOR UPDATE`,
          [tenantId, group.company_id, ...ids],
        );
        if (members.length !== ids.length) {
          await conn.rollback();
          return res
            .status(400)
            .json({ message: "Selecione apenas funcionários desta empresa." });
        }
      }
      await conn.query(
        "UPDATE employees SET group_id=NULL WHERE tenant_id=? AND company_id=? AND group_id=?",
        [tenantId, group.company_id, id],
      );
      if (ids.length)
        await conn.query(
          `UPDATE employees SET group_id=? WHERE tenant_id=? AND company_id=? AND id IN (${ids.map(() => "?").join(",")})`,
          [id, tenantId, group.company_id, ...ids],
        );
      await conn.commit();
      await writeAudit(
        req,
        "GROUP_MEMBERS_UPDATED",
        "employee_group",
        id,
        undefined,
        { employeeIds: ids },
      );
      res.json({ ok: true });
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }),
);

groupsRouter.delete(
  "/:id",
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"),
  safe(async (req, res) => {
    try {
      const companyId = req.auth!.companyId;
      const [result] = await pool.query<any>(
        `DELETE FROM employee_groups WHERE id=? AND tenant_id=?${companyId ? " AND company_id=?" : ""}`,
        [
          Number(req.params.id),
          req.auth!.tenantId,
          ...(companyId ? [companyId] : []),
        ],
      );
      if (!result.affectedRows)
        return res.status(404).json({ message: "Grupo não encontrado." });
      await writeAudit(req, "DELETE", "employee_group", Number(req.params.id));
      res.json({ ok: true });
    } catch (error: any) {
      if (error.code === "ER_ROW_IS_REFERENCED_2")
        return res.status(409).json({
          message:
            "Remova os vínculos dos funcionários antes de excluir o grupo.",
        });
      throw error;
    }
  }),
);
