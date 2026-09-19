import test from 'node:test';
import assert from 'node:assert/strict';
import {
  digitsOnly, formatCpf, formatCnpj, formatCpfCnpj, formatPhone, formatCep, formatPis,
  applyMask, parseCurrencyDigits, formatCurrencyBRL
} from '../web/src/utils/masks.ts';

test('document masks format digit-only and already formatted values',()=>{
  assert.equal(digitsOnly('12.345.678/0001-90'),'12345678000190');
  assert.equal(formatCpf('12345678901'),'123.456.789-01');
  assert.equal(formatCnpj('12345678000190'),'12.345.678/0001-90');
  assert.equal(formatCpfCnpj('12345678901'),'123.456.789-01');
  assert.equal(formatCpfCnpj('12.345.678/0001-90'),'12.345.678/0001-90');
});

test('phone, CEP and PIS masks are progressive and paste-safe',()=>{
  assert.equal(formatPhone('81999998888'),'(81) 99999-8888');
  assert.equal(formatPhone('5581999998888'),'+55 (81) 99999-8888');
  assert.equal(formatPhone('8133334444'),'(81) 3333-4444');
  assert.equal(formatCep('50000000'),'50000-000');
  assert.equal(formatPis('12345678901'),'123.45678.90-1');
  assert.equal(applyMask('cnpj','12.345.678/0001-90'),'12.345.678/0001-90');
  assert.equal(applyMask('phone','(81) 99999-8888'),'(81) 99999-8888');
});

test('currency digit entry is interpreted as cents',()=>{
  assert.equal(parseCurrencyDigits('1'),0.01);
  assert.equal(parseCurrencyDigits('12'),0.12);
  assert.equal(parseCurrencyDigits('120'),1.2);
  assert.equal(parseCurrencyDigits('1200'),12);
  assert.equal(parseCurrencyDigits('120000'),1200);
  assert.equal(parseCurrencyDigits(''),null);
});

test('currency formatting uses Brazilian Real and preserves zero',()=>{
  assert.equal(formatCurrencyBRL(0),'R$ 0,00');
  assert.equal(formatCurrencyBRL(1200),'R$ 1.200,00');
  assert.equal(formatCurrencyBRL(null),'');
});
