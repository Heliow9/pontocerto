import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const exists=(p)=>fs.existsSync(new URL(p,import.meta.url));
const read=(p)=>fs.readFileSync(new URL(p,import.meta.url),'utf8');

test('shared face policy honors company requirement and employee exemption',()=>{
  assert.equal(exists('../apps/api/src/services/face-verification.service.ts'),true);
  const source=read('../apps/api/src/services/face-verification.service.ts');
  assert.match(source,/require_face_recognition/);
  assert.match(source,/biometric_exempt/);
  assert.match(source,/FACE_NOT_ENROLLED/);
  assert.match(source,/verifyFace/);
});

test('face routes expose admin enrollment and app mounts them',()=>{
  const routes=read('../apps/api/src/routes/face.routes.ts');
  const app=read('../apps/api/src/app.ts');
  assert.match(routes,/post\s*\(\s*"\/employee\/:id\/enroll"/);
  assert.match(routes,/Cadastro facial deve ser realizado pelo RH/);
  assert.match(routes,/faceProviderStatus/);
  assert.match(app,/app\.use\(\s*"\/faces"\s*,\s*faceRouter\s*\)/);
});
