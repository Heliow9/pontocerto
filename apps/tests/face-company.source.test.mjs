import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../api/src/routes/companies.routes.ts', import.meta.url), 'utf8');
const face = fs.readFileSync(new URL('../api/src/services/face-verification.service.ts', import.meta.url), 'utf8');

test('facial recognition remains optional per employee photo instead of company-wide blocking', () => {
  assert.match(api, /require_face_recognition/);
  assert.match(face, /employee_face_images/);
  assert.match(face, /if \(!rows\[0\]\)/);
  assert.match(face, /required:\s*false/);
  assert.match(face, /decision:\s*"NOT_REQUIRED"/);
});
