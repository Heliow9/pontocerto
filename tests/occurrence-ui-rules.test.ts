import { expect, it } from "vitest";
import {
  occurrenceFormError,
  occurrenceFormMode,
} from "../apps/web/src/occurrence-rules";

const base = {
  employeeId: 11,
  startDate: "2026-11-10",
  endDate: "2026-11-12",
  type: "ATESTADO",
  reason: "Atestado entregue ao RH",
};

it("uses a complete-day period for vacation and medical leave", () => {
  expect(occurrenceFormMode("ATESTADO")).toBe("full-day");
  expect(occurrenceFormMode("FERIAS")).toBe("full-day");
  expect(occurrenceFormError(base)).toBeNull();
});

it("requires one date and a valid hourly interval for declarations", () => {
  expect(occurrenceFormMode("DECLARACAO")).toBe("hourly");
  expect(occurrenceFormError({
    ...base,
    type: "DECLARACAO",
    endDate: "2026-11-10",
    startTime: "10:00",
    endTime: "12:00",
  })).toBeNull();
  expect(occurrenceFormError({ ...base, type: "DECLARACAO" })).not.toBeNull();
  expect(occurrenceFormError({
    ...base,
    type: "DECLARACAO",
    endDate: "2026-11-11",
    startTime: "10:00",
    endTime: "12:00",
  })).not.toBeNull();
});

it("requires an audit observation for every occurrence", () => {
  expect(occurrenceFormError({ ...base, reason: "" })).toContain("observação");
});
