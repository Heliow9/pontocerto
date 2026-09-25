import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const provider=fs.readFileSync(new URL("../api/src/services/cora-provider.ts",import.meta.url),"utf8");
const settings=fs.readFileSync(new URL("../api/src/services/payment-provider-settings.service.ts",import.meta.url),"utf8");
const route=fs.readFileSync(new URL("../api/src/routes/saas-finance.routes.ts",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../web/src/pages/SaasFinanceProviders.tsx",import.meta.url),"utf8");
const migration=fs.readFileSync(new URL("../api/sql/031_cora_payment_terms.sql",import.meta.url),"utf8");

test("Cora envia discount fine e interest em payment_terms",()=>{
  assert.match(provider,/terms\.discount=\{type:"FIXED",value:centsFromMoney/);
  assert.match(provider,/terms\.fine=\{amount:centsFromMoney/);
  assert.match(provider,/terms\.interest=\{rate:/);
});

test("condições Cora são persistidas e expostas pela API",()=>{
  assert.match(migration,/settings_json LONGTEXT/);
  assert.match(settings,/updateCoraPaymentTerms/);
  assert.match(settings,/getProviderIssuePaymentTerms/);
  assert.match(route,/providers\/CORA\/payment-terms/);
});

test("painel exibe desconto antes e multa juros depois do vencimento",()=>{
  assert.match(ui,/Antes do vencimento/);
  assert.match(ui,/Desconto \(R\$\)/);
  assert.match(ui,/Após o vencimento/);
  assert.match(ui,/Multa \(R\$\)/);
  assert.match(ui,/Juros \(%\)/);
  assert.match(ui,/Salvar condições Cora/);
});
