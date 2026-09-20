import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route=()=>fs.readFileSync('api/src/routes/contracts.routes.ts','utf8');
const service=()=>fs.readFileSync('api/src/services/product-provisioning.service.ts','utf8');
const ui=()=>fs.readFileSync('web/src/pages/ContractsPage.tsx','utf8');

test('contract conversion dispatches to product provisioning service',()=>{
  assert.match(route(),/provisionSignedContract/);
  assert.doesNotMatch(route(),/PRODUCT_PROVISIONING_REQUIRED/);
  assert.match(service(),/product_code/);
  assert.match(service(),/MOVYO/);
  assert.match(service(),/createTenantInTransaction/);
  assert.match(service(),/provisionMovyoCustomer/);
  assert.match(service(),/createProductSubscriptionMonthlyCharge/);
  assert.match(service(),/syncSubscriptionOperationalState/);
});

test('Movyo contract conversion does not require Ponto Certo master credentials',()=>{
  const source=ui();
  assert.match(source,/c\.product_code==="MOVYO"/);
  assert.match(source,/Provisionar Movyo/);
  assert.match(source,/api\.post\(`\/saas\/contracts\/\$\{id\}\/convert`,\{\}\)/);
  assert.match(source,/Contrato \$\{productLabel\}/);
});

test('non-Ponto product proposal requires a commercial customer linkage',()=>{
  const proposals=fs.readFileSync('api/src/routes/proposals.routes.ts','utf8');
  assert.match(proposals,/commercialCustomerId:z\.coerce\.number\(\)\.int\(\)\.positive\(\)/);
  assert.doesNotMatch(proposals,/commercialCustomerId:z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional/);
});
