import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync('api/src/services/financial-worker.service.ts','utf8');
const routes=fs.readFileSync('api/src/routes/commercial-products.routes.ts','utf8');
const ui=fs.readFileSync('web/src/pages/SaasProductSubscriptions.tsx','utf8');

test('financial worker bills and synchronizes product subscriptions without tenant',()=>{
  assert.match(worker,/createProductSubscriptionMonthlyCharge/);
  assert.match(worker,/shouldGenerateProductMonthly/);
  assert.match(worker,/syncProductFinancialAccess/);
  assert.match(worker,/productMonthlyCreated/);
});

test('product subscription API exposes temporary access exception and revoke',()=>{
  assert.equal(routes.includes("productSubscriptionsRouter.post('/:id(\\\\d+)/access-exception'"),true);
  assert.match(routes,/access-exception/);
  assert.match(routes,/revoke-access-exception/);
  assert.match(routes,/grantProductFinancialException/);
});

test('subscription UI offers 5 10 30 and custom grace controls',()=>{
  for(const value of ['Liberar +5d','+10d','+30d','Liberar até']) assert.match(ui,new RegExp(value.replace('+','\\+')));
});


test('product charge creation audit stores product subscription ownership in its dedicated column',()=>{
  const financial=fs.readFileSync('api/src/services/financial.service.ts','utf8');
  assert.match(financial,/PRODUCT_CHARGE_CREATED[\s\S]{0,350}productSubscriptionId:subscriptionId/);
});
