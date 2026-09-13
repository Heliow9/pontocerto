import { expect, it } from "vitest";
import { liveOvertimeEvent } from "../apps/api/src/services/live-overtime-rules";

it("não transforma intervalo da noite anterior em presença na noite seguinte", () => {
  const night = {
    weekday: 2,
    is_day_off: 0,
    entry_1: "22:00:00",
    exit_1: "02:00:00",
    entry_2: "03:00:00",
    exit_2: "06:00:00",
  };
  const entries = [
    { entry_type: "CLOCK_IN", registered_at: "2026-09-14 21:55:00" },
    { entry_type: "BREAK_OUT", registered_at: "2026-09-15 02:00:00" },
    { entry_type: "BREAK_IN", registered_at: "2026-09-15 03:00:00" },
  ];
  const args = {
    day: night,
    punches: entries,
    reference: 1200,
    accumulated: 1260,
  };
  expect(
    liveOvertimeEvent({
      ...args,
      workDate: "2026-09-15",
      now: Date.parse("2026-09-16T06:01:00-03:00"),
    }),
  ).toBeNull();
  expect(
    liveOvertimeEvent({
      ...args,
      workDate: "2026-09-14",
      now: Date.parse("2026-09-15T06:01:00-03:00"),
    }),
  ).not.toBeNull();
});

const day = {
  weekday: 1,
  is_day_off: 0,
  entry_1: "08:00:00",
  exit_1: "12:00:00",
  entry_2: "13:00:00",
  exit_2: "17:00:00",
};
const punch = (entry_type: string, time: string, date = "2026-09-14") => ({
  id: 1,
  entry_type,
  registered_at: `${date} ${time}:00`,
  scheduled_work_date: "2026-09-14",
});
const punches = [
  punch("CLOCK_IN", "08:00"),
  punch("BREAK_OUT", "12:00"),
  punch("BREAK_IN", "13:00"),
];
const event = (
  now: string,
  entries = punches,
  reference: number | null = 1200,
  accumulated = 1260,
) =>
  liveOvertimeEvent({
    day,
    workDate: "2026-09-14",
    punches: entries,
    reference,
    accumulated,
    now: Date.parse(now),
  });

it("detecta o início após a saída prevista sem aguardar CLOCK_OUT", () => {
  expect(event("2026-09-14T17:00:00-03:00")).toBeNull();
  expect(event("2026-09-14T17:00:01-03:00")).toMatchObject({
    key: "D:20260914",
    time: "17:00",
  });
});
it("não avisa sem referência ultrapassada, presença ou durante intervalo", () => {
  for (const reference of [null, 0, 1260, 1300])
    expect(event("2026-09-14T17:01:00-03:00", punches, reference)).toBeNull();
  expect(event("2026-09-14T17:01:00-03:00", [])).toBeNull();
  expect(event("2026-09-14T17:01:00-03:00", punches.slice(0, 2))).toBeNull();
  expect(
    event("2026-09-14T17:01:00-03:00", [
      ...punches,
      punch("CLOCK_OUT", "17:00"),
    ]),
  ).toBeNull();
});
it("mantém a identidade durante a jornada e permite outro aviso no dia seguinte", () => {
  expect(event("2026-09-14T17:01:00-03:00")?.key).toBe(
    event("2026-09-14T18:00:00-03:00")?.key,
  );
  const next = liveOvertimeEvent({
    day,
    workDate: "2026-09-15",
    punches: punches.map((p) => ({
      ...p,
      scheduled_work_date: "2026-09-15",
      registered_at: p.registered_at.replace("09-14", "09-15"),
    })),
    reference: 1200,
    accumulated: 1260,
    now: Date.parse("2026-09-15T17:01:00-03:00"),
  });
  expect(next?.key).toBe("D:20260915");
});
it("considera a saída no dia seguinte em jornada noturna", () => {
  const night = {
    ...day,
    entry_1: "22:00:00",
    exit_1: "06:00:00",
    entry_2: null,
    exit_2: null,
  };
  const args = {
    day: night,
    workDate: "2026-09-14",
    punches: [punch("CLOCK_IN", "22:00")],
    reference: 1200,
    accumulated: 1260,
  };
  expect(
    liveOvertimeEvent({
      ...args,
      now: Date.parse("2026-09-15T05:59:00-03:00"),
    }),
  ).toBeNull();
  expect(
    liveOvertimeEvent({
      ...args,
      now: Date.parse("2026-09-15T06:01:00-03:00"),
    }),
  ).toMatchObject({ key: "D:20260914", time: "06:00" });
});
it("não considera folga, ponto futuro, outra jornada ou presença antiga", () => {
  const args = {
    day,
    workDate: "2026-09-14",
    punches,
    reference: 1200,
    accumulated: 1260,
    now: Date.parse("2026-09-14T17:01:00-03:00"),
  };
  expect(
    liveOvertimeEvent({ ...args, day: { ...day, is_day_off: 1 } }),
  ).toBeNull();
  expect(
    event("2026-09-14T17:01:00-03:00", [punch("CLOCK_IN", "18:00")]),
  ).toBeNull();
  expect(liveOvertimeEvent({ ...args, workDate: "2026-09-13" })).toBeNull();
  expect(event("2026-09-16T17:01:00-03:00")).toBeNull();
});
it("interpreta marcações legadas por pares e não confunde entrada duplicada com saída", () => {
  expect(
    event("2026-09-14T17:01:00-03:00", [punch("OTHER", "08:00")]),
  ).not.toBeNull();
  expect(
    event("2026-09-14T17:01:00-03:00", [
      punch("OTHER", "08:00"),
      punch("OTHER", "17:00"),
    ]),
  ).toBeNull();
  expect(
    event("2026-09-14T17:01:00-03:00", [
      punch("CLOCK_IN", "08:00"),
      punch("CLOCK_IN", "08:01"),
    ]),
  ).not.toBeNull();
});
