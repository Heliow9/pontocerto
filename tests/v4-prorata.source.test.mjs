import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('api/sql/028_product_first_cycle_prorata.sql','utf8');
const financial=fs.readFileSync('api/src/services/financial.service.ts','utf8');
const provisioning=fs.readFileSync('api/src/services/product-provisioning.service.ts','utf8');
const subscriptionsUi=fs.readFileSync('web/src/pages/SaasProductSubscriptions.tsx','utf8');

test('migration adds auditable prorata fields without enabling old subscriptions retroactively',()=>{
  for(const token of ['first_cycle_prorata_enabled','base_amount','is_prorata','prorata_days','prorata_cycle_days','billing_period_start','billing_period_end']) assert.match(migration,new RegExp(token));
  assert.match(migration,/DEFAULT 0/);
});

test('new Movyo commercial provisioning enables first-cycle prorata',()=>{
  assert.match(provisioning,/first_cycle_prorata_enabled/);
  assert.match(provisioning,/PROVISIONING[\s\S]{0,220}1,NULL/);
});

test('product monthly charge calculates and audits prorata',()=>{
  assert.match(financial,/calculateFirstCycleProrata/);
  assert.match(financial,/pró-rata/);
  assert.match(financial,/prorata_days/);
  assert.match(financial,/base_amount/);
});

test('SaaS subscription UI exposes first-cycle prorata control',()=>{
  assert.match(subscriptionsUi,/Pró-rata automático na primeira cobrança/);
  assert.match(subscriptionsUi,/firstCycleProrataEnabled/);
});
