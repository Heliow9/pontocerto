import test from "node:test";
import assert from "node:assert/strict";
import {
  providerYourNumber,
  reconciliationDecision,
  monthlyDescription,
} from "../src/services/financial-service-core.js";

test("seuNumero do Inter é curto, determinístico e derivado da cobrança local", () => {
  assert.equal(providerYourNumber(1), "PC000000000001");
  assert.equal(providerYourNumber(123456789), "PC000123456789");
  assert.ok(providerYourNumber(123).length <= 15);
});

test("reconciliação paga exige identificador, seuNumero e valor exatos", () => {
  const ok = reconciliationDecision({
    localAmount: 1200,
    localYourNumber: "PC000000000001",
    providerChargeId: "abc",
    providerYourNumber: "PC000000000001",
    providerStatus: "PAID",
    providerNominalAmount: 1200,
    providerReceivedAmount: 1200,
  });
  assert.deepEqual(ok, { action: "PAY", reason: null });

  const mismatch = reconciliationDecision({
    localAmount: 1200,
    localYourNumber: "PC000000000001",
    providerChargeId: "abc",
    providerYourNumber: "PC000000000001",
    providerStatus: "PAID",
    providerNominalAmount: 1200,
    providerReceivedAmount: 1199.99,
  });
  assert.equal(mismatch.action, "HOLD");
  assert.match(mismatch.reason || "", /valor recebido/i);
});

test("reconciliação de status não pago apenas sincroniza quando identificadores conferem", () => {
  const sync = reconciliationDecision({
    localAmount: 399,
    localYourNumber: "PC000000000002",
    providerChargeId: "def",
    providerYourNumber: "PC000000000002",
    providerStatus: "OPEN",
    providerNominalAmount: 399,
    providerReceivedAmount: null,
  });
  assert.deepEqual(sync, { action: "SYNC", reason: null });

  const wrong = reconciliationDecision({
    localAmount: 399,
    localYourNumber: "PC000000000002",
    providerChargeId: "def",
    providerYourNumber: "OUTRO",
    providerStatus: "OPEN",
    providerNominalAmount: 399,
    providerReceivedAmount: null,
  });
  assert.equal(wrong.action, "HOLD");
});

test("descrição mensal usa competência em português", () => {
  assert.equal(monthlyDescription("2026-09"), "Mensalidade Ponto Certo - 09/2026");
});
