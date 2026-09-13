import { requireRole } from "./require-role.js";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { isSessionToken, readSession } from "../services/session.service.js";

type TokenPayload = {
  userId: number;
  tenantId: number;
  companyId: number | null;
  employeeId: number | null;
  role: string;
  name: string;
  email: string;
};

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token não informado." });
  }

  const token = header.substring(7);
  if (isSessionToken(token)) {
    try {
      const session = await readSession(token);
      if (!session)
        return res
          .status(401)
          .json({ message: "Sessão encerrada. Entre novamente." });
      req.auth = session;
      return authorize(req,res,next);
    } catch (error) {
      // A database outage must not turn into a logout on the client.
      return next(error);
    }
  }
  try {
    req.auth = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    return authorize(req,res,next);
  } catch {
    return res.status(401).json({ message: "Token inválido ou expirado." });
  }
}

function authorize(req:Request,res:Response,next:NextFunction){
  if(req.baseUrl==="/auth")return next();
  return requireRole(req.auth!.role)(req,res,next);
}
