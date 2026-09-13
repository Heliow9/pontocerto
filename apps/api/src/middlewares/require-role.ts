import type { NextFunction, Request, Response } from "express";
import { pool } from "../db/pool.js";
import { readJson,denyAllSupervisorPermissions,supervisorAllowed,sensitivePermissionAllowed,type SensitivePermission,type SensitivePermissions } from "../services/commercial-rules.js";
import { writeAudit } from "../utils/audit.js";

function sensitiveFor(req:Request):SensitivePermission|null{
  const base=req.baseUrl,path=req.path,method=req.method;
  if(base==="/audit")return "audit.view";
  if(base==="/reports" && (path.includes("export")||path.includes("payroll")||path.includes("download")||String(req.query.format||"").toLowerCase()!==""))return "reports.export";
  if(base==="/time-entries" && !["GET","HEAD","OPTIONS"].includes(method))return "points.adjust";
  if(base==="/adjustments" && !["GET","HEAD","OPTIONS"].includes(method))return "adjustments.approve";
  if(base==="/automation" && path.includes("whatsapp"))return "whatsapp.manage";
  if(base==="/automation" && (path.includes("overtime")||path.includes("/summary")||path.startsWith("/limits/")||(!["GET","HEAD","OPTIONS"].includes(method)&&path.startsWith("/companies/"))))return "overtime.manage";
  return null;
}

export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.auth) return res.status(401).json({ message: "Não autenticado." });
      if(req.auth.role==="SUPER_ADMIN" && !["/saas","/auth"].some(path=>req.baseUrl.startsWith(path))) {
        await writeAudit(req,"ACCESS_DENIED","request",null,undefined,undefined,"ERROR",{path:req.originalUrl,reason:"SUPER_ADMIN_OPERATIONAL_BLOCK"});
        return res.status(403).json({message:"Use o painel SaaS. Operações de empresa pertencem ao ambiente do cliente."});
      }
      if(req.auth.role==="SUPERVISOR") {
        const [rows]=await pool.query<any[]>("SELECT u.active,p.permissions_json,p.sensitive_permissions_json FROM users u LEFT JOIN user_permissions p ON p.user_id=u.id AND p.tenant_id=u.tenant_id WHERE u.id=? AND u.tenant_id=? AND u.role='SUPERVISOR'",[req.auth.userId,req.auth.tenantId]);
        const row=rows[0];
        if(!row?.active)return res.status(403).json({message:"Acesso do supervisor desativado."});
        const permissions=row.permissions_json?readJson(row.permissions_json,denyAllSupervisorPermissions):denyAllSupervisorPermissions;
        const sensitive:SensitivePermissions=row.sensitive_permissions_json?readJson(row.sensitive_permissions_json,{}):{};
        const granular=sensitiveFor(req);
        const allowed=Boolean(row.permissions_json)&&supervisorAllowed(permissions,req.baseUrl,req.method,req.path)&&(!granular||sensitivePermissionAllowed(sensitive,granular));
        if(!allowed){await writeAudit(req,"ACCESS_DENIED","request",null,undefined,undefined,"ERROR",{path:req.originalUrl,requiredPermission:granular||null});return res.status(403).json({message:"Esta ação não está liberada nas suas permissões."});}
        return next();
      }
      if (!roles.includes(req.auth.role)) return res.status(403).json({ message: "Sem permissão." });
      next();
    } catch(error){next(error);}
  };
}
