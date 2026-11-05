import { createHash } from "node:crypto";
import { pool } from "../db/pool.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { controlIdIsFacialAccess, parseControlIdDao } from "./control-id-core.js";
import type { StoredControlIdTerminal } from "./control-id.service.js";
import {
  controlIdEntryTypeForSequence,
  controlIdEventDecision,
  controlIdPunchCooldownDecision,
  controlIdSqlTimestamp,
} from "./control-id-punch-core.js";

function minutes(value: unknown) {
  if (!value) return null;
  const [hour, minute] = String(value).slice(0, 5).split(":").map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
}

function previousDate(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

async function controlIdScheduleContext(db: any, event: any, employeeId: number) {
  const occurredAt = String(event.occurred_at).slice(0, 19);
  const calendarDate = occurredAt.slice(0, 10);
  const weekday = new Date(`${calendarDate}T12:00:00Z`).getUTCDay();
  const previousWeekday = (weekday + 6) % 7;
  const atMinutes = minutes(occurredAt.slice(11, 16)) ?? 0;
  const [policies] = await db.query(
    `SELECT enforce_schedule_window,schedule_early_margin_minutes,schedule_late_margin_minutes
       FROM company_profiles WHERE tenant_id=? AND company_id=? LIMIT 1`,
    [event.tenant_id, event.company_id],
  );
  const early = Number(policies[0]?.schedule_early_margin_minutes ?? 120);
  const late = Number(policies[0]?.schedule_late_margin_minutes ?? 240);
  const [days] = await db.query(
    `SELECT e.work_schedule_id,ws.name AS schedule_name,ws.active,d.weekday,d.is_day_off,
            d.entry_1,d.exit_1,d.entry_2,d.exit_2
       FROM employees e
       LEFT JOIN work_schedules ws ON ws.id=e.work_schedule_id AND ws.tenant_id=e.tenant_id
       LEFT JOIN work_schedule_days d ON d.work_schedule_id=ws.id AND d.tenant_id=ws.tenant_id
        AND d.weekday IN (?,?)
      WHERE e.id=? AND e.tenant_id=?`,
    [weekday, previousWeekday, employeeId, event.tenant_id],
  );
  const scheduleId = days[0]?.work_schedule_id ? Number(days[0].work_schedule_id) : null;
  const today = days.find((day: any) => Number(day.weekday) === weekday) || null;
  const previous = days.find((day: any) => Number(day.weekday) === previousWeekday) || null;
  let chosen = today && !today.is_day_off ? { day: today, date: calendarDate, relative: atMinutes } : null;
  if (previous && !previous.is_day_off) {
    const start = minutes(previous.entry_1);
    const end = minutes(previous.exit_2 || previous.exit_1);
    if (start != null && end != null && end <= start && atMinutes <= end + late)
      chosen = { day: previous, date: previousDate(calendarDate), relative: atMinutes + 1440 };
  }
  const start = minutes(chosen?.day.entry_1);
  let end = minutes(chosen?.day.exit_2 || chosen?.day.exit_1);
  if (start != null && end != null && end <= start) end += 1440;
  const inside =
    start != null && end != null && chosen != null && chosen.relative >= start - early && chosen.relative <= end + late;
  const sequence =
    chosen?.day.entry_1 && chosen?.day.exit_1
      ? chosen.day.entry_2 && chosen.day.exit_2
        ? ["CLOCK_IN", "BREAK_OUT", "BREAK_IN", "CLOCK_OUT"]
        : ["CLOCK_IN", "CLOCK_OUT"]
      : [];
  return {
    workDate: chosen?.date || calendarDate,
    weekday: chosen ? Number(chosen.day.weekday) : weekday,
    scheduleId,
    scheduleText: chosen
      ? [
          chosen.day.entry_1 && chosen.day.exit_1
            ? `${String(chosen.day.entry_1).slice(0, 5)}–${String(chosen.day.exit_1).slice(0, 5)}`
            : null,
          chosen.day.entry_2 && chosen.day.exit_2
            ? `${String(chosen.day.entry_2).slice(0, 5)}–${String(chosen.day.exit_2).slice(0, 5)}`
            : null,
        ]
          .filter(Boolean)
          .join(" / ")
      : null,
    decision: scheduleId ? (inside ? "ALLOWED" : "BLOCKED") : "NOT_REQUIRED",
    sequence,
  };
}

async function markEvent(
  db: any,
  id: number,
  status: "DUPLICATE" | "REJECTED" | "QUARANTINED",
  code: string,
  message: string,
) {
  await db.query(
    `UPDATE control_id_events SET status=?,reason_code=?,reason_message=?,processed_at=${BRASILIA_NOW_SQL} WHERE id=?`,
    [status, code, message, id],
  );
  return { id, status, code };
}

export async function processControlIdEvent(id: number) {
  const conn = await pool.getConnection();
  let locked = false;
  let lockName = "";
  try {
    await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await conn.beginTransaction();
    const [events] = await conn.query<any[]>(
      "SELECT * FROM control_id_events WHERE id=? FOR UPDATE",
      [id],
    );
    const event = events[0];
    if (!event) {
      await conn.rollback();
      return { id, status: "MISSING" };
    }
    if (event.status !== "RECEIVED") {
      await conn.commit();
      return { id, status: event.status, replayed: true };
    }
    const occurredUtc = Date.parse(`${String(event.occurred_at).slice(0, 19).replace(" ", "T")}Z`) + 3 * 60 * 60 * 1000;
    const driftMs = occurredUtc - Date.now();
    if (!Number.isFinite(occurredUtc) || driftMs > 5 * 60 * 1000 || driftMs < -366 * 24 * 60 * 60 * 1000) {
      const result = await markEvent(
        conn,
        id,
        "QUARANTINED",
        "DEVICE_CLOCK_INVALID",
        "O relógio do equipamento está fora da tolerância operacional.",
      );
      await conn.commit();
      return result;
    }
    const [mappings] = await conn.query<any[]>(
      `SELECT m.employee_id,m.disabled_at,e.name,e.active,
              (m.disabled_at IS NOT NULL AND ? > m.disabled_at) AS occurred_after_disabled
         FROM control_id_employee_mappings m
         JOIN employees e ON e.id=m.employee_id AND e.tenant_id=m.tenant_id AND e.company_id=m.company_id
        WHERE m.terminal_id=? AND m.vendor_user_id=? AND m.tenant_id=? AND m.company_id=? LIMIT 1`,
      [event.occurred_at, event.terminal_id, event.vendor_user_id, event.tenant_id, event.company_id],
    );
    const mapping = mappings[0];
    const decision = controlIdEventDecision({
      event: Number(event.vendor_event_type),
      userId: String(event.vendor_user_id),
      mappingFound: Boolean(mapping),
      occurredAfterDisabled: Boolean(mapping?.occurred_after_disabled),
    });
    if (decision.action === "REJECT") {
      const result = await markEvent(conn, id, "REJECTED", decision.reason, "O acesso não foi concedido pelo terminal.");
      await conn.commit();
      return result;
    }
    if (decision.action === "QUARANTINE") {
      const result = await markEvent(conn, id, "QUARANTINED", decision.reason, "O usuário do equipamento não possui vínculo válido para esta empresa.");
      await conn.commit();
      return result;
    }
    const payloadValues =
      typeof event.payload_json === "string" ? JSON.parse(event.payload_json) : event.payload_json;
    if (!controlIdIsFacialAccess(payloadValues || {})) {
      const result = await markEvent(
        conn,
        id,
        "QUARANTINED",
        "NON_FACIAL_IDENTIFIER",
        "O log concedido não contém evidência de reconhecimento facial.",
      );
      await conn.commit();
      return result;
    }
    if (!Boolean(mapping.active)) {
      const result = await markEvent(
        conn,
        id,
        "QUARANTINED",
        "EMPLOYEE_INACTIVE",
        "O funcionário estava inativo quando o evento foi processado.",
      );
      await conn.commit();
      return result;
    }
    lockName = `pc:punch:${event.tenant_id}:${mapping.employee_id}`;
    const [locks] = await conn.query<any[]>("SELECT GET_LOCK(?,5) AS acquired", [lockName]);
    locked = Number(locks[0]?.acquired) === 1;
    if (!locked) {
      await conn.rollback();
      return { id, status: "RECEIVED", retry: true };
    }
    const [previousControlIdEntries] = await conn.query<any[]>(
      `SELECT TIMESTAMPDIFF(SECOND,registered_at,?) AS elapsed_seconds
         FROM time_entries
        WHERE tenant_id=? AND employee_id=? AND source='CONTROL_ID' AND registered_at<=?
        ORDER BY registered_at DESC,id DESC LIMIT 1`,
      [event.occurred_at, event.tenant_id, mapping.employee_id, event.occurred_at],
    );
    const cooldown = controlIdPunchCooldownDecision(
      previousControlIdEntries[0] ? Number(previousControlIdEntries[0].elapsed_seconds) : null,
    );
    if (cooldown.action === "IGNORE") {
      const result = await markEvent(
        conn,
        id,
        "DUPLICATE",
        cooldown.reason,
        "Batida repetida ignorada: aguarde 60 minutos após a última marcação facial.",
      );
      await conn.commit();
      return result;
    }
    const occurredAt = String(event.occurred_at).slice(0, 19);
    const schedule = await controlIdScheduleContext(conn, event, Number(mapping.employee_id));
    const workDate = schedule.workDate;
    const [latest] = await conn.query<any[]>(
      `SELECT registered_at FROM time_entries
        WHERE tenant_id=? AND employee_id=? AND COALESCE(scheduled_work_date,DATE(registered_at))=?
        ORDER BY registered_at DESC,id DESC LIMIT 1`,
      [event.tenant_id, mapping.employee_id, workDate],
    );
    if (latest[0] && new Date(latest[0].registered_at).getTime() > new Date(event.occurred_at).getTime()) {
      const result = await markEvent(conn, id, "QUARANTINED", "OUT_OF_ORDER", "Existe uma marcação posterior já processada nesta jornada.");
      await conn.commit();
      return result;
    }
    const [counts] = await conn.query<any[]>(
      `SELECT COUNT(*) AS total FROM time_entries
        WHERE tenant_id=? AND employee_id=? AND COALESCE(scheduled_work_date,DATE(registered_at))=?`,
      [event.tenant_id, mapping.employee_id, workDate],
    );
    const count = Number(counts[0]?.total || 0);
    const entryType = (schedule.sequence.length
      ? schedule.sequence[count] || "OTHER"
      : controlIdEntryTypeForSequence(count)) as string;
    const [insert] = await conn.query<any>(
      `INSERT INTO time_entries
       (tenant_id,company_id,employee_id,entry_type,registered_at,source,manually_adjusted,created_by_user_id,created_at,
        control_id_terminal_id,control_id_event_id,scheduled_work_date,schedule_decision)
       VALUES (?,?,?,?,?,'CONTROL_ID',0,NULL,${BRASILIA_NOW_SQL},?,?,?,?)`,
      [
        event.tenant_id, event.company_id, mapping.employee_id, entryType, event.occurred_at,
        event.terminal_id, event.id, workDate, schedule.decision,
      ],
    );
    const timeEntryId = Number(insert.insertId);
    await conn.query(
      `INSERT INTO time_entry_schedule_checks
       (tenant_id,time_entry_id,employee_id,work_schedule_id,work_date,weekday,schedule_text,expected_entry_type,decision,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,${BRASILIA_NOW_SQL})`,
      [
        event.tenant_id, timeEntryId, mapping.employee_id, schedule.scheduleId, workDate,
        schedule.weekday, schedule.scheduleText, entryType, schedule.decision,
      ],
    );
    await conn.query(
      `UPDATE control_id_events SET status='PROCESSED',time_entry_id=?,processed_at=${BRASILIA_NOW_SQL} WHERE id=?`,
      [timeEntryId, id],
    );
    await conn.commit();
    return { id, status: "PROCESSED", timeEntryId, entryType };
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    if (locked) await conn.query("SELECT RELEASE_LOCK(?)", [lockName]).catch(() => {});
    conn.release();
  }
}

export async function receiveControlIdDao(terminal: StoredControlIdTerminal, body: unknown) {
  const parsed = parseControlIdDao(body);
  if (parsed.deviceId !== terminal.vendorDeviceId)
    throw Object.assign(new Error("O evento pertence a outro equipamento."), {
      status: 403,
      code: "CONTROL_ID_DEVICE_MISMATCH",
    });
  const eventIds: number[] = [];
  let duplicates = 0;
  for (const change of parsed.changes) {
    const payload = JSON.stringify(change.values);
    const hash = createHash("sha256").update(payload).digest("hex");
    const occurredAt = controlIdSqlTimestamp(change.occurredAtUnix);
    const [result] = await pool.query<any>(
      `INSERT INTO control_id_events
       (terminal_id,tenant_id,company_id,vendor_log_id,vendor_user_id,occurred_at,vendor_event_type,vendor_log_type_id,identifier_type,payload_json,payload_sha256,status,received_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,'RECEIVED',${BRASILIA_NOW_SQL})
       ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
      [terminal.id, terminal.tenantId, terminal.companyId, change.logId, change.userId, occurredAt, change.event, change.logTypeId, change.identifierId, payload, hash],
    );
    const eventId = Number(result.insertId);
    if (!result.affectedRows || result.affectedRows === 2) duplicates += 1;
    eventIds.push(eventId);
  }
  const results = await retryControlIdPendingEvents(terminal.id);
  if (eventIds.length)
    await pool.query(
      `UPDATE control_id_terminals SET last_event_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,
      [terminal.id],
    );
  return { received: eventIds.length, duplicates, results };
}

export async function retryControlIdPendingEvents(terminalId: number, limit = 100) {
  const [rows] = await pool.query<any[]>(
    `SELECT id FROM control_id_events
      WHERE terminal_id=? AND status='RECEIVED'
      ORDER BY occurred_at,id LIMIT ?`,
    [terminalId, Math.max(1, Math.min(500, Math.trunc(limit)))],
  );
  const results = [];
  for (const row of rows) results.push(await processControlIdEvent(Number(row.id)));
  return results;
}
