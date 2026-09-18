import test from "node:test";
import assert from "node:assert/strict";
import { decideFinancialAccess, exceptionEndFromPreset } from "../src/services/financial-access-core.js";

test("exceção global ativa impede bloqueio", () => {
  const result = decideFinancialAccess({
    autoBlockEnabled: true,
    now: "2026-09-18T12:00:00-03:00",
    charges: [{ id: 1, status: "OVERDUE", blockAt: "2026-09-15", excepted: false }],
    globalExceptionEndsAt: "2026-09-20T23:59:59-03:00",
  });
  assert.equal(result.blocked, false);
  assert.equal(result.blockingChargeIds.length, 0);
});

test("uma exceção específica não libera outras cobranças bloqueantes", () => {
  const result = decideFinancialAccess({
    autoBlockEnabled: true,
    now: "2026-09-18T12:00:00-03:00",
    charges: [
      { id: 1, status: "OVERDUE", blockAt: "2026-09-15", excepted: true },
      { id: 2, status: "OPEN", blockAt: "2026-09-17", excepted: false },
    ],
    globalExceptionEndsAt: null,
  });
  assert.equal(result.blocked, true);
  assert.deepEqual(result.blockingChargeIds, [2]);
});

test("pagamento da última cobrança bloqueante libera o acesso", () => {
  const result = decideFinancialAccess({
    autoBlockEnabled: true,
    now: "2026-09-18T12:00:00-03:00",
    charges: [
      { id: 1, status: "PAID", blockAt: "2026-09-15", excepted: false },
      { id: 2, status: "OPEN", blockAt: "2026-09-20", excepted: false },
    ],
    globalExceptionEndsAt: null,
  });
  assert.equal(result.blocked, false);
});

test("presets de exceção aceitam somente 5, 10 e 30 dias", () => {
  assert.equal(exceptionEndFromPreset("2026-09-18T10:00:00-03:00", 5).slice(0, 10), "2026-09-23");
  assert.throws(() => exceptionEndFromPreset("2026-09-18T10:00:00-03:00", 7), /5, 10 ou 30/);
});
