import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../apps/api/src/routes/time-entries.routes.ts', import.meta.url), 'utf8');

test('secure punch verifies selfie face before transaction and persists evidence', () => {
  assert.match(source, /evaluateEmployeeFace/);
  const verifyAt = source.indexOf('evaluateEmployeeFace');
  const beginAt = source.indexOf('await conn.beginTransaction()', verifyAt);
  assert.ok(beginAt > verifyAt, 'face verification must happen before transaction starts');
  assert.match(source, /FACE_MISMATCH/);
  assert.match(source, /FACE_NOT_RECOGNIZED/);
  assert.match(source, /face_decision,face_similarity/);
  assert.match(source, /face_verified,face_similarity,face_provider/);
  assert.match(source, /INSERT INTO time_entry_face_checks/);
  assert.match(source, /last_verified_at/);
});

test('legacy employee punch cannot bypass required facial recognition', () => {
  assert.match(source, /getEmployeeFacePolicy/);
  assert.match(source, /facePolicy\.required/);
  assert.match(source, /SECURE_PUNCH_REQUIRED/);
});
