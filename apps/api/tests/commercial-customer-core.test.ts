import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCommercialCustomer} from '../src/services/commercial-customer-core.js';

test('responsavel financeiro aceita somente CPF',()=>{
  assert.throws(()=>normalizeCommercialCustomer({legalName:'Empresa Teste',personType:'PJ',document:'61257120000163',financialContactDocument:'61257120000163'}),error=>{
    const e=error as any;
    assert.equal(e.status,400);
    assert.equal(e.code,'FINANCIAL_CONTACT_CPF_INVALID');
    assert.match(e.message,/CPF do responsável financeiro inválido/);
    return true;
  });
});

test('responsavel financeiro aceita CPF valido',()=>{
  const out=normalizeCommercialCustomer({legalName:'Empresa Teste',personType:'PJ',document:'61257120000163',financialContactDocument:'10575342420'});
  assert.equal(out.financialContactDocument,'10575342420');
});
