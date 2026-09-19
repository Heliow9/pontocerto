import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const portal=()=>fs.readFileSync('web/src/pages/SaasPortal.tsx','utf8');
const routes=()=>fs.readFileSync('api/src/routes/saas-commercial.routes.ts','utf8');

test('dashboard exposes total and per-product MRR',()=>{
  const source=portal();
  for(const label of ['MRR total','MRR Ponto Certo','MRR Movyo','MRR PayHub','Ativas','Em atraso','Bloqueadas']) assert.match(source,new RegExp(label));
  assert.match(source,/productMetrics/);
});

test('dashboard route keeps legacy monthly alias backed by product metrics',()=>{
  const source=routes();
  assert.match(source,/loadSaasDashboardProducts/);
  assert.match(source,/monthly:productMetrics\.mrrTotal/);
  assert.match(source,/productMetrics/);
});
