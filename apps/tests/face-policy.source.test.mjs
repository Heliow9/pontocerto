import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(new URL(p,import.meta.url),'utf8');

test('shared face policy is optional when employee has no reference photo and enforced when enrolled',()=>{
  const source=read('../api/src/services/face-verification.service.ts');
  assert.match(source,/employee_face_images/);
  assert.match(source,/required:\s*false/);
  assert.match(source,/decision:\s*"NOT_REQUIRED"/);
  assert.match(source,/compareEmployeeFace/);
  assert.match(source,/FACE_MISMATCH/);
});

test('face routes expose admin photo enrollment and app mounts them',()=>{
  const routes=read('../api/src/routes/face.routes.ts');
  const app=read('../api/src/app.ts');
  assert.match(routes,/"\/employee\/:id\/photo"/);
  assert.match(routes,/single\("photo"\)/);
  assert.match(routes,/FACE_PHOTO_SAVE/);
  assert.match(routes,/FACE_PHOTO_REMOVE/);
  assert.match(app,/app\.use\("\/face",faceRouter\)/);
});
