export type ScheduleDay = {
  weekday: number;
  is_day_off: number;
  entry_1: string | null;
  exit_1: string | null;
  entry_2: string | null;
  exit_2: string | null;
};
export type ReminderEvent = {
  workDate: string;
  type: string;
  target: number;
  remindAt: number;
  time: string;
  label: string;
  key: string;
};
export function reminderEvents(
  day: ScheduleDay,
  workDate: string,
): ReminderEvent[] {
  if (day.is_day_off || !day.entry_1 || !day.exit_1) return [];
  const second = Boolean(day.entry_2 && day.exit_2);
  const slots = [
    [day.entry_1, "CLOCK_IN", "entrada"],
    [
      day.exit_1,
      second ? "BREAK_OUT" : "CLOCK_OUT",
      second ? "saída para intervalo" : "saída",
    ],
    ...(second
      ? [
          [day.entry_2, "BREAK_IN", "retorno do intervalo"],
          [day.exit_2, "CLOCK_OUT", "saída"],
        ]
      : []),
  ];
  let previous = -1,
    offset = 0;
  const base = Date.parse(`${workDate}T00:00:00-03:00`);
  const events: ReminderEvent[] = [];
  for (const [raw, type, label] of slots) {
    if (!raw || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(raw)) return [];
    const [h, m] = raw.split(":").map(Number);
    const minute = h * 60 + m;
    if (previous >= 0 && minute < previous) offset += 86400000;
    previous = minute;
    const target = base + offset + minute * 60000;
    events.push({
      workDate,
      type: type!,
      label: label!,
      target,
      remindAt: target - 5 * 60000,
      time: raw.slice(0, 5),
      key: `${workDate}:${type}:${target}`,
    });
  }
  return events;
}
export function dueReminders(day: ScheduleDay, workDate: string, now: number) {
  return reminderEvents(day, workDate).filter(
    (e) => e.remindAt <= now && now - e.remindAt < 60000,
  );
}
export function permittedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      [
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
