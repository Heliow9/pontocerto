import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('painel web possui página AutoPonto com tempos, terminais e reindexação', async () => {
  const page = await readFile('web/src/pages/AutoPointPage.tsx','utf8');
  for (const marker of ['scanIntervalSeconds','resultDisplaySeconds','cooldownSeconds','activationCode','/autopoint/admin/reindex/'])
    assert.ok(page.includes(marker), `marcador ausente ${marker}`);
  const app = await readFile('web/src/App.tsx','utf8');
  assert.match(app, /autopoint/);
  assert.match(app, /AutoPointPage/);
});

test('login do PWA oferece AutoPonto e componente usa câmera + timers', async () => {
  const index = await readFile('mobile/app/index.tsx','utf8');
  const auto = await readFile('mobile/src/AutoPoint.tsx','utf8');
  assert.match(index, /AutoPonto/);
  assert.match(index, /AutoPoint/);
  assert.match(auto, /CameraView/);
  assert.match(auto, /scanIntervalSeconds/);
  assert.match(auto, /resultDisplaySeconds/);
  assert.match(auto, /x-autopoint-token/i);
  assert.match(auto, /\/autopoint\/punch/);
});

test('AutoPonto trata permissão de câmera antes de iniciar varredura', async () => {
  const auto = await readFile('mobile/src/AutoPoint.tsx','utf8');
  assert.match(auto, /Permitir câmera/);
  assert.match(auto, /permission\?\.granted/);
  assert.match(auto, /requestPermission/);
  assert.match(auto, /Câmera bloqueada|Permissão de câmera/);
});

test('reativação de terminal gera novo código em vez de deixar terminal sem credencial', async () => {
  const page = await readFile('web/src/pages/AutoPointPage.tsx','utf8');
  assert.match(page, /if \(!Boolean\(terminal\.active\)\)[\s\S]{0,100}newCode\(terminal\)/);
});

test('configuração AutoPonto fica restrita ao administrador da empresa', async () => {
  const app = await readFile('web/src/App.tsx','utf8');
  assert.match(app, /n\.id !== "autopoint" \|\| user\?\.role === "TENANT_ADMIN"/);
});
