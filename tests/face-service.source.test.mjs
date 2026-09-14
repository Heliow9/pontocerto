import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../apps/api/src/services/face.service.ts',import.meta.url),'utf8');

test('face service implements AWS Rekognition enrollment and identity matching',()=>{
  assert.match(source,/RekognitionService\.\$\{operation\}/);
  for(const operation of ['CreateCollection','DetectFaces','IndexFaces','SearchFacesByImage','DeleteFaces']){
    assert.match(source,new RegExp(`[\"']${operation}[\"']`));
  }
  assert.match(source,/FACE_MISMATCH/);
  assert.match(source,/ExternalImageId/);
  assert.match(source,/AWS4-HMAC-SHA256/);
});
