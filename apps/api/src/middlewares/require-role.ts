import type { NextFunction, Request, Response } from "express";

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ message: "Não autenticado." });
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ message: "Sem permissão." });
    }
    next();
  };
}
