import type { Request } from "express";
import { pool } from "../db/pool.js";
import { BRASILIA_NOW_SQL } from "./db-time.js";
const secretPattern=/(password|senha|secret|token|jwt|authorization|smtp.*pass|pop3.*pass|credential|device.*secret|biometric.*image|face.*image)/i;
export function sanitizeAuditData(value:any):any{
  if(value==null)return value;
  if(Array.isArray(value))return value.map(sanitizeAuditData);
  if(typeof value!=="object")return value;
  const out:any={};
  for(const [key,v] of Object.entries(value))out[key]=secretPattern.test(key)?"[REDACTED]":sanitizeAuditData(v);
  return out;
}
export async function writeAudit(req: Request,action: string,entityType: string,entityId: number | null,beforeData?: unknown,afterData?: unknown,result:"SUCCESS"|"ERROR"="SUCCESS",details?:unknown) {
  if (!req.auth) return;
  await pool.query(`INSERT INTO audit_logs (tenant_id,company_id,user_id,executor_name,executor_email,executor_role,module,action,entity_type,entity_id,result,before_data,after_data,details,ip_address,user_agent,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,${BRASILIA_NOW_SQL})`,[
    req.auth.tenantId,req.auth.companyId||null,req.auth.userId,req.auth.name||null,req.auth.email||null,req.auth.role,req.baseUrl||null,action,entityType,entityId,result,
    beforeData?JSON.stringify(sanitizeAuditData(beforeData)):null,afterData?JSON.stringify(sanitizeAuditData(afterData)):null,details?JSON.stringify(sanitizeAuditData(details)):null,req.ip||null,req.headers["user-agent"]||null
  ]);
}
