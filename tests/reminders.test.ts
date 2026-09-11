import { describe, it, expect } from "vitest";
import {
  reminderEvents,
  dueReminders,
  permittedPushEndpoint,
} from "../apps/api/src/services/reminder-times";
const day = {
  weekday: 4,
  is_day_off: 0,
  entry_1: "07:00:00",
  exit_1: "12:00:00",
  entry_2: "13:00:00",
  exit_2: "17:00:00",
};
describe("five minute reminders", () => {
  it("calculates all four reminders in Brasilia time", () => {
    const events = reminderEvents(day, "2026-09-10");
    expect(events.map((e) => new Date(e.remindAt).toISOString())).toEqual([
      "2026-09-10T09:55:00.000Z",
      "2026-09-10T14:55:00.000Z",
      "2026-09-10T15:55:00.000Z",
      "2026-09-10T19:55:00.000Z",
    ]);
    expect(events.map((e) => e.type)).toEqual([
      "CLOCK_IN",
      "BREAK_OUT",
      "BREAK_IN",
      "CLOCK_OUT",
    ]);
  });
  it("handles an overnight shift and a reminder on the previous date", () => {
    const events = reminderEvents(
      {
        ...day,
        entry_1: "22:00",
        exit_1: "02:00",
        entry_2: "03:00",
        exit_2: "06:00",
      },
      "2026-09-10",
    );
    expect(events[3].time).toBe("06:00");
    expect(new Date(events[3].remindAt).toISOString()).toBe(
      "2026-09-11T08:55:00.000Z",
    );
    expect(
      new Date(
        reminderEvents({ ...day, entry_1: "00:03" }, "2026-09-10")[0].remindAt,
      ).toISOString(),
    ).toBe("2026-09-10T02:58:00.000Z");
  });
  it("skips days off and stale events, with just two reminders when no break exists", () => {
    expect(reminderEvents({ ...day, is_day_off: 1 }, "2026-09-10")).toEqual([]);
    expect(
      reminderEvents({ ...day, entry_2: null, exit_2: null }, "2026-09-10").map(
        (e) => e.type,
      ),
    ).toEqual(["CLOCK_IN", "CLOCK_OUT"]);
    expect(
      dueReminders(day, "2026-09-10", Date.parse("2026-09-10T09:55:20Z")),
    ).toHaveLength(1);
    expect(
      dueReminders(day, "2026-09-10", Date.parse("2026-09-10T09:57:00Z")),
    ).toHaveLength(0);
  });
  it("accepts only known HTTPS push providers", () => {
    expect(
      permittedPushEndpoint("https://fcm.googleapis.com/fcm/send/token"),
    ).toBe(true);
    for (const url of [
      "http://fcm.googleapis.com/x",
      "https://127.0.0.1/x",
      "https://fcm.googleapis.com.evil.test/x",
      "https://user@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:444/x",
    ])
      expect(permittedPushEndpoint(url)).toBe(false);
  });
});
