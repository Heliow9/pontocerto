import test from 'node:test';
import assert from 'node:assert/strict';

const securityModule = new URL('../src/services/autopoint-security.service.ts', import.meta.url).href;

test('AutoPonto defaults e limites são normalizados', async () => {
  const { normalizeAutoPointSettings } = await import(securityModule);
  assert.deepEqual(normalizeAutoPointSettings({}), {
    enabled: false,
    scanIntervalSeconds: 3,
    resultDisplaySeconds: 3,
    cooldownSeconds: 10,
  });
  assert.deepEqual(normalizeAutoPointSettings({
    enabled: true,
    scanIntervalSeconds: 0,
    resultDisplaySeconds: 99,
    cooldownSeconds: 2,
  }), {
    enabled: true,
    scanIntervalSeconds: 1,
    resultDisplaySeconds: 10,
    cooldownSeconds: 5,
  });
});

test('hash de código e token é determinístico e não expõe o segredo', async () => {
  const { hashAutoPointSecret } = await import(securityModule);
  const a = hashAutoPointSecret('483921', 'server-secret-123456');
  const b = hashAutoPointSecret('483921', 'server-secret-123456');
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.ok(!a.includes('483921'));
});

test('código e token usam espaços de entropia distintos', async () => {
  const { createActivationCode, createTerminalToken } = await import(securityModule);
  const code = createActivationCode();
  const token = createTerminalToken();
  assert.match(code, /^\d{6}$/);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(code, token);
});

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('camada facial AutoPonto usa Collection por empresa e SearchFacesByImage', async () => {
  const source = await readFile(path.join(apiRoot, 'src/services/face-collection.service.ts'), 'utf8');
  assert.match(source, /CreateCollectionCommand/);
  assert.match(source, /IndexFacesCommand/);
  assert.match(source, /DeleteFacesCommand/);
  assert.match(source, /SearchFacesByImageCommand/);
  assert.match(source, /employee_face_profiles/);
});

test('cadastro e remoção de foto atualizam o índice AutoPonto', async () => {
  const source = await readFile(path.join(apiRoot, 'src/routes/face.routes.ts'), 'utf8');
  assert.match(source, /indexEmployeeFace/);
  assert.match(source, /removeEmployeeFaceIndex/);
});

test('API AutoPonto expõe administração, ativação, sessão e punch', async () => {
  const routes = await readFile(path.join(apiRoot, 'src/routes/autopoint.routes.ts'), 'utf8');
  assert.match(routes, /autopointRouter\.use\(\"\/admin\", admin\)/);
  for (const marker of ['/settings/:companyId','/terminals','/reindex/:companyId','/activate','/session','/punch'])
    assert.ok(routes.includes(marker), `rota ausente: ${marker}`);
  assert.match(routes, /createActivationCode/);
  assert.match(routes, /createTerminalToken/);
  assert.match(routes, /hashAutoPointSecret/);
  assert.match(routes, /reindexCompanyFaces/);
});

test('app monta o router AutoPonto', async () => {
  const source = await readFile(path.join(apiRoot, 'src/app.ts'), 'utf8');
  assert.match(source, /autopointRouter/);
  assert.match(source, /app\.use\("\/autopoint"/);
});

test('last_seen do terminal é atualizado de forma limitada para não escrever no banco a cada scan', async () => {
  const routes = await readFile(path.join(apiRoot, 'src/routes/autopoint.routes.ts'), 'utf8');
  assert.match(routes, /last_seen_at IS NULL OR last_seen_at < DATE_SUB/);
});
