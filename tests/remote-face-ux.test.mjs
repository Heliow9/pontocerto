import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourcePath = 'mobile/src/RemoteClock.tsx';

test('ponto remoto mantém modal aberto durante validação facial online e mostra feedback local', async () => {
  const source = await readFile(sourcePath, 'utf8');
  for (const marker of ['cameraFeedback', 'Verificando seu rosto', 'Rosto não reconhecido', 'Ponto registrado']) {
    assert.ok(source.includes(marker), `marcador de UX ausente: ${marker}`);
  }
  assert.match(source, /setPhoto\(null\)/);
  assert.match(source, /FACE_MISMATCH|FACE_NOT_MATCHED|Rosto não reconhecido/);
});

test('falha facial online permite nova selfie sem fechar o modal', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /retryFaceCapture|resetCameraForRetry/);
  assert.match(source, /setCameraOpen\(true\)|cameraOpen/);
  assert.match(source, /setCameraReady\(false\)/);
});
