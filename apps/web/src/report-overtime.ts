export type DailyOvertimeAction = "ignore" | "restore" | null;

export function dailyOvertimeAction(
  day: { overtime_minutes?: number | string; overtime_ignored?: number | boolean },
  canManage: boolean,
  canManageOvertime: boolean,
): DailyOvertimeAction {
  if (!canManage || !canManageOvertime) return null;
  if (Boolean(day.overtime_ignored)) return "restore";
  return Number(day.overtime_minutes || 0) > 0 ? "ignore" : null;
}
