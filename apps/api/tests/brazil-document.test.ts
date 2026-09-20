import test from 'node:test';
import assert from 'node:assert/strict';
import {brazilDocumentDigits,isValidBrazilDocument,isValidCnpj,isValidCpf} from '../src/utils/brazil-document.js';

test('normaliza documento brasileiro',()=>assert.equal(brazilDocumentDigits('12.345.678/0001-95'),'12345678000195'));
test('valida CPF com dígitos verificadores',()=>{assert.equal(isValidCpf('529.982.247-25'),true);assert.equal(isValidCpf('529.982.247-24'),false);assert.equal(isValidCpf('111.111.111-11'),false);});
test('valida CNPJ com dígitos verificadores',()=>{assert.equal(isValidCnpj('11.222.333/0001-81'),true);assert.equal(isValidCnpj('11.222.333/0001-80'),false);assert.equal(isValidCnpj('11.111.111/1111-11'),false);});
test('respeita tipo de pessoa',()=>{assert.equal(isValidBrazilDocument('52998224725','PF'),true);assert.equal(isValidBrazilDocument('52998224725','PJ'),false);assert.equal(isValidBrazilDocument('11222333000181','PJ'),true);});
