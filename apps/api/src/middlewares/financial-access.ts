import type { NextFunction, Request, Response } from "express";
import { getTenantFinancialAccess, syncSubscriptionFinancialStatus } from "../services/financial-access.service.js";

export async function financialAccessMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth || req.auth.role === "SUPER_ADMIN") return next();
    if (["/auth", "/billing", "/health"].some((base) => req.baseUrl.startsWith(base))) return next();
    const access = await getTenantFinancialAccess(req.auth.tenantId);
    await syncSubscriptionFinancialStatus(req.auth.tenantId, access.blocked);
    if (!access.blocked) return next();
    return res.status(402).json({
      code: "FINANCIAL_BLOCKED",
      message: req.auth.role === "TENANT_ADMIN"
        ? "Acesso temporariamente suspenso por pendência financeira. Acesse o Financeiro para regularizar."
        : "O acesso da organização está temporariamente indisponível. Procure o administrador da empresa.",
      tenantAdmin: req.auth.role === "TENANT_ADMIN",
    });
  } catch (e) { next(e); }
}
