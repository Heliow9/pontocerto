import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const access=()=>fs.readFileSync('src/services/product-financial-access.service.ts','utf8');
const subscription=()=>fs.readFileSync('src/services/product-subscription.service.ts','utf8');
const routes=()=>fs.readFileSync('src/routes/commercial-products.routes.ts','utf8');

test('manual product release requires Movyo synchronization instead of hiding bridge errors',()=>{
  const s=access();
  assert.match(s,/await syncSubscriptionOperationalState\(input\.subscriptionId,'FINANCIAL_EXCEPTION_GRANTED'\);/);
  assert.doesNotMatch(s,/FINANCIAL_EXCEPTION_GRANTED'\)\.catch/);
});

test('changing grace days recalculates block_at for existing open charges',()=>{
  const s=subscription();
  assert.match(s,/nextGraceDays/);
  assert.match(s,/UPDATE financial_charges SET block_at=DATE_ADD\(due_date, INTERVAL \$\{nextGraceDays\} DAY\)/);
  assert.match(s,/product_subscription_id=\?/);
});

test('subscription update immediately reevaluates financial access and confirms Movyo sync',()=>{
  const s=routes();
  assert.match(s,/syncProductFinancialAccess\(key\)/);
  assert.match(s,/await syncSubscriptionOperationalState\(key,'SUBSCRIPTION_UPDATED'\);/);
  assert.doesNotMatch(s,/SUBSCRIPTION_UPDATED'\)\.catch/);
});
