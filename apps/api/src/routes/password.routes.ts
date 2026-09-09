import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";

export const passwordRouter = Router();
const schema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: z
      .string()
      .min(8)
      .refine((value) => Buffer.byteLength(value, "utf8") <= 72),
    confirmPassword: z.string().min(1).max(256),
  })
  .refine((value) => value.newPassword === value.confirmPassword)
  .refine((value) => value.newPassword !== value.currentPassword);

passwordRouter.post("/password", authMiddleware, async (req, res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({
        message:
          "Use uma nova senha diferente da atual, com no mínimo 8 caracteres e no máximo 72 bytes. A confirmação deve ser igual à nova senha.",
      });
  try {
    const { userId, tenantId } = req.auth!;
    const [rows] = await pool.query<any[]>(
      `SELECT u.password_hash FROM users u JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = ? AND u.tenant_id = ? AND u.active = 1
       AND (u.role = 'SUPER_ADMIN' OR t.status = 'ACTIVE') LIMIT 1`,
      [userId, tenantId],
    );
    const user = rows[0];
    if (!user)
      return res
        .status(403)
        .json({
          message: "Esta conta não está disponível para alteração de senha.",
        });
    if (
      !(await bcrypt.compare(parsed.data.currentPassword, user.password_hash))
    )
      return res.status(400).json({ message: "A senha atual está incorreta." });
    if (await bcrypt.compare(parsed.data.newPassword, user.password_hash))
      return res
        .status(400)
        .json({ message: "A nova senha deve ser diferente da atual." });
    const hash = await bcrypt.hash(parsed.data.newPassword, 12);
    // Compare-and-swap prevents a concurrent password change being overwritten.
    const [result] = await pool.query<any>(
      "UPDATE users SET password_hash = ? WHERE id = ? AND tenant_id = ? AND password_hash = ? AND active = 1",
      [hash, userId, tenantId, user.password_hash],
    );
    if (result.affectedRows !== 1)
      return res
        .status(409)
        .json({
          message:
            "A senha foi alterada em outra sessão. Confira sua senha atual e tente novamente.",
        });
    return res.json({ message: "Senha alterada com sucesso." });
  } catch (error) {
    next(error);
  }
});
