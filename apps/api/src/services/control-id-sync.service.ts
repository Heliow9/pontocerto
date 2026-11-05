import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import {
  buildControlIdPushCommand,
  controlIdResultDecision,
  controlIdResultError,
  type ControlIdJobType,
} from "./control-id-core.js";

async function terminalForCompany(tenantId: number, companyId: number) {
  const [rows] = await pool.query<any[]>(
    "SELECT id FROM control_id_terminals WHERE tenant_id=? AND company_id=? AND active=1 LIMIT 1",
    [tenantId, companyId],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

async function queueJob(args: {
  db?: any;
  terminalId: number;
  employeeId: number;
  jobType: ControlIdJobType;
  version: number;
  payload: Record<string, unknown>;
}) {
  const db = args.db ?? pool;
  const dedupe = `employee:${args.employeeId}:${args.jobType}:v${args.version}`;
  await db.query(
    `INSERT IGNORE INTO control_id_sync_jobs
     (terminal_id,employee_id,job_type,projection_version,deduplication_key,payload_json,status,attempts,available_at,created_at,updated_at)
     VALUES (?,?,?,?,?,?,'PENDING',0,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,
    [args.terminalId, args.employeeId, args.jobType, args.version, dedupe, JSON.stringify(args.payload)],
  );
}

export async function enqueueControlIdEmployeeSync(args: {
  tenantId: number;
  companyId: number;
  employeeId: number;
}) {
  const terminalId = await terminalForCompany(args.tenantId, args.companyId);
  if (!terminalId) return { queued: false, reason: "TERMINAL_NOT_CONFIGURED" };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<any[]>(
      `SELECT e.id,e.name,e.registration_number,e.active,f.image,f.updated_at
         FROM employees e
         LEFT JOIN employee_face_images f ON f.employee_id=e.id AND f.tenant_id=e.tenant_id
        WHERE e.id=? AND e.tenant_id=? AND e.company_id=? LIMIT 1 FOR UPDATE`,
      [args.employeeId, args.tenantId, args.companyId],
    );
    const employee = rows[0];
    if (!employee?.active || !employee.image) {
      await conn.rollback();
      return { queued: false, reason: employee ? "FACE_REQUIRED" : "EMPLOYEE_NOT_FOUND" };
    }
    await conn.query(
      `INSERT INTO control_id_employee_mappings
       (terminal_id,tenant_id,company_id,employee_id,vendor_user_id,desired_version,synced_version,sync_status,created_at,updated_at)
       VALUES (?,?,?,?,?,1,0,'PENDING',${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})
       ON DUPLICATE KEY UPDATE desired_version=desired_version+1,sync_status='PENDING',disabled_at=NULL,last_error_code=NULL,last_error_message=NULL,updated_at=${BRASILIA_NOW_SQL}`,
      [terminalId, args.tenantId, args.companyId, employee.id, employee.id],
    );
    const [mappings] = await conn.query<any[]>(
      "SELECT desired_version FROM control_id_employee_mappings WHERE terminal_id=? AND employee_id=? LIMIT 1 FOR UPDATE",
      [terminalId, employee.id],
    );
    const version = Number(mappings[0].desired_version);
    const registration = String(employee.registration_number || employee.id);
    await queueJob({
      db: conn, terminalId, employeeId: Number(employee.id), jobType: "UPSERT_USER", version,
      payload: { vendorUserId: Number(employee.id), name: employee.name, registration },
    });
    await queueJob({
      db: conn, terminalId, employeeId: Number(employee.id), jobType: "UPSERT_FACE", version,
      payload: {
        vendorUserId: Number(employee.id),
        imageBase64: Buffer.from(employee.image).toString("base64"),
        timestamp: Math.floor(new Date(employee.updated_at || Date.now()).getTime() / 1000),
      },
    });
    await conn.commit();
    return { queued: true, terminalId, version };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function enqueueControlIdEmployeeRemoval(args: {
  tenantId: number;
  employeeId: number;
  faceOnly?: boolean;
}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<any[]>(
      `SELECT m.terminal_id,m.employee_id,m.vendor_user_id,m.desired_version
         FROM control_id_employee_mappings m
        WHERE m.tenant_id=? AND m.employee_id=? AND m.sync_status<>'REMOVED' FOR UPDATE`,
      [args.tenantId, args.employeeId],
    );
    for (const mapping of rows) {
      const version = Number(mapping.desired_version) + 1;
      await conn.query(
        `UPDATE control_id_employee_mappings
            SET desired_version=?,sync_status='REMOVAL_PENDING',disabled_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL}
          WHERE terminal_id=? AND employee_id=?`,
        [version, mapping.terminal_id, mapping.employee_id],
      );
      await queueJob({
        db: conn, terminalId: Number(mapping.terminal_id), employeeId: Number(mapping.employee_id),
        jobType: "DELETE_FACE", version, payload: { vendorUserId: Number(mapping.vendor_user_id) },
      });
      if (!args.faceOnly)
        await queueJob({
          db: conn, terminalId: Number(mapping.terminal_id), employeeId: Number(mapping.employee_id),
          jobType: "DELETE_USER", version, payload: { vendorUserId: Number(mapping.vendor_user_id) },
        });
    }
    await conn.commit();
    return { queued: rows.length > 0, mappings: rows.length };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function enqueueControlIdCompanySync(tenantId: number, companyId: number) {
  const [employees] = await pool.query<any[]>(
    `SELECT e.id FROM employees e
      JOIN employee_face_images f ON f.employee_id=e.id AND f.tenant_id=e.tenant_id
     WHERE e.tenant_id=? AND e.company_id=? AND e.active=1 ORDER BY e.id`,
    [tenantId, companyId],
  );
  let queued = 0;
  for (const employee of employees) {
    const result = await enqueueControlIdEmployeeSync({ tenantId, companyId, employeeId: Number(employee.id) });
    if (result.queued) queued += 1;
  }
  return { eligible: employees.length, queued };
}

export async function claimControlIdPushJob(terminalId: number, uuidInput: unknown) {
  const uuid = String(uuidInput || randomUUID()).slice(0, 80);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE control_id_sync_jobs SET status='FAILED',available_at=${BRASILIA_NOW_SQL},push_uuid=NULL,updated_at=${BRASILIA_NOW_SQL}
        WHERE terminal_id=? AND status='CLAIMED' AND claimed_at<DATE_SUB(${BRASILIA_NOW_SQL},INTERVAL 2 MINUTE)`,
      [terminalId],
    );
    await conn.query(
      `UPDATE control_id_sync_jobs j
         JOIN control_id_employee_mappings m ON m.terminal_id=j.terminal_id AND m.employee_id=j.employee_id
          SET j.status='DEAD',j.last_error='SUPERSEDED',j.completed_at=${BRASILIA_NOW_SQL},j.updated_at=${BRASILIA_NOW_SQL}
        WHERE j.terminal_id=? AND j.status IN ('PENDING','FAILED') AND j.projection_version<m.desired_version`,
      [terminalId],
    );
    const [rows] = await conn.query<any[]>(
      `SELECT j.id,j.job_type,j.payload_json FROM control_id_sync_jobs j
        WHERE j.terminal_id=? AND j.status IN ('PENDING','FAILED') AND j.available_at<=${BRASILIA_NOW_SQL}
          AND NOT EXISTS (
            SELECT 1 FROM control_id_sync_jobs prior
             WHERE prior.terminal_id=j.terminal_id AND prior.employee_id=j.employee_id
               AND prior.projection_version=j.projection_version AND prior.id<j.id AND prior.status<>'SUCCEEDED'
          )
        ORDER BY j.id LIMIT 1 FOR UPDATE`,
      [terminalId],
    );
    if (!rows[0]) {
      await conn.commit();
      return null;
    }
    const row = rows[0];
    await conn.query(
      `UPDATE control_id_sync_jobs SET status='CLAIMED',attempts=attempts+1,claimed_at=${BRASILIA_NOW_SQL},push_uuid=?,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,
      [uuid, row.id],
    );
    await conn.commit();
    const payload = typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json;
    return buildControlIdPushCommand({ id: Number(row.id), jobType: row.job_type, payload });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function completeControlIdPushJob(args: {
  terminalId: number;
  uuid: unknown;
  response?: unknown;
  error?: unknown;
}) {
  const uuid = String(args.uuid || "").slice(0, 80);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<any[]>(
      `SELECT id,employee_id,job_type,projection_version,status,attempts FROM control_id_sync_jobs
        WHERE terminal_id=? AND push_uuid=? LIMIT 1 FOR UPDATE`,
      [args.terminalId, uuid],
    );
    const job = rows[0];
    if (!job) {
      await conn.commit();
      return { replayed: true, found: false };
    }
    const error = controlIdResultError(args.response, args.error);
    const decision = controlIdResultDecision({
      currentStatus: job.status,
      attempts: Number(job.attempts),
      error,
    });
    if (job.status === "SUCCEEDED") {
      await conn.commit();
      return { replayed: true, found: true, status: "SUCCEEDED" };
    }
    await conn.query(
      `UPDATE control_id_sync_jobs SET status=?,completed_at=?,available_at=IF(?,DATE_ADD(${BRASILIA_NOW_SQL},INTERVAL 30 SECOND),available_at),
        vendor_response_json=?,last_error=?,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,
      [
        decision.status,
        decision.retry ? null : new Date(),
        decision.retry ? 1 : 0,
        args.response == null ? null : JSON.stringify(args.response),
        error,
        job.id,
      ],
    );
    if (job.employee_id) {
      const [mappings] = await conn.query<any[]>(
        "SELECT desired_version FROM control_id_employee_mappings WHERE terminal_id=? AND employee_id=? LIMIT 1 FOR UPDATE",
        [args.terminalId, job.employee_id],
      );
      const current = Number(mappings[0]?.desired_version) === Number(job.projection_version);
      if (current && decision.status === "SUCCEEDED" && job.job_type === "UPSERT_FACE")
        await conn.query(
          `UPDATE control_id_employee_mappings SET synced_version=?,sync_status='SYNCED',last_synced_at=${BRASILIA_NOW_SQL},last_error_code=NULL,last_error_message=NULL,updated_at=${BRASILIA_NOW_SQL}
            WHERE terminal_id=? AND employee_id=? AND desired_version=?`,
          [job.projection_version, args.terminalId, job.employee_id, job.projection_version],
        );
      else if (
        current &&
        decision.status === "SUCCEEDED" &&
        ["DELETE_FACE", "DELETE_USER"].includes(job.job_type)
      )
        await conn.query(
          `UPDATE control_id_employee_mappings SET sync_status='REMOVED',last_synced_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL}
            WHERE terminal_id=? AND employee_id=? AND desired_version=?`,
          [args.terminalId, job.employee_id, job.projection_version],
        );
      else if (current && error)
        await conn.query(
          `UPDATE control_id_employee_mappings SET sync_status='ERROR',last_error_code='PUSH_FAILED',last_error_message=?,updated_at=${BRASILIA_NOW_SQL}
            WHERE terminal_id=? AND employee_id=? AND desired_version=?`,
          [error.slice(0, 500), args.terminalId, job.employee_id, job.projection_version],
        );
    }
    await conn.commit();
    return { replayed: false, found: true, status: decision.status, retry: decision.retry };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
