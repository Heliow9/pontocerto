import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../api/src/routes/remote-punch.routes.ts', import.meta.url), 'utf8');

test('remote and offline punches validate optional employee face before insertion and store evidence', () => {
  assert.match(source, /requireEmployeeFace/);
  const verifyAt = source.indexOf('requireEmployeeFace');
  const txAt = source.indexOf('beginTransaction', verifyAt);
  assert.ok(txAt > verifyAt, 'remote face verification must happen before transaction');
  assert.match(source, /saveFaceCheck/);
});
