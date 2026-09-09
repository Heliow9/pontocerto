import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { signToken } from "../utils/jwt.js";
import { authMiddleware } from "../middlewares/auth.js";
import { passwordRouter } from "./password.routes.js";

export const authRouter = Router();
authRouter.use(passwordRouter);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: "Dados inválidos." });

  const { email, password } = parsed.data;
  const [rows] = await pool.query<any[]>(
    `SELECT u.id, u.tenant_id, u.company_id, u.employee_id, u.name, u.email,
            u.password_hash, u.role, u.active, t.status AS tenant_status
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
      WHERE LOWER(u.email) = LOWER(?)
      LIMIT 1`,
    [email],
  );

  const user = rows[0];
  if (
    !user ||
    !user.active ||
    (user.role !== "SUPER_ADMIN" && user.tenant_status !== "ACTIVE") ||
    !(await bcrypt.compare(password, user.password_hash))
  ) {
    return res.status(401).json({ message: "E-mail ou senha inválidos." });
  }

  const payload = {
    userId: Number(user.id),
    tenantId: Number(user.tenant_id),
    companyId: user.company_id ? Number(user.company_id) : null,
    employeeId: user.employee_id ? Number(user.employee_id) : null,
    role: user.role,
    name: user.name,
    email: user.email,
  };

  res.json({ token: signToken(payload), user: payload });
});

authRouter.get("/me", authMiddleware, async (req, res) => {
  const [rows] = await pool.query<any[]>(
    `SELECT u.id, u.name, u.email, u.role, u.company_id, u.employee_id,
            t.name AS tenant_name, c.legal_name AS company_name,
            e.registration_number, e.position_name
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       LEFT JOIN companies c ON c.id = u.company_id AND c.tenant_id = u.tenant_id
       LEFT JOIN employees e ON e.id = u.employee_id AND e.tenant_id = u.tenant_id
      WHERE u.id = ? AND u.tenant_id = ? LIMIT 1`,
    [req.auth!.userId, req.auth!.tenantId],
  );
  res.json(rows[0] || null);
});
