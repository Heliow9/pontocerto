import type { NextFunction, Request, Response } from "express";
import { pool } from "../db/pool.js";
import { readJson,defaultSupervisorPermissions,supervisorAllowed } from "../services/commercial-rules.js";
import { writeAudit } from "../utils/audit.js";

export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
    if (!req.auth) return res.status(401).json({ message: "Não autenticado." });
    if (["SUPER_ADMIN","SUPERVISOR"].includes(req.auth.role) && !(res.locals.auditAttached)) {
      res.locals.auditAttached=true;
      const auditBase=req.baseUrl||"request",auditPath=req.originalUrl;
      res.once("finish",()=>{void Promise.resolve().then(()=>writeAudit(req,`HTTP_${req.method}`,auditBase,null,undefined,{path:auditPath,status:res.statusCode})).catch(error=>console.error("Falha ao registrar auditoria de acesso",error));});
    }
    if(req.auth.role==="SUPER_ADMIN" && !["/saas","/auth"].some(path=>req.baseUrl.startsWith(path)))
      return res.status(403).json({message:"Use o painel SaaS. Operações de empresa pertencem ao ambiente do cliente."});
    if(req.auth.role==="SUPERVISOR") {
      const [rows]=res.locals.supervisorRows ? [res.locals.supervisorRows] : await pool.query<any[]>("SELECT u.active,p.permissions_json FROM users u LEFT JOIN user_permissions p ON p.user_id=u.id AND p.tenant_id=u.tenant_id WHERE u.id=? AND u.tenant_id=? AND u.role='SUPERVISOR'",[req.auth.userId,req.auth.tenantId]);
      res.locals.supervisorRows=rows;
      if(!rows[0]?.active)return res.status(403).json({message:"Acesso do supervisor desativado."});
      const allowed=rows[0].permissions_json ? supervisorAllowed(readJson(rows[0].permissions_json,defaultSupervisorPermissions),req.baseUrl,req.method,req.path) : roles.includes("SUPERVISOR");
      if(!allowed)return res.status(403).json({message:"Esta ação não está liberada nas suas permissões."});
      return next();
    }
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ message: "Sem permissão." });
    }
    next();
    } catch(error){next(error);}
  };
}
