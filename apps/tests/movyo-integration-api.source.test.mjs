import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const servicePath='api/src/services/movyo-import.service.ts';
const routePath='api/src/routes/movyo-integration.routes.ts';

test('Movyo integration service keeps directory sync read-only and exposes explicit cutover',()=>{
  const source=fs.readFileSync(servicePath,'utf8');
  assert.match(source,/export async function syncMovyoDirectory/);
  assert.match(source,/export async function importMovyoCustomer/);
  assert.match(source,/export async function cutoverMovyoCustomer/);
  assert.match(source,/MOVYO_LEGACY_CHARGE_OPEN/);
  const syncBlock=source.slice(source.indexOf('export async function syncMovyoDirectory'),source.indexOf('export async function importMovyoCustomer'));
  assert.doesNotMatch(syncBlock,/financial_charges|createProductSubscriptionMonthlyCharge|issueProviderCharge/);
});

test('Movyo integration routes expose sync import resolve cutover rollback and reconcile',()=>{
  const source=fs.readFileSync(routePath,'utf8');
  for(const fragment of ["get('/status'","get('/customers'","post('/sync'","post('/customers/:externalId/import'","put('/customers/:externalId/resolve'","post('/customers/:externalId/cutover'","post('/customers/:externalId/rollback'","post('/customers/:externalId/reconcile'"]){
    assert.ok(source.includes(fragment),`missing route ${fragment}`);
  }
  assert.match(source,/writeAudit/);
});

test('saas router mounts Movyo integration under integrations/movyo',()=>{
  const source=fs.readFileSync('api/src/routes/saas.routes.ts','utf8');
  assert.match(source,/movyoIntegrationRouter/);
  assert.match(source,/integrations\/movyo/);
});
