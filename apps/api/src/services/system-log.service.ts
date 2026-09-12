import { pool } from "../db/pool.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";

export type SystemLogLevel = "INFO" | "WARNING" | "ERROR";
export type SystemLogModule =
  | "WHATSAPP"
  | "POINT"
  | "OFFLINE"
  | "SYNC"
  | "API"
  | "SYSTEM";

type LogInput = {
  tenantId: number;
  companyId: number;
  level?: SystemLogLevel;
  module: SystemLogModule;
  eventType: string;
  message: string;
  details?: unknown;
  employeeId?: number | null;
  recipient?: string | null;
};

const SECRET_KEYS = /password|senha|token|authorization|cookie|secret|encryption|credential|auth_key|encrypted_value|jwt|session/i;

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[TRUNCATED]";
  if (value == null || typeof value === "number" || typeof value === "boolean")
    return value;
  if (typeof value === "string") return value.slice(0, 1000);
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.test(key)) {
        result[key] = "[REDACTED]";
        continue;
      }
      result[key] = sanitizeValue(item, depth + 1);
    }
    return result;
  }
  return String(value).slice(0, 1000);
}

export function maskRecipient(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 6) return "*".repeat(Math.max(4, digits.length));
  return `${digits.slice(0, 4)}${"*".repeat(Math.max(4, digits.length - 8))}${digits.slice(-4)}`;
}

export async function writeSystemLog(input: LogInput) {
  if (!Number.isSafeInteger(input.tenantId) || !Number.isSafeInteger(input.companyId))
    return;
  try {
    const details = input.details == null ? null : sanitizeValue(input.details);
    await pool.query(
      `INSERT INTO system_logs
       (tenant_id,company_id,level,module,event_type,message,details_json,employee_id,recipient,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,${BRASILIA_NOW_SQL})`,
      [
        input.tenantId,
        input.companyId,
        input.level || "INFO",
        input.module,
        input.eventType.slice(0, 80),
        input.message.slice(0, 500),
        details == null ? null : JSON.stringify(details),
        input.employeeId || null,
        input.recipient ? String(input.recipient).replace(/\D/g, "").slice(0, 20) : null,
      ],
    );
  } catch (error) {
    console.warn("Falha ao persistir log operacional:", (error as any)?.message || error);
  }
}

export async function cleanupSystemLogs() {
  const [result] = await pool.query<any>(
    "DELETE FROM system_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)",
  );
  return Number(result?.affectedRows || 0);
}

export function startSystemLogCleanupWorker() {
  const run = () =>
    void cleanupSystemLogs().catch((error) =>
      console.warn("Falha na retenção de logs:", (error as any)?.message || error),
    );
  run();
  const timer = setInterval(run, 24 * 60 * 60 * 1000);
  timer.unref();
  return timer;
}
