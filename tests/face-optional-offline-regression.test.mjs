import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('reconhecimento individual continua condicionado à existência da foto cadastrada', async () => {
  const service = await readFile('api/src/services/face-verification.service.ts', 'utf8');
  assert.match(service, /employee_face_images/);
  assert.match(service, /if \(!rows\[0\]\)/);
  assert.match(service, /required:\s*false/);
  assert.match(service, /verified:\s*true/);
  assert.match(service, /decision:\s*"NOT_REQUIRED"/);
  assert.match(service, /if \(!face\.verified\)/);
});

test('sincronização offline envia a selfie ao mesmo endpoint protegido pela regra facial opcional', async () => {
  const remote = await readFile('api/src/routes/remote-punch.routes.ts', 'utf8');
  const mobile = await readFile('mobile/src/RemoteClock.tsx', 'utf8');
  assert.match(remote, /requireEmployeeFace/);
  assert.match(remote, /saveFaceCheck/);
  assert.match(mobile, /offline:\s*Boolean/);
  assert.match(mobile, /selfie:\s*photo\.base64/);
  assert.match(mobile, /\/remote-punch/);
});
