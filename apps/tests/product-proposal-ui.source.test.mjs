import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('proposal backend accepts product and product plan without requiring employee limits',()=>{
  const source=fs.readFileSync('api/src/routes/proposals.routes.ts','utf8');
  assert.match(source,/productProposalSchema/);
  assert.match(source,/productId:z\.coerce\.number/);
  assert.match(source,/productPlanId:z\.coerce\.number/);
  assert.match(source,/maxEmployees:z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)\.nullable\(\)/);
  assert.match(source,/ensureProposalRendered/);
});

test('proposal UI switches product fields and email branding for Movyo',()=>{
  const source=fs.readFileSync('web/src/pages/ProposalsPage.tsx','utf8');
  assert.match(source,/Produto/);
  assert.match(source,/Plano Movyo/);
  assert.match(source,/Cliente Comercial/);
  assert.match(source,/commercialCustomerId/);
  assert.match(source,/form\.productCode==="PONTO_CERTO"/);
  assert.match(source,/p\.product_name\|\|"Ponto Certo"/);
  assert.match(source,/defaultSubject=\{`Proposta Comercial \$\{productLabel\}/);
  assert.match(source,/p\.converted\?/);
});
