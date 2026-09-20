import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateBlockAt,
  isBlockingStatus,
  monthCompetence,
  validateDueDay,
} from "../src/services/financial-rules.js";

test("mensalidade aceita somente vencimentos 5, 10 e 15", () => {
  assert.equal(validateDueDay(5), 5);
  assert.equal(validateDueDay(10), 10);
  assert.equal(validateDueDay(15), 15);
  assert.throws(() => validateDueDay(1), /5, 10 ou 15/);
  assert.throws(() => validateDueDay(31), /5, 10 ou 15/);
});

test("bloqueio ocorre graceDays dias corridos depois do vencimento", () => {
  assert.equal(calculateBlockAt("2026-10-10", 3), "2026-10-13");
  assert.equal(calculateBlockAt("2026-02-27", 3), "2026-03-02");
});

test("somente OPEN e OVERDUE podem bloquear por inadimplencia", () => {
  assert.equal(isBlockingStatus("OPEN"), true);
  assert.equal(isBlockingStatus("OVERDUE"), true);
  for (const status of ["DRAFT", "ISSUING", "PAID", "CANCELED", "FAILED"] as const)
    assert.equal(isBlockingStatus(status), false);
});

test("competencia mensal usa AAAA-MM", () => {
  assert.equal(monthCompetence("2026-09-18"), "2026-09");
  assert.equal(monthCompetence(new Date("2026-12-03T12:00:00Z")), "2026-12");
});
