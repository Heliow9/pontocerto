import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('financeiro oferece somente Cora, Efí e Mercado Pago como providers ativos', async () => {
  const registry = await readFile('api/src/services/provider-registry.ts','utf8');
  for (const provider of ['CORA','EFI','MERCADO_PAGO']) assert.match(registry,new RegExp(provider));
  assert.doesNotMatch(registry,/INTER/);
});

test('configuração SaaS possui provider e método padrão globais', async () => {
  const page = await readFile('web/src/pages/SaasFinanceProviders.tsx','utf8');
  assert.match(page,/Provedor padrão/);
  assert.match(page,/Método padrão/);
  assert.match(page,/Boleto \+ Pix/);
  assert.match(page,/Mercado Pago/);
});

test('cobrança avulsa envia provider e método escolhidos manualmente', async () => {
  const page = await readFile('web/src/pages/SaasFinance.tsx','utf8');
  assert.match(page,/charges\/ad-hoc/);
  assert.match(page,/provider:form\.provider/);
  assert.match(page,/paymentMethod:form\.paymentMethod/);
});

test('webhooks existem separadamente para os três providers', async () => {
  const routes = await readFile('api/src/routes/payment-webhook.routes.ts','utf8');
  assert.match(routes,/"\/cora"/);
  assert.match(routes,/"\/efi"/);
  assert.match(routes,/"\/mercadopago"/);
});

test('relatórios CSV expõem provider e método', async () => {
  const routes = await readFile('api/src/routes/saas-finance.routes.ts','utf8');
  assert.match(routes,/reports\/charges\.csv/);
  assert.match(routes,/reports\/receipts\.csv/);
  assert.match(routes,/"Provedor"/);
  assert.match(routes,/"Método"/);
});

test('cobrança avulsa aceita tenant ou pagador externo e usa snapshot', async()=>{
  const service=await readFile('api/src/services/financial.service.ts','utf8');
  const routes=await readFile('api/src/routes/saas-finance.routes.ts','utf8');
  assert.match(routes,/payerSource/);
  assert.match(routes,/EXTERNAL/);
  assert.match(service,/payer_source/);
  assert.match(service,/payer_document/);
  assert.doesNotMatch(service,/async function payerForTenant/);
});

test('financeiro expõe histórico e reenvio de cobrança por email',async()=>{
  const routes=await readFile('api/src/routes/saas-finance.routes.ts','utf8');
  assert.match(routes,/charges\/:id\/deliveries/);
  assert.match(routes,/charges\/:id\/email/);
  assert.match(routes,/payer_name/);
  assert.match(routes,/Último envio|Ultimo envio|delivery/i);
});
