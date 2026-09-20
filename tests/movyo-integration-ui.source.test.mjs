import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Movyo integration page shows migration states and guarded actions',()=>{
  const source=fs.readFileSync('web/src/pages/SaasMovyoIntegration.tsx','utf8');
  for(const status of ['LEGACY_MOVYO','PENDING_DATA','CONFLICT','READY_TO_MIGRATE','PONTO_CERTO','ERROR'])assert.match(source,new RegExp(status));
  for(const label of ['Sincronizar Movyo','Importar','Regularizar cadastro','Ativar gestão pelo Ponto Certo','Reconciliar'])assert.ok(source.includes(label),`missing ${label}`);
  assert.match(source,/confirm\(/);
  assert.match(source,/\/saas\/integrations\/movyo/);
});

test('SaaS portal exposes Movyo integration navigation and page',()=>{
  const source=fs.readFileSync('web/src/pages/SaasPortal.tsx','utf8');
  assert.match(source,/SaasMovyoIntegration/);
  assert.match(source,/Integração Movyo/);
  assert.match(source,/movyo-integration/);
});
