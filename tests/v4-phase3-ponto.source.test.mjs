import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const financial=fs.readFileSync('api/src/services/financial.service.ts','utf8');
const client=fs.readFileSync('api/src/services/movyo-client.service.ts','utf8');
const integration=fs.readFileSync('api/src/services/product-integration.service.ts','utf8');
const subscription=fs.readFileSync('api/src/services/product-subscription.service.ts','utf8');
const env=fs.readFileSync('api/src/config/env.ts','utf8');

test('Ponto client uses HMAC bridge headers and secret only on backend',()=>{
  for(const h of ['X-PC-Client','X-PC-Timestamp','X-PC-Nonce','X-PC-Signature','X-PC-Idempotency-Key'])assert.match(client,new RegExp(h));
  assert.match(client,/signMovyoRequest/);
  assert.match(env,/MOVYO_BRIDGE_SECRET/);
  assert.doesNotMatch(client,/console\.(log|info).*SECRET/i);
});

test('provider payment transition is locked and renews product only once',()=>{
  assert.match(financial,/SELECT \* FROM financial_charges WHERE id=\? FOR UPDATE/);
  assert.match(financial,/firstPaymentTransition=isFirstPaymentTransition\(charge\.status\)/);
  assert.match(financial,/advanceProductSubscriptionPeriod\(conn,syncSubscriptionId,String\(charge\.due_date\)\)/);
  assert.match(subscription,/SELECT id,current_period_end,next_due_date,status FROM product_subscriptions WHERE id=\? FOR UPDATE/);
  assert.match(subscription,/status='ACTIVE',blocked_at=NULL,grace_until=NULL/);
});

test('Movyo sync happens after financial commit and failure is isolated',()=>{
  const commit=financial.indexOf('await conn.commit();',financial.indexOf('async function applyProviderDetails'));
  const sync=financial.indexOf('syncSubscriptionOperationalState(syncSubscriptionId,"PAYMENT_CONFIRMED")');
  assert.ok(commit>=0&&sync>commit);
  assert.match(financial,/\.catch\(error=>console\.error\("\[movyo-sync\] payment"/);
  assert.match(integration,/product_sync_logs/);
  assert.match(integration,/status:'FAILED'/);
});

test('payment rows retain commercial and product ownership',()=>{
  assert.match(financial,/financial_payments\(charge_id,tenant_id,commercial_customer_id,product_subscription_id/);
  assert.match(financial,/productSubscriptionId:charge\.product_subscription_id/);
});
