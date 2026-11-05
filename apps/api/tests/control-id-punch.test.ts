import test from "node:test";
import assert from "node:assert/strict";
import {
  controlIdEntryTypeForSequence,
  controlIdEventDecision,
  controlIdSqlTimestamp,
} from "../src/services/control-id-punch-core.js";

test("accepts a granted mapped face event regardless of schedule window", () => {
  assert.deepEqual(
    controlIdEventDecision({ event: 7, userId: "42", mappingFound: true, occurredAfterDisabled: false }),
    { action: "PUNCH", reason: null },
  );
  assert.deepEqual(
    controlIdEventDecision({ event: 6, userId: "42", mappingFound: true, occurredAfterDisabled: false }),
    { action: "REJECT", reason: "ACCESS_NOT_GRANTED" },
  );
});

test("quarantines a user from another company or an event after removal", () => {
  assert.deepEqual(
    controlIdEventDecision({ event: 7, userId: "999", mappingFound: false, occurredAfterDisabled: false }),
    { action: "QUARANTINE", reason: "EMPLOYEE_MAPPING_NOT_FOUND" },
  );
  assert.deepEqual(
    controlIdEventDecision({ event: 7, userId: "42", mappingFound: true, occurredAfterDisabled: true }),
    { action: "QUARANTINE", reason: "EMPLOYEE_MAPPING_DISABLED" },
  );
});

test("classifies the chronological sequence without inventing a punch", () => {
  assert.equal(controlIdEntryTypeForSequence(0), "CLOCK_IN");
  assert.equal(controlIdEntryTypeForSequence(1), "BREAK_OUT");
  assert.equal(controlIdEntryTypeForSequence(2), "BREAK_IN");
  assert.equal(controlIdEntryTypeForSequence(3), "CLOCK_OUT");
  assert.equal(controlIdEntryTypeForSequence(4), "OTHER");
});

test("preserves the wall-clock time encoded by the iDFace access log", () => {
  assert.equal(controlIdSqlTimestamp(1793831400), "2026-11-04 22:30:00");
});
