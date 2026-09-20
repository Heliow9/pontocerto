import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const remote = fs.readFileSync('apps/mobile/src/RemoteClock.tsx', 'utf8');
const main = fs.readFileSync('apps/mobile/app/index.tsx', 'utf8');

test('offline camera waits for live preview before allowing capture', () => {
  assert.match(remote, /cameraReady/);
  assert.match(remote, /onCameraReady=\{\(\) => setCameraReady\(true\)\}/);
  assert.match(remote, /if \(lock\.current \|\| !cameraReady\) return;/);
  assert.match(remote, /Iniciando câmera…/);
  assert.match(remote, /Posicione seu rosto dentro da área/);
});

test('normal punch camera waits for live preview before allowing capture', () => {
  assert.match(main, /cameraReady/);
  assert.match(main, /onCameraReady=\{\(\) => setCameraReady\(true\)\}/);
  assert.match(main, /if \(!cameraRef\.current \|\| capturing \|\| !cameraReady\) return;/);
  assert.match(main, /Iniciando câmera…/);
  assert.match(main, /Posicione seu rosto dentro da área/);
});
