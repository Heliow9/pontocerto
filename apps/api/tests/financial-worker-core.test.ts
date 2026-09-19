import test from "node:test";
import assert from "node:assert/strict";
import { financialWorkerDateContext, shouldGenerateMonthly, shouldAttemptAutomaticDelivery } from "../src/services/financial-worker-core.js";

test("mensalidade automática só é gerada no dia 1",()=>{
  assert.equal(shouldGenerateMonthly("2026-10-01"),true);
  assert.equal(shouldGenerateMonthly("2026-10-02"),false);
});

test("competência corresponde ao mês da data de Brasília",()=>{
  assert.deepEqual(financialWorkerDateContext("2026-12-01"),{date:"2026-12-01",competence:"2026-12",generateMonthly:true});
});


test("falha de email não autoriza reemitir cobrança mensal existente",()=>{
  assert.equal(shouldAttemptAutomaticDelivery({alreadyExists:true,autoEmailCharges:true,sendEmailAfterIssue:true,status:"OPEN",lastDeliveryStatus:"FAILED"}),false);
});
