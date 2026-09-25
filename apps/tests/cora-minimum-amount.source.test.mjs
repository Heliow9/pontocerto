import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const web=fs.readFileSync(new URL("../web/src/pages/SaasFinance.tsx",import.meta.url),"utf8");
const finance=fs.readFileSync(new URL("../api/src/services/financial.service.ts",import.meta.url),"utf8");
const provider=fs.readFileSync(new URL("../api/src/services/payment-provider-core.ts",import.meta.url),"utf8");

test("frontend avisa e bloqueia Cora abaixo de R$ 5,00",()=>{
  assert.match(web,/CORA_BOLETO_MINIMUM_AMOUNT=5/);
  assert.match(web,/Valor abaixo do mínimo da Cora/);
  assert.match(web,/Boolean\(minimumAmountError\)/);
});

test("backend valida limite antes de emitir e antes de cancelar reemissão",()=>{
  assert.match(finance,/assertProviderIssueAmount\(code,method,Number\(charge.amount\)\)/);
  assert.match(finance,/if\(input.issue\)assertProviderIssueAmount\(selection.provider,selection.method,amount\)/);
  const validation=finance.indexOf("assertProviderIssueAmount(originalSelection.code,originalSelection.method,adjustment.newAmount)");
  const cancellation=finance.indexOf("// Fase 2: cancela remotamente");
  assert.ok(validation>0&&cancellation>validation);
  assert.match(provider,/PROVIDER_MINIMUM_AMOUNT/);
});
