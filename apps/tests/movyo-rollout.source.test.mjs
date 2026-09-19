import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route=fs.readFileSync('api/src/routes/movyo-integration.routes.ts','utf8');
const ui=fs.readFileSync('web/src/pages/SaasMovyoIntegration.tsx','utf8');

test('Movyo rollout routes expose guarded settings and bulk cutover',()=>{
  assert.match(route,/get\('\/rollout'/);
  assert.match(route,/put\('\/rollout'/);
  assert.match(route,/post\('\/bulk-cutover'/);
  assert.match(route,/assertMovyoBulkCutoverEnabled/);
  assert.match(route,/writeAudit\(req,'UPDATE','movyo_rollout'/);
  assert.match(route,/writeAudit\(req,'BULK_CUTOVER','movyo_customer'/);
});

test('Movyo UI does not allow bulk migration before rollout flags',()=>{
  assert.match(ui,/movyoPilotApproved/);
  assert.match(ui,/bulkCutoverEnabled/);
  assert.match(ui,/\/saas\/integrations\/movyo\/rollout/);
  assert.match(ui,/\/saas\/integrations\/movyo\/bulk-cutover/);
});
