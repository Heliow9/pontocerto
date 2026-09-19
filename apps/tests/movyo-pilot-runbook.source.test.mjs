import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const doc=fs.readFileSync('docs/V4_MOVYO_PILOT_RUNBOOK.md','utf8');

test('pilot runbook contains safe preflight, cutover, payment and rollback sequence',()=>{
  for(const phrase of ['MOVYO_SYNC_WORKER_ENABLED=0','READY_TO_MIGRATE','charges/product-monthly','MOVYO_ROLLBACK_HAS_PAID_PERIOD','bulkCutoverEnabled=true','MOVYO_SYNC_WORKER_ENABLED=1'])assert.match(doc,new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('pilot runbook explicitly preserves consumer order payments',()=>{
  assert.match(doc,/Não alterar credenciais, tokens, adquirentes ou configurações de pagamento dos pedidos/i);
  assert.match(doc,/bloqueio financeiro altera pagamentos de pedidos dos consumidores/i);
});
