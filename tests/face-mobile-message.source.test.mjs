import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../apps/mobile/app/index.tsx',import.meta.url),'utf8');
test('mobile point gives a specific facial recognition error title',()=>{
  assert.match(source,/code\?\.startsWith\("FACE"\)/);
  assert.match(source,/Reconhecimento facial/);
});
