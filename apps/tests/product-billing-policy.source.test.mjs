import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const catalog=()=>fs.readFileSync('api/src/services/product-catalog.service.ts','utf8');
const subscriptions=()=>fs.readFileSync('api/src/services/product-subscription.service.ts','utf8');
const productsUi=()=>fs.readFileSync('web/src/pages/SaasProducts.tsx','utf8');
const subscriptionsUi=()=>fs.readFileSync('web/src/pages/SaasProductSubscriptions.tsx','utf8');

test('product and subscription writes validate provider readiness',()=>{
  assert.match(catalog(),/assertConfiguredProductBillingPair/);
  assert.match(subscriptions(),/assertConfiguredProductBillingPair/);
});

test('Movyo UI recommends Efí BolePix without silently enabling it',()=>{
  assert.match(productsUi(),/Recomendado: Efí \+ BolePix/);
  assert.doesNotMatch(productsUi(),/defaultProvider:\s*["']EFI["']/);
});

test('subscription UI exposes explicit billing overrides',()=>{
  const source=subscriptionsUi();
  assert.match(source,/Sobrescrever cobrança/);
  assert.match(source,/billingProvider/);
  assert.match(source,/billingMethod/);
  assert.match(source,/graceDays/);
  assert.match(source,/autoBlock/);
});


test('HTTP routes accept only supported provider codes and validate subscription updates',()=>{
  const routes=fs.readFileSync('api/src/routes/commercial-products.routes.ts','utf8');
  assert.match(routes,/defaultProvider:z\.enum\(\['EFI','CORA','MERCADO_PAGO'\]\)/);
  assert.match(routes,/billingProvider:z\.enum\(\['EFI','CORA','MERCADO_PAGO'\]\)/);
  assert.match(routes,/productSubscriptionsRouter\.put[\s\S]*z\.object/);
  assert.doesNotMatch(routes,/updateProductSubscription\(key,req\.body\|\|\{\}\)/);
});
