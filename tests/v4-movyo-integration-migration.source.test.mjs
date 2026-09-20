import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync('api/sql/027_movyo_integration.sql','utf8');
test('movyo integration migration creates mapping and sync audit tables',()=>{
  assert.match(sql,/CREATE TABLE IF NOT EXISTS movyo_integration_mappings/i);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS product_sync_logs/i);
  assert.match(sql,/migration_status/i);
  assert.match(sql,/idempotency_key/i);
  assert.match(sql,/grace_until/i);
  assert.doesNotMatch(sql,/REGEXP_REPLACE/i);
});
