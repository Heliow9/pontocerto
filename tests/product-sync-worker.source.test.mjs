import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Movyo reconciliation worker is disabled by default and started by server',()=>{
  const env=fs.readFileSync('api/src/config/env.ts','utf8');
  const example=fs.readFileSync('api/.env.example','utf8');
  const server=fs.readFileSync('api/src/server.ts','utf8');
  assert.match(env,/MOVYO_SYNC_WORKER_ENABLED[\s\S]*default\("0"\)/);
  assert.match(example,/MOVYO_SYNC_WORKER_ENABLED=0/);
  assert.match(server,/startProductSyncWorker/);
});

test('worker reads only Movyo product subscriptions and uses bounded concurrency',()=>{
  const source=fs.readFileSync('api/src/services/product-sync-worker.service.ts','utf8');
  assert.match(source,/cp\.code='MOVYO'/);
  assert.match(source,/runBounded\(rows,4/);
  assert.match(source,/RECONCILE_CONFLICT/);
  assert.match(source,/syncSubscriptionOperationalState/);
});
