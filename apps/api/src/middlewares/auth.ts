import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

type TokenPayload = {
  userId: number;
  tenantId: number;
  companyId: number | null;
  employeeId: number | null;
  role: string;
  name: string;
  email: string;
};

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token não informado." });
  }

  try {
    const token = header.substring(7);
    req.auth = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    return next();
  } catch {
    return res.status(401).json({ message: "Token inválido ou expirado." });
  }
}
