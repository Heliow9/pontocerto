import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');

test('migration 030 creates SaaS financial push persistence',()=>{
  const sql=read('api/sql/030_saas_financial_push_notifications.sql');
  assert.match(sql,/saas_financial_push_subscriptions/);
  assert.match(sql,/saas_financial_push_deliveries/);
  assert.match(sql,/payment_confirmed/);
});

test('financial push endpoints are SUPER_ADMIN SaaS routes',()=>{
  const r=read('api/src/routes/saas-finance.routes.ts');
  assert.match(r,/\/notifications\/settings/);
  assert.match(r,/\/notifications\/subscription/);
  assert.match(r,/saveFinancialPushSubscription/);
});

test('payment confirmation triggers financial web push once on transition',()=>{
  const s=read('api/src/services/financial.service.ts');
  assert.match(s,/notifyFinancialPaymentConfirmed/);
  assert.match(s,/paymentNotification=\{chargeId/);
  assert.match(s,/PAYMENT_CONFIRMED/);
});

test('provider business rejection is explicit and deterministic',()=>{
  const s=read('api/src/services/financial.service.ts');
  assert.match(s,/recusou a cobrança/);
  assert.match(s,/Ação recomendada/);
  assert.match(s,/PROVIDER_REJECTED/);
  assert.match(s,/recebedor.*cliente.*mesma pessoa/i);
});

test('monthly recreation after canceled charge uses revision',()=>{
  const s=read('api/src/services/financial.service.ts');
  assert.match(s,/revision\?:number/);
  assert.match(s,/input\.revision\?\?1/);
  assert.match(s,/String\(existing\.status\)!=="CANCELED"/);
  assert.match(s,/Number\(existing\.revision\|\|1\)\+1/);
  const line=s.split('\n').find(x=>x.includes('INSERT INTO financial_charges')&&x.includes('const [result]'));
  assert.ok(line);
  const sql=line.split('`')[1];
  assert.equal((sql.match(/\?/g)||[]).length,29);
});

test('finance PWA UI shows explicit failures and payment notification settings',()=>{
  const page=read('web/src/pages/SaasFinance.tsx');
  assert.match(page,/finance-error-detail/);
  assert.match(page,/failure_message/);
  assert.match(page,/Notificações de pagamento/);
  assert.match(page,/FinancePushModal/);
  assert.match(page,/finance-responsive-table/);
});

test('service worker routes push click to payload URL',()=>{
  const pwa=read('scripts/build-pwa.mjs');
  assert.match(pwa,/data\.url/);
  assert.match(pwa,/event\.notification\.data\?\.url/);
});

test('mobile finance uses card layout and touch targets',()=>{
  const css=read('web/src/pages/commercial.css');
  assert.match(css,/finance-responsive-table thead\{display:none\}/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/safe-area-inset-bottom/);
});
