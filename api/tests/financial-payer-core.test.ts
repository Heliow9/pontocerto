import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFinancialPayer, missingPayerFieldsForMethod, billingProfileCompleteness } from '../src/services/financial-payer-core.js';

test('normaliza documento telefone cep e UF sem destruir nome/email',()=>{
  const payer=normalizeFinancialPayer({source:'EXTERNAL',personType:'PJ',name:' Empresa X ',document:'12.345.678/0001-90',email:'FIN@EXEMPLO.COM ',phone:'(81) 99999-0000',zipCode:'50.000-000',street:' Rua A ',number:'10',district:'Centro',city:'Recife',state:'pe'});
  assert.equal(payer.name,'Empresa X');
  assert.equal(payer.document,'12345678000190');
  assert.equal(payer.phone,'81999990000');
  assert.equal(payer.zipCode,'50000000');
  assert.equal(payer.email,'fin@exemplo.com');
  assert.equal(payer.state,'PE');
});

test('boleto Mercado Pago exige endereço completo e email',()=>{
  const payer=normalizeFinancialPayer({source:'EXTERNAL',personType:'PF',name:'João',document:'123.456.789-00',email:'joao@example.com'});
  assert.deepEqual(missingPayerFieldsForMethod(payer,'MERCADO_PAGO','BOLETO'),['zipCode','street','number','district','city','state']);
});

test('Pix não exige endereço completo',()=>{
  const payer=normalizeFinancialPayer({source:'EXTERNAL',personType:'PF',name:'João',document:'123.456.789-00',email:'joao@example.com'});
  assert.deepEqual(missingPayerFieldsForMethod(payer,'MERCADO_PAGO','PIX'),[]);
});

test('perfil financeiro sinaliza responsável e endereço incompletos',()=>{
  const result=billingProfileCompleteness({billingLegalName:'Empresa',billingDocument:'12345678000190',financialContactEmail:'financeiro@example.com'} as any);
  assert.equal(result.complete,false);
  assert.ok(result.missing.includes('billingZipCode'));
  assert.ok(result.missing.includes('financialContactName'));
});
