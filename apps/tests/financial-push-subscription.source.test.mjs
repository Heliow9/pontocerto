import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync(new URL('../api/src/routes/saas-finance.routes.ts',import.meta.url),'utf8');
const web=fs.readFileSync(new URL('../web/src/pages/SaasFinance.tsx',import.meta.url),'utf8');

test('API aceita expirationTime opcional e persiste somente endpoint e keys',()=>{
  assert.match(api,/expirationTime:z\.number\(\)\.nullable\(\)\.optional\(\)/);
  assert.match(api,/const destination=\{endpoint:d\.subscription\.endpoint,keys:d\.subscription\.keys\}/);
});

test('frontend normaliza PushSubscription antes de enviar',()=>{
  assert.match(web,/const raw=subscription\.toJSON\(\)/);
  assert.match(web,/const pushSubscription=\{endpoint:String\(raw\.endpoint\|\|subscription\.endpoint\),keys:/);
  assert.match(web,/subscription:pushSubscription/);
});
