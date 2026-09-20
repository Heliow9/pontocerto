import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMovyoImport,mapMovyoCustomer,missingMovyoBillingFields} from '../src/services/movyo-import-core.js';

const completeRemote={
  id:42,
  nome:'Pizzaria Alfa',
  cnpj:'12.345.678/0001-90',
  email:'contato@alfa.test',
  telefone:'(81) 99999-0000',
  emailCobranca:'financeiro@alfa.test',
  enderecoCep:'50000-000',
  enderecoRua:'Rua A',
  enderecoNumero:'100',
  enderecoBairro:'Centro',
  enderecoCidade:'Recife',
  enderecoEstado:'PE',
  plano:'professional',
  statusAssinatura:'ativo',
  dataInicioPlano:'2026-09-15T00:00:00.000Z',
  dataFimPlano:'2026-10-15T23:59:59.000Z',
  valorMensalidadeCustomizado:'150.00',
  descontoMensalidadePercentual:'10',
};

test('maps Movyo billing identity, custom price, discount and paid-through date',()=>{
  const mapped=mapMovyoCustomer(completeRemote);
  assert.equal(mapped.externalId,'42');
  assert.equal(mapped.customer.legalName,'Pizzaria Alfa');
  assert.equal(mapped.customer.document,'12345678000190');
  assert.equal(mapped.customer.phone,'81999990000');
  assert.equal(mapped.customer.financialContactEmail,'financeiro@alfa.test');
  assert.equal(mapped.customer.zipCode,'50000000');
  assert.equal(mapped.planCode,'professional');
  assert.equal(mapped.monthlyPriceOverride,150);
  assert.equal(mapped.discountPercent,10);
  assert.equal(mapped.currentPeriodEnd,'2026-10-15T23:59:59.000Z');
  assert.equal(mapped.nextDueDate,'2026-10-15');
});

test('falls back billing email to restaurant email and marks complete customer READY_TO_MIGRATE',()=>{
  const remote={...completeRemote,emailCobranca:''};
  const mapped=mapMovyoCustomer(remote);
  assert.equal(mapped.customer.financialContactEmail,'contato@alfa.test');
  assert.deepEqual(missingMovyoBillingFields(mapped),[]);
  assert.equal(classifyMovyoImport(remote,{matchCount:0,alreadyImported:false}),'READY_TO_MIGRATE');
});

test('invalid document is treated as pending data instead of crashing sync',()=>{
  const remote={...completeRemote,cnpj:'12.345'};
  const mapped=mapMovyoCustomer(remote);
  assert.ok(missingMovyoBillingFields(mapped).includes('document'));
  assert.equal(classifyMovyoImport(remote,{matchCount:0,alreadyImported:false}),'PENDING_DATA');
});

test('missing automatic boleto fields produces PENDING_DATA',()=>{
  const remote={...completeRemote,enderecoNumero:'',enderecoCep:''};
  const mapped=mapMovyoCustomer(remote);
  assert.deepEqual(missingMovyoBillingFields(mapped),['zipCode','number']);
  assert.equal(classifyMovyoImport(remote,{matchCount:0,alreadyImported:false}),'PENDING_DATA');
});

test('ambiguous document match produces CONFLICT before incomplete classification',()=>{
  const remote={...completeRemote,enderecoNumero:''};
  assert.equal(classifyMovyoImport(remote,{matchCount:2,alreadyImported:false}),'CONFLICT');
});

test('existing mapping wins and is ALREADY_IMPORTED',()=>{
  assert.equal(classifyMovyoImport(completeRemote,{matchCount:1,alreadyImported:true}),'ALREADY_IMPORTED');
});

test('catalog price remains authoritative when no valid custom monthly price exists',()=>{
  for(const value of [null,'',0,'0','-10','abc']){
    const mapped=mapMovyoCustomer({...completeRemote,valorMensalidadeCustomizado:value});
    assert.equal(mapped.monthlyPriceOverride,null);
  }
});
