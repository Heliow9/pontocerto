import test from 'node:test';
import assert from 'node:assert/strict';
import {errorMessageFromResponse} from '../src/services/provider-http.js';

test('provider error parser extracts nested messages instead of object Object',()=>{
  assert.equal(errorMessageFromResponse({error:{message:'Documento inválido'}},'', 'Falha'),'Documento inválido');
  assert.equal(errorMessageFromResponse({errors:[{description:'Vencimento inválido'}]},'', 'Falha'),'Vencimento inválido');
});

test('provider error parser serializes unknown structured errors safely',()=>{
  const message=errorMessageFromResponse({foo:'bar'},'', 'Falha');
  assert.equal(message,'{"foo":"bar"}');
  assert.doesNotMatch(message,/\[object Object\]/);
});
