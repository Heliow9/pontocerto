import { expect, it, vi } from "vitest";

vi.mock("../apps/api/src/db/pool.js", () => ({ pool: {} }));

import {
  attendanceMetrics,
  declarationCreditMinutes,
  fullDayExcusedMinutes,
} from "../apps/api/src/services/calculation.service";

const schedule = {
  entry_1: "08:00:00",
  exit_1: "12:00:00",
  entry_2: "13:00:00",
  exit_2: "18:00:00",
};

it("credits only the declared interval that overlaps scheduled work", () => {
  expect(
    declarationCreditMinutes(schedule, [
      { start_time: "10:00:00", end_time: "12:00:00" },
    ], 540),
  ).toBe(120);
  expect(
    declarationCreditMinutes(schedule, [
      { start_time: "12:00:00", end_time: "13:00:00" },
    ], 540),
  ).toBe(0);
});

it("merges overlapping declarations before calculating the credit", () => {
  expect(
    declarationCreditMinutes(schedule, [
      { start_time: "10:00:00", end_time: "12:00:00" },
      { start_time: "11:00:00", end_time: "14:00:00" },
    ], 540),
  ).toBe(180);
});

it("limits declaration credit to the deficit and never creates overtime", () => {
  expect(
    declarationCreditMinutes(schedule, [
      { start_time: "08:00:00", end_time: "18:00:00" },
    ], 60),
  ).toBe(60);
  expect(
    declarationCreditMinutes(schedule, [
      { start_time: "08:00:00", end_time: "18:00:00" },
    ], 0),
  ).toBe(0);
});

it("credits the remaining scheduled deficit for full-day medical leave or vacation", () => {
  expect(fullDayExcusedMinutes(540, 0)).toBe(540);
  expect(fullDayExcusedMinutes(540, 120)).toBe(420);
  expect(fullDayExcusedMinutes(540, 600)).toBe(0);
});

it("reduces lateness without reporting excused declaration time as worked normal time", () => {
  expect(attendanceMetrics(540, 300, 120, 10, 10)).toEqual({
    normalMinutes: 300,
    overtimeMinutes: 0,
    lateMinutes: 120,
  });
});
