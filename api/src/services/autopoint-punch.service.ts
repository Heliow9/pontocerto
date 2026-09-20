import { pool } from "../db/pool.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { identifyEmployeeFace } from "./face-collection.service.js";
import { evaluateEmployeeSchedule } from "./schedule-guard.service.js";
import { saveFaceCheck } from "./face-verification.service.js";
import {
  removeTimeEntrySelfie,
  saveTimeEntrySelfie,
} from "./selfie.service.js";

export function autoPointError(
  message: string,
  code: string,
  status = 422,
  details?: Record<string, unknown>,
) {
  return Object.assign(new Error(message), { code, status, details });
}

export async function registerAutoPoint(args: {
  tenantId: number;
  companyId: number;
  terminalId: number;
  cooldownSeconds: number;
  image: Buffer;
  mimeType: string;
}) {
  const identified = await identifyEmployeeFace({
    tenantId: args.tenantId,
    companyId: args.companyId,
    image: args.image,
  });
  if (!identified.recognized) {
    const noFace = identified.code === "AUTOPONT_NO_FACE";
    throw autoPointError(
      noFace
        ? "Posicione o rosto de frente para a câmera."
        : "Rosto não reconhecido. Tente novamente ou procure o responsável.",
      identified.code,
      422,
    );
  }

  const gate = await pool.getConnection();
  const lockName = `pc:punch:${args.tenantId}:${identified.employeeId}`;
  let locked = false;
  let savedSelfiePath: string | null = null;
  try {
    const [lockRows] = await gate.query<any[]>(
      "SELECT GET_LOCK(?,5) AS acquired",
      [lockName],
    );
    locked = Number(lockRows[0]?.acquired) === 1;
    if (!locked) {
      throw autoPointError(
        "Uma marcação deste funcionário já está sendo processada.",
        "AUTOPONT_BUSY",
        409,
      );
    }

    const [recent] = await gate.query<any[]>(
      `SELECT id,entry_type,registered_at,
              TIMESTAMPDIFF(SECOND,registered_at,${BRASILIA_NOW_SQL}) AS seconds_ago
         FROM time_entries
        WHERE tenant_id=? AND company_id=? AND employee_id=? AND source='AUTO_POINT'
        ORDER BY registered_at DESC LIMIT 1`,
      [args.tenantId, args.companyId, identified.employeeId],
    );
    const secondsAgo = Number(recent[0]?.seconds_ago ?? 999999);
    if (secondsAgo >= 0 && secondsAgo < args.cooldownSeconds) {
      const waitSeconds = Math.max(1, args.cooldownSeconds - secondsAgo);
      throw autoPointError(
        `Ponto já registrado. Aguarde ${waitSeconds}s antes de uma nova marcação.`,
        "AUTOPONT_COOLDOWN",
        429,
        { waitSeconds },
      );
    }

    const schedule = await evaluateEmployeeSchedule({
      tenantId: args.tenantId,
      companyId: args.companyId,
      employeeId: identified.employeeId,
    });
    if (schedule.decision === "BLOCKED") {
      throw autoPointError(
        schedule.message || "Marcação fora da jornada permitida.",
        "AUTOPONT_SCHEDULE_BLOCKED",
        403,
      );
    }
    if (schedule.complete) {
      throw autoPointError(
        "A jornada de hoje já possui todas as marcações previstas.",
        "AUTOPONT_SCHEDULE_COMPLETE",
        409,
      );
    }

    const entryType = String(schedule.nextType || "OTHER");
    await gate.beginTransaction();
    try {
      const [result] = await gate.query<any>(
        `INSERT INTO time_entries
         (tenant_id,company_id,employee_id,entry_type,registered_at,device_id,autopoint_terminal_id,source,
          manually_adjusted,created_by_user_id,created_at,schedule_decision,scheduled_work_date)
         VALUES (?,?,?,?,${BRASILIA_NOW_SQL},NULL,?,'AUTO_POINT',0,NULL,${BRASILIA_NOW_SQL},?,?)`,
        [
          args.tenantId,
          args.companyId,
          identified.employeeId,
          entryType,
          args.terminalId,
          schedule.decision,
          schedule.workDate || null,
        ],
      );
      const timeEntryId = Number(result.insertId);
      await saveFaceCheck(gate, args.tenantId, identified.employeeId, timeEntryId, {
        required: true,
        verified: true,
        decision: "VERIFIED",
        code: null,
        similarity: identified.similarity,
        threshold: identified.threshold,
        provider: "AWS_REKOGNITION",
      });
      await gate.query(
        `INSERT INTO time_entry_schedule_checks
         (tenant_id,time_entry_id,employee_id,work_schedule_id,work_date,weekday,schedule_text,expected_entry_type,decision,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,${BRASILIA_NOW_SQL})`,
        [
          args.tenantId,
          timeEntryId,
          identified.employeeId,
          schedule.scheduleId || null,
          schedule.workDate || null,
          schedule.weekday ?? null,
          schedule.scheduleText || null,
          entryType,
          schedule.decision,
        ],
      );

      const selfie = await saveTimeEntrySelfie({
        tenantId: args.tenantId,
        employeeId: identified.employeeId,
        timeEntryId,
        buffer: args.image,
        mimeType: args.mimeType,
      });
      savedSelfiePath = selfie.relativePath;
      await gate.query(
        `INSERT INTO time_entry_selfies
         (tenant_id,company_id,employee_id,time_entry_id,file_path,mime_type,file_size,sha256,captured_at,created_at)
         VALUES (?,?,?,?,?,?,?,?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,
        [
          args.tenantId,
          args.companyId,
          identified.employeeId,
          timeEntryId,
          selfie.relativePath,
          args.mimeType,
          selfie.fileSize,
          selfie.sha256,
        ],
      );

      await gate.commit();
      const [rows] = await gate.query<any[]>(
        `SELECT te.id,te.entry_type,te.registered_at,e.name,e.registration_number
           FROM time_entries te
           JOIN employees e ON e.id=te.employee_id AND e.tenant_id=te.tenant_id
          WHERE te.id=? AND te.tenant_id=? LIMIT 1`,
        [timeEntryId, args.tenantId],
      );
      return {
        ...rows[0],
        employeeId: identified.employeeId,
        similarity: identified.similarity,
      };
    } catch (error) {
      await gate.rollback();
      await removeTimeEntrySelfie(savedSelfiePath);
      throw error;
    }
  } finally {
    if (locked) await gate.query("SELECT RELEASE_LOCK(?)", [lockName]).catch(() => {});
    gate.release();
  }
}
