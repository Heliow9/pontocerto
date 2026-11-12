export type DailyOvertimeAction = "ignore" | "restore" | null;

export function canReprocessReport(canManage: boolean): boolean {
  return canManage;
}

export function overtimePermissionNotice(
  canManage: boolean,
  canManageOvertime: boolean,
): string | null {
  if (!canManage || canManageOvertime) return null;
  return "Para ignorar ou restaurar horas extras, solicite a operação sensível “Gerenciar horas extras”.";
}

export function dailyOvertimeAction(
  day: { overtime_minutes?: number | string; overtime_ignored?: number | boolean },
  canManage: boolean,
  canManageOvertime: boolean,
): DailyOvertimeAction {
  if (!canManage || !canManageOvertime) return null;
  if (Boolean(day.overtime_ignored)) return "restore";
  return Number(day.overtime_minutes || 0) > 0 ? "ignore" : null;
}
