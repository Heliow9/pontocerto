import { pool } from "../db/pool.js";
import {
  datesBetween,
  dateTimeMinutes,
  onlyTime,
  weekdayOf,
} from "../utils/date.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";

type EmployeeRow = {
  id: number;
  company_id: number;
  work_schedule_id: number | null;
};

type ScheduleRow = {
  id: number;
  tolerance_late_minutes: number;
  tolerance_overtime_minutes: number;
};

type ScheduleDayRow = {
  work_schedule_id: number;
  weekday: number;
  is_day_off: number;
  expected_minutes: number;
};

type TimeEntryRow = {
  id: number;
  employee_id: number;
  registered_at: string;
  manually_adjusted: number;
  entry_type?: string;
  scheduled_work_date?: string | null;
};

type HolidayRow = {
  company_id: number | null;
  holiday_date: string;
  name: string;
};

type AbsenceRow = {
  employee_id: number;
  start_date: string;
  end_date: string;
  type: string;
  reason: string | null;
};

const absenceStatusMap: Record<string, string> = {
  ATESTADO: "ATESTADO",
  FERIAS: "FERIAS",
  AFASTAMENTO: "AFASTAMENTO",
  LICENCA: "LICENCA",
  ABONO: "ABONO",
  OUTRO: "ABONO",
};

export function pairWorkedMinutes(entries: TimeEntryRow[]): number {
  const timestampMinutes=(value:string)=>Date.parse(`${value.slice(0,10)}T00:00:00Z`)/60000+dateTimeMinutes(value);
  let total = 0;
  if (entries.every((e) => e.entry_type && e.entry_type !== "OTHER")) {
    let open: TimeEntryRow | null = null;
    for (const entry of entries) {
      if (entry.entry_type === "CLOCK_IN" || entry.entry_type === "BREAK_IN") {
        if (!open) open = entry;
      } else if (
        open &&
        (entry.entry_type === "CLOCK_OUT" || entry.entry_type === "BREAK_OUT")
      ) {
        total += Math.max(
          0,
          timestampMinutes(entry.registered_at) -
            timestampMinutes(open.registered_at),
        );
        open = null;
      }
    }
    return total;
  }
  for (let i = 0; i + 1 < entries.length; i += 2) {
    const start = timestampMinutes(entries[i].registered_at);
    const end = timestampMinutes(entries[i + 1].registered_at);
    if (end >= start) total += end - start;
  }
  return total;
}

function dateInRange(date: string, start: string, end: string): boolean {
  return date >= start.slice(0, 10) && date <= end.slice(0, 10);
}

export async function processPeriod(params: {
  tenantId: number;
  start: string;
  end: string;
  employeeId?: number;
  employeeIds?: number[];
}) {
  const {
    tenantId,
    start,
    end,
    employeeId,
    employeeIds: selectedEmployeeIds,
  } = params;
  if (selectedEmployeeIds && !selectedEmployeeIds.length)
    return { processed: 0, employees: 0, days: 0 };

  const employeeSql = employeeId
    ? `SELECT id, company_id, work_schedule_id FROM employees
       WHERE tenant_id = ? AND active = 1 AND id = ?`
    : selectedEmployeeIds
      ? `SELECT id, company_id, work_schedule_id FROM employees
       WHERE tenant_id = ? AND active = 1 AND id IN (${selectedEmployeeIds.map(() => "?").join(",")})`
      : `SELECT id, company_id, work_schedule_id FROM employees
       WHERE tenant_id = ? AND active = 1`;
  const employeeParams = employeeId
    ? [tenantId, employeeId]
    : selectedEmployeeIds
      ? [tenantId, ...selectedEmployeeIds]
      : [tenantId];
  const [employeeRows] = await pool.query<any[]>(employeeSql, employeeParams);

  if (employeeId && employeeRows.length === 0) {
    throw new Error("Funcionário não encontrado neste tenant.");
  }

  const scheduleIds = [
    ...new Set(employeeRows.map((e) => e.work_schedule_id).filter(Boolean)),
  ] as number[];
  const scheduleById = new Map<number, ScheduleRow>();
  const dayByScheduleWeekday = new Map<string, ScheduleDayRow>();

  if (scheduleIds.length) {
    const placeholders = scheduleIds.map(() => "?").join(",");
    const [schedules] = await pool.query<any[]>(
      `SELECT id, tolerance_late_minutes, tolerance_overtime_minutes
         FROM work_schedules
        WHERE tenant_id = ? AND id IN (${placeholders})`,
      [tenantId, ...scheduleIds],
    );
    for (const row of schedules) scheduleById.set(row.id, row);

    const [days] = await pool.query<any[]>(
      `SELECT work_schedule_id, weekday, is_day_off, expected_minutes
         FROM work_schedule_days
        WHERE tenant_id = ? AND work_schedule_id IN (${placeholders})`,
      [tenantId, ...scheduleIds],
    );
    for (const row of days)
      dayByScheduleWeekday.set(`${row.work_schedule_id}:${row.weekday}`, row);
  }

  const employeeIds = employeeRows.map((e) => e.id);
  const entriesByEmployeeDate = new Map<string, TimeEntryRow[]>();
  if (employeeIds.length) {
    const placeholders = employeeIds.map(() => "?").join(",");
    const [entries] = await pool.query<any[]>(
      `SELECT id, employee_id, registered_at, manually_adjusted, entry_type, scheduled_work_date
         FROM time_entries
        WHERE tenant_id = ?
          AND employee_id IN (${placeholders})
          AND COALESCE(scheduled_work_date,DATE(registered_at)) BETWEEN ? AND ?
        ORDER BY employee_id, registered_at`,
      [tenantId, ...employeeIds, start, end],
    );
    for (const entry of entries) {
      const date = (entry.scheduled_work_date || entry.registered_at).slice(
        0,
        10,
      );
      const key = `${entry.employee_id}:${date}`;
      const list = entriesByEmployeeDate.get(key) || [];
      list.push(entry);
      entriesByEmployeeDate.set(key, list);
    }
  }

  const [holidays] = await pool.query<any[]>(
    `SELECT company_id, holiday_date, name
       FROM holidays
      WHERE tenant_id = ? AND holiday_date BETWEEN ? AND ?`,
    [tenantId, start, end],
  );

  const [absences] = await pool.query<any[]>(
    `SELECT employee_id, start_date, end_date, type, reason
       FROM absences
      WHERE tenant_id = ?
        AND status = 'APPROVED'
        AND start_date <= ? AND end_date >= ?`,
    [tenantId, end, start],
  );

  const days = datesBetween(start, end);
  let processed = 0;

  for (const employee of employeeRows) {
    const schedule = employee.work_schedule_id
      ? scheduleById.get(employee.work_schedule_id)
      : undefined;

    for (const date of days) {
      const weekday = weekdayOf(date);
      const scheduleDay = employee.work_schedule_id
        ? dayByScheduleWeekday.get(`${employee.work_schedule_id}:${weekday}`)
        : undefined;
      const entries = entriesByEmployeeDate.get(`${employee.id}:${date}`) || [];
      const workedMinutes = pairWorkedMinutes(entries);
      const pointsText = entries
        .map(
          (entry) =>
            `${onlyTime(entry.registered_at)}${entry.manually_adjusted ? "*" : ""}`,
        )
        .join(" ");

      const holiday = holidays.find(
        (h) =>
          h.holiday_date.slice(0, 10) === date &&
          (h.company_id === null ||
            Number(h.company_id) === employee.company_id),
      );
      const absence = absences.find(
        (a) =>
          Number(a.employee_id) === employee.id &&
          dateInRange(date, a.start_date, a.end_date),
      );

      let status = "NORMAL";
      let statusLabel: string | null = null;
      let expectedMinutes = Number(scheduleDay?.expected_minutes || 0);
      let normalMinutes = Math.min(workedMinutes, expectedMinutes);
      let overtimeMinutes = 0;
      let lateMinutes = 0;
      let absenceMinutes = 0;

      if (holiday) {
        status = "FERIADO";
        statusLabel = holiday.name;
        expectedMinutes = 0;
        normalMinutes = 0;
        overtimeMinutes = workedMinutes;
      } else if (absence) {
        status = absenceStatusMap[absence.type] || "ABONO";
        statusLabel = absence.reason || absence.type;
        normalMinutes = Math.min(workedMinutes, expectedMinutes);
        overtimeMinutes = Math.max(0, workedMinutes - expectedMinutes);
      } else if (scheduleDay?.is_day_off) {
        status = "FOLGA";
        statusLabel = "Folga";
        expectedMinutes = 0;
        normalMinutes = 0;
        overtimeMinutes = workedMinutes;
      } else if (expectedMinutes > 0 && entries.length === 0) {
        status = "FALTA";
        statusLabel = "Falta";
        absenceMinutes = expectedMinutes;
        normalMinutes = 0;
      } else {
        const shortage = Math.max(0, expectedMinutes - workedMinutes);
        const overage = Math.max(0, workedMinutes - expectedMinutes);
        const lateTolerance = Number(schedule?.tolerance_late_minutes || 0);
        const overtimeTolerance = Number(
          schedule?.tolerance_overtime_minutes || 0,
        );
        lateMinutes = shortage > lateTolerance ? shortage : 0;
        overtimeMinutes = overage > overtimeTolerance ? overage : 0;
      }

      const timeBankMinutes = overtimeMinutes - lateMinutes - absenceMinutes;

      await pool.query(
        `INSERT INTO daily_time_calculations
         (tenant_id, company_id, employee_id, work_date, status, status_label, points_text,
          expected_minutes, worked_minutes, normal_minutes, overtime_minutes, late_minutes,
          absence_minutes, night_minutes, time_bank_minutes, processed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ${BRASILIA_NOW_SQL})
         ON DUPLICATE KEY UPDATE
           company_id = VALUES(company_id), status = VALUES(status), status_label = VALUES(status_label),
           points_text = VALUES(points_text), expected_minutes = VALUES(expected_minutes),
           worked_minutes = VALUES(worked_minutes), normal_minutes = VALUES(normal_minutes),
           overtime_minutes = VALUES(overtime_minutes), late_minutes = VALUES(late_minutes),
           absence_minutes = VALUES(absence_minutes), time_bank_minutes = VALUES(time_bank_minutes),
           processed_at = VALUES(processed_at)`,
        [
          tenantId,
          employee.company_id,
          employee.id,
          date,
          status,
          statusLabel,
          pointsText || null,
          expectedMinutes,
          workedMinutes,
          normalMinutes,
          overtimeMinutes,
          lateMinutes,
          absenceMinutes,
          timeBankMinutes,
        ],
      );
      processed += 1;
    }
  }

  return { processed, employees: employeeRows.length, days: days.length };
}
