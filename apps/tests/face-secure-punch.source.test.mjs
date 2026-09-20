import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../api/src/routes/time-entries.routes.ts', import.meta.url), 'utf8');

test('secure punch validates optional employee reference photo before transaction and persists evidence', () => {
  assert.match(source, /requireEmployeeFace/);
  const verifyAt = source.indexOf('requireEmployeeFace');
  const txAt = source.indexOf('beginTransaction', verifyAt);
  assert.ok(txAt > verifyAt, 'face verification must happen before transaction');
  assert.match(source, /saveFaceCheck/);
});

test('employee punch cannot bypass a registered reference photo', () => {
  const policy = fs.readFileSync(new URL('../api/src/services/face-verification.service.ts', import.meta.url), 'utf8');
  assert.match(policy, /employee_face_images/);
  assert.match(policy, /if \(!face\.verified\)/);
  assert.match(policy, /FACE_MISMATCH/);
});
