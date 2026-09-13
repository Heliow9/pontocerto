import { reminderEvents, type ScheduleDay } from "./reminder-times.js";

type Punch = {
  id?: number;
  entry_type?: string | null;
  registered_at: string;
  scheduled_work_date?: string | null;
};

export function liveOvertimeEvent(args: {
  day: ScheduleDay;
  workDate: string;
  punches: Punch[];
  reference: number | null;
  accumulated: number;
  now: number;
  earlyMarginMinutes?: number;
}) {
  const { day, workDate, punches, reference, accumulated, now } = args;
  if (reference == null || reference <= 0 || accumulated <= reference)
    return null;
  const events = reminderEvents(day, workDate);
  const exit = events.find((event) => event.type === "CLOCK_OUT");
  // Do not replay forgotten, old open shifts indefinitely after downtime.
  if (!exit || now <= exit.target || now >= exit.target + 86400000) return null;
  const first = events[0];
  const legacyStart = first.target - (args.earlyMarginMinutes ?? 120) * 60000;
  const priority: Record<string, number> = {
    CLOCK_IN: 0,
    BREAK_OUT: 1,
    BREAK_IN: 2,
    CLOCK_OUT: 3,
    OTHER: 4,
  };
  const ordered = punches
    .map((punch) => ({
      ...punch,
      timestamp: Date.parse(punch.registered_at.replace(" ", "T") + "-03:00"),
    }))
    .filter((punch) => {
      if (!Number.isFinite(punch.timestamp) || punch.timestamp > now)
        return false;
      if (punch.scheduled_work_date)
        return punch.scheduled_work_date.slice(0, 10) === workDate;
      // Legacy punches follow the schedule's entrance window, not the calendar
      // day: a previous night's BREAK_IN must not open the following shift.
      return (
        punch.timestamp >= legacyStart &&
        punch.timestamp < legacyStart + 86400000
      );
    })
    .sort(
      (a, b) =>
        a.timestamp - b.timestamp ||
        (priority[a.entry_type || "OTHER"] ?? 4) -
          (priority[b.entry_type || "OTHER"] ?? 4) ||
        Number(a.id || 0) - Number(b.id || 0),
    );
  let open = false;
  if (
    ordered.every((punch) => punch.entry_type && punch.entry_type !== "OTHER")
  ) {
    for (const punch of ordered) {
      if (punch.entry_type === "CLOCK_IN" || punch.entry_type === "BREAK_IN")
        open = true;
      else if (
        punch.entry_type === "CLOCK_OUT" ||
        punch.entry_type === "BREAK_OUT"
      )
        open = false;
    }
  } else open = ordered.length % 2 === 1;
  if (!open) return null;
  // Fits the existing VARCHAR(10) and unique key: one alert per work date,
  // employee and recipient, independently of the three monthly milestones.
  return {
    key: `D:${workDate.replaceAll("-", "")}`,
    time: exit.time,
    target: exit.target,
    workDate,
  };
}
