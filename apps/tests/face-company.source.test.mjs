import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../apps/api/src/routes/companies.routes.ts', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../apps/web/src/pages/CompaniesPage.tsx', import.meta.url), 'utf8');
const types = fs.readFileSync(new URL('../apps/web/src/types.ts', import.meta.url), 'utf8');

test('company can enable or disable facial recognition policy', () => {
  assert.match(api, /requireFaceRecognition:z\.boolean\(\)\.default\(true\)/);
  assert.match(api, /require_face_recognition=VALUES\(require_face_recognition\)/);
  assert.match(api, /p\.require_face_recognition/);
  assert.match(page, /requireFaceRecognition: true/);
  assert.match(page, /checked=\{form\.requireFaceRecognition\}/);
  assert.match(page, /Exigir reconhecimento facial/);
  assert.match(types, /require_face_recognition\?: number \| null/);
});
