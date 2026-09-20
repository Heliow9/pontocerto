import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../mobile/app/index.tsx',import.meta.url),'utf8');
test('mobile point gives specific facial recognition feedback',()=>{
  assert.match(source,/FACE_MISMATCH/);
  assert.match(source,/FACE_IMAGE_NO_FACE/);
  assert.match(source,/Rosto não reconhecido/);
  assert.match(source,/Precisamos de uma nova foto/);
});
