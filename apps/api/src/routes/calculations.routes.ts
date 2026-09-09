import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { processPeriod } from "../services/calculation.service.js";

export const calculationsRouter = Router();
calculationsRouter.use(authMiddleware);

const schema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employeeId: z.number().int().positive().optional()
});

calculationsRouter.post(
  "/process",
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH", "GESTOR"),
  async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos." });
    if (parsed.data.end < parsed.data.start) return res.status(400).json({ message: "Período inválido." });
    const result = await processPeriod({ tenantId: req.auth!.tenantId, ...parsed.data });
    res.json(result);
  }
);
