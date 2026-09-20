import assert from 'node:assert/strict';
import test from 'node:test';
import {calculateChargeAdjustment} from '../src/services/financial-reissue-core.js';

test('aplica desconto percentual somente sobre a cobrança atual',()=>{
  const r=calculateChargeAdjustment(129.90,'PERCENT',20);
  assert.equal(r.discountAmount,25.98);
  assert.equal(r.newAmount,103.92);
});

test('aplica desconto fixo',()=>{
  const r=calculateChargeAdjustment(129.90,'FIXED',10);
  assert.equal(r.discountAmount,10);
  assert.equal(r.newAmount,119.90);
});

test('permite reemissão sem desconto para alterar vencimento',()=>{
  const r=calculateChargeAdjustment(69.90,'NONE',0);
  assert.equal(r.discountAmount,0);
  assert.equal(r.newAmount,69.90);
});

test('bloqueia desconto que zera a cobrança',()=>{
  assert.throws(()=>calculateChargeAdjustment(10,'FIXED',10));
  assert.throws(()=>calculateChargeAdjustment(10,'PERCENT',100));
});
