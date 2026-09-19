import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../apps/api/src/routes/remote-punch.routes.ts', import.meta.url), 'utf8');

test('remote and offline punches validate face before insertion and store verification evidence', () => {
  assert.match(source, /evaluateEmployeeFace/);
  const verifyAt = source.indexOf('evaluateEmployeeFace');
  const txAt = source.indexOf('await gate.beginTransaction()', verifyAt);
  assert.ok(txAt > verifyAt, 'remote face verification must happen before transaction');
  assert.match(source, /FACE_NOT_RECOGNIZED/);
  assert.match(source, /face_verified,face_similarity,face_provider/);
  assert.match(source, /INSERT INTO time_entry_face_checks/);
  assert.match(source, /last_verified_at/);
});
