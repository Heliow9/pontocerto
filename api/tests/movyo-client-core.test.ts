import test from 'node:test';
import assert from 'node:assert/strict';
import {stableJson,bodyHash,signMovyoRequest,verifyMovyoSignatureFixture} from '../src/services/movyo-client-core.js';

test('stable JSON and HMAC fixture match Movyo canonical contract',()=>{
  const body={planCode:'professional',status:'ACTIVE',nested:{z:1,a:2}};
  assert.equal(stableJson(body),'{"nested":{"a":2,"z":1},"planCode":"professional","status":"ACTIVE"}');
  const input={method:'PUT',path:'/api/internal/ponto-certo/customers/123/subscription',timestamp:'1789840000000',nonce:'abc',body};
  const sig=signMovyoRequest(input,'secret');
  assert.equal(sig.length,64);
  assert.equal(verifyMovyoSignatureFixture(input,'secret',sig),true);
  assert.equal(verifyMovyoSignatureFixture({...input,body:{...body,status:'BLOCKED'}},'secret',sig),false);
  assert.equal(bodyHash(body).length,64);
});
