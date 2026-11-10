import { expect, it } from "vitest";
import { dailyOvertimeAction } from "../apps/web/src/report-overtime";

it("offers ignore only for manageable overtime and restore for an active override", () => {
  expect(dailyOvertimeAction({ overtime_minutes: 95, overtime_ignored: 0 }, true, true)).toBe("ignore");
  expect(dailyOvertimeAction({ overtime_minutes: 0, overtime_ignored: 1 }, true, true)).toBe("restore");
  expect(dailyOvertimeAction({ overtime_minutes: 95, overtime_ignored: 0 }, false, true)).toBeNull();
  expect(dailyOvertimeAction({ overtime_minutes: 95, overtime_ignored: 0 }, true, false)).toBeNull();
  expect(dailyOvertimeAction({ overtime_minutes: 0, overtime_ignored: 0 }, true, true)).toBeNull();
});
