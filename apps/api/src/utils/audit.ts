import type { Request } from "express";
import { pool } from "../db/pool.js";
import { BRASILIA_NOW_SQL } from "./db-time.js";

export async function writeAudit(
  req: Request,
  action: string,
  entityType: string,
  entityId: number | null,
  beforeData?: unknown,
  afterData?: unknown
) {
  if (!req.auth) return;
  await pool.query(
    `INSERT INTO audit_logs
     (tenant_id, user_id, action, entity_type, entity_id, before_data, after_data,
      ip_address, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${BRASILIA_NOW_SQL})`,
    [
      req.auth.tenantId,
      req.auth.userId,
      action,
      entityType,
      entityId,
      beforeData ? JSON.stringify(beforeData) : null,
      afterData ? JSON.stringify(afterData) : null,
      req.ip || null,
      req.headers["user-agent"] || null
    ]
  );
}
