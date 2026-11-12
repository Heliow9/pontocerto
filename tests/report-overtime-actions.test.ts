import { expect, it } from "vitest";
import {
  canReprocessReport,
  dailyOvertimeAction,
  overtimePermissionNotice,
} from "../apps/web/src/report-overtime";

it("offers ignore only for manageable overtime and restore for an active override", () => {
  expect(dailyOvertimeAction({ overtime_minutes: 95, overtime_ignored: 0 }, true, true)).toBe("ignore");
  expect(dailyOvertimeAction({ overtime_minutes: 0, overtime_ignored: 1 }, true, true)).toBe("restore");
  expect(dailyOvertimeAction({ overtime_minutes: 95, overtime_ignored: 0 }, false, true)).toBeNull();
  expect(dailyOvertimeAction({ overtime_minutes: 95, overtime_ignored: 0 }, true, false)).toBeNull();
  expect(dailyOvertimeAction({ overtime_minutes: 0, overtime_ignored: 0 }, true, true)).toBeNull();
});

it("shows reprocessing for report writers and explains the sensitive overtime permission", () => {
  expect(canReprocessReport(true)).toBe(true);
  expect(canReprocessReport(false)).toBe(false);
  expect(overtimePermissionNotice(true, false)).toContain("Gerenciar horas extras");
  expect(overtimePermissionNotice(true, true)).toBeNull();
});
