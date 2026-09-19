import test from "node:test";
import assert from "node:assert/strict";
import { financialWorkerDateContext, shouldGenerateMonthly, shouldAttemptAutomaticDelivery, productSubscriptionFinancialState, shouldGenerateProductMonthly } from "../src/services/financial-worker-core.js";

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


test("assinatura de produto gera mensalidade somente na competência do próximo vencimento",()=>{
  assert.equal(shouldGenerateProductMonthly({billingSource:"PONTO_CERTO",status:"ACTIVE",nextDueDate:"2026-10-15",today:"2026-10-01"}),true);
  assert.equal(shouldGenerateProductMonthly({billingSource:"MOVYO_LEGACY",status:"ACTIVE",nextDueDate:"2026-10-15",today:"2026-10-01"}),false);
  assert.equal(shouldGenerateProductMonthly({billingSource:"PONTO_CERTO",status:"ACTIVE",nextDueDate:"2026-11-15",today:"2026-10-01"}),false);
});

test("assinatura de produto respeita tolerância antes do bloqueio",()=>{
  const base={chargeStatus:"OVERDUE",dueDate:"2026-10-15",blockAt:"2026-10-18",autoBlock:true,graceUntil:null};
  assert.equal(productSubscriptionFinancialState({...base,today:"2026-10-16"}),"GRACE");
  assert.equal(productSubscriptionFinancialState({...base,today:"2026-10-18"}),"BLOCKED");
  assert.equal(productSubscriptionFinancialState({...base,today:"2026-10-20",graceUntil:"2026-10-25"}),"GRACE");
  assert.equal(productSubscriptionFinancialState({...base,today:"2026-10-20",autoBlock:false}),"GRACE");
  assert.equal(productSubscriptionFinancialState({...base,today:"2026-10-20",chargeStatus:"PAID"}),"ACTIVE");
});
