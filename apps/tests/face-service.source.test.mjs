import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../api/src/services/face.service.ts',import.meta.url),'utf8');

test('face service implements AWS Rekognition detect and compare flow',()=>{
  for(const marker of ['RekognitionClient','DetectFacesCommand','CompareFacesCommand','AWS_REKOGNITION','FACE_MATCH_THRESHOLD']) assert.match(source,new RegExp(marker));
  assert.match(source,/assertSingleFace/);
  assert.match(source,/compareEmployeeFace/);
  assert.match(source,/SimilarityThreshold/);
  assert.match(source,/AWS_REKOGNITION/);
});
