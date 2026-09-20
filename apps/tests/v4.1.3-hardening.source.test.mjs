import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('V4.1.3 exposes product monthly billing in Finance UI',()=>{
  const ui=read('web/src/pages/SaasFinance.tsx');
  assert.match(ui,/PRODUCT_MONTHLY/);
  assert.match(ui,/charges\/product-monthly/);
  assert.match(ui,/Mensalidade de Produto/);
});

test('subscription screen loads the real product catalog and protects legacy prorata',()=>{
  const ui=read('web/src/pages/SaasProductSubscriptions.tsx');
  assert.match(ui,/api\.get\('\/saas\/products'\)/);
  assert.doesNotMatch(ui,/commercial-products/);
  assert.match(ui,/legacyMigrated/);
  assert.match(ui,/pró-rata retroativo permanece desabilitado/);
});

test('ambiguous provider issues can recover by external reference',()=>{
  for(const file of ['efi-provider.ts','cora-provider.ts','mercado-pago-provider.ts'])assert.match(read(`api/src/services/${file}`),/findChargeByExternalReference/);
  const service=read('api/src/services/financial.service.ts');
  assert.match(service,/CHARGE_PROVIDER_ID_RECOVERED/);
  assert.match(service,/CHARGE_ISSUE_NOT_FOUND/);
  assert.match(service,/provider_your_number/);
});

test('reissue is prepared before provider cancellation and is resumable',()=>{
  const service=read('api/src/services/financial.service.ts');
  const prepared=service.indexOf('CHARGE_REISSUE_PREPARED');
  const cancel=service.indexOf('await provider.cancel',prepared);
  const finalized=service.indexOf('CHARGE_REISSUED',cancel);
  assert.ok(prepared>0&&cancel>prepared&&finalized>cancel);
  assert.match(service,/REISSUE_ALREADY_PREPARED/);
  assert.match(service,/CHARGE_REISSUE_ABORTED/);
});

test('monthly duplicate lookup selects latest revision',()=>{
  const service=read('api/src/services/financial.service.ts');
  assert.match(service,/product_subscription_id=\? AND type='MONTHLY' AND competence=\? ORDER BY revision DESC,id DESC LIMIT 1/);
});

test('Brazilian documents are validated by check digits',()=>{
  const api=read('api/src/utils/brazil-document.ts');
  const web=read('web/src/utils/brazilDocument.ts');
  assert.match(api,/isValidCpf/);assert.match(api,/isValidCnpj/);
  assert.match(web,/validCpf/);assert.match(web,/validCnpj/);
});

test('release build is self-contained for PWA script',()=>{
  assert.equal(fs.existsSync(new URL('../scripts/build-pwa.mjs',import.meta.url)),true);
  const web=JSON.parse(read('web/package.json'));
  const mobile=JSON.parse(read('mobile/package.json'));
  assert.match(web.scripts.build,/\.\.\/scripts\/build-pwa\.mjs/);
  assert.match(mobile.scripts['build:web'],/\.\.\/scripts\/build-pwa\.mjs/);
});


test('finance UI identifies product billing source instead of calling it global default',()=>{
  const finance=read('web/src/pages/SaasFinance.tsx');
  assert.match(finance,/Cobrança da assinatura/);
});

test('dashboard attention and delinquency include product subscriptions without tenant',()=>{
  const dashboard=read('api/src/services/saas-dashboard-finance.ts');
  const financial=read('api/src/services/financial.service.ts');
  assert.match(dashboard,/fc\.product_subscription_id/);
  assert.match(dashboard,/CONCAT\('S:',fc\.product_subscription_id\)/);
  assert.match(dashboard,/commercial_customers cc/);
  assert.match(financial,/ps\.tenant_id IS NULL/);
  assert.match(financial,/productSubscriptionId/);
});

test('no known broken product endpoint or generic call on untyped face db remains',()=>{
  const subscriptions=read('web/src/pages/SaasProductSubscriptions.tsx');
  const face=read('api/src/routes/face.routes.ts');
  assert.doesNotMatch(subscriptions,/\/saas\/commercial-products/);
  assert.doesNotMatch(face,/db\.query<any\[\]>/);
});
