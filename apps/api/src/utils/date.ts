export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function datesBetween(start: string, end: string): string[] {
  const result: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function onlyTime(value: string): string {
  const match = value.match(/(\d{2}:\d{2})(?::\d{2})?$/);
  return match?.[1] || value;
}

export function timeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function minutesBetweenTimes(start?: string | null, end?: string | null): number {
  const a = timeToMinutes(start);
  const b = timeToMinutes(end);
  if (a === null || b === null) return 0;
  return b >= a ? b - a : (24 * 60 - a) + b;
}

export function calculateExpectedMinutes(day: {
  isDayOff?: boolean;
  entry1?: string | null;
  exit1?: string | null;
  entry2?: string | null;
  exit2?: string | null;
}): number {
  if (day.isDayOff) return 0;
  return (
    minutesBetweenTimes(day.entry1, day.exit1) +
    minutesBetweenTimes(day.entry2, day.exit2)
  );
}

export function dateTimeMinutes(value: string): number {
  const time = value.includes(" ") ? value.split(" ")[1] : value.split("T")[1] || "00:00:00";
  const [h, m, s = 0] = time.slice(0, 8).split(":").map(Number);
  return h * 60 + m + (s >= 30 ? 1 : 0);
}

export function ptDate(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function weekdayShortPt(date: string): string {
  return ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][weekdayOf(date)];
}
