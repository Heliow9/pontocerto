import { createHash } from "node:crypto";
import { pool } from "../db/pool.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { parseControlIdDao } from "./control-id-core.js";
import type { StoredControlIdTerminal } from "./control-id.service.js";
import {
  controlIdEntryTypeForSequence,
  controlIdEventDecision,
  controlIdSqlTimestamp,
} from "./control-id-punch-core.js";

async function markEvent(
  db: any,
  id: number,
  status: "REJECTED" | "QUARANTINED",
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
    const [mappings] = await conn.query<any[]>(
      `SELECT m.employee_id,m.disabled_at,e.name,
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
    lockName = `pc:punch:${event.tenant_id}:${mapping.employee_id}`;
    const [locks] = await conn.query<any[]>("SELECT GET_LOCK(?,5) AS acquired", [lockName]);
    locked = Number(locks[0]?.acquired) === 1;
    if (!locked) {
      await conn.rollback();
      return { id, status: "RECEIVED", retry: true };
    }
    const occurredAt = String(event.occurred_at).slice(0, 19);
    const workDate = occurredAt.slice(0, 10);
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
    const entryType = controlIdEntryTypeForSequence(Number(counts[0]?.total || 0));
    const [insert] = await conn.query<any>(
      `INSERT INTO time_entries
       (tenant_id,company_id,employee_id,entry_type,registered_at,source,manually_adjusted,created_by_user_id,created_at,
        control_id_terminal_id,control_id_event_id,scheduled_work_date,schedule_decision)
       VALUES (?,?,?,?,?,'CONTROL_ID',0,NULL,${BRASILIA_NOW_SQL},?,?,?,'NOT_REQUIRED')`,
      [event.tenant_id, event.company_id, mapping.employee_id, entryType, event.occurred_at, event.terminal_id, event.id, workDate],
    );
    const timeEntryId = Number(insert.insertId);
    await conn.query(
      `INSERT INTO time_entry_schedule_checks
       (tenant_id,time_entry_id,employee_id,work_schedule_id,work_date,weekday,schedule_text,expected_entry_type,decision,created_at)
       VALUES (?,?,?,NULL,?,WEEKDAY(?),NULL,?,'NOT_REQUIRED',${BRASILIA_NOW_SQL})`,
      [event.tenant_id, timeEntryId, mapping.employee_id, workDate, workDate, entryType],
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
  const results = [];
  for (const eventId of eventIds) results.push(await processControlIdEvent(eventId));
  if (eventIds.length)
    await pool.query(
      `UPDATE control_id_terminals SET last_event_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,
      [terminal.id],
    );
  return { received: eventIds.length, duplicates, results };
}
