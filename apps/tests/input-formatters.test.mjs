import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const out=mkdtempSync(join(tmpdir(),'pc-masks-'));
const source=resolve('web/src/utils/masks.ts');
execFileSync('tsc',[source,'--target','ES2020','--module','ES2020','--skipLibCheck','--outDir',out],{stdio:'pipe'});
const masks=await import(pathToFileURL(join(out,'masks.js')).href+'?t='+Date.now());
const {digitsOnly,formatCpf,formatCnpj,formatCpfCnpj,formatPhone,formatCep,formatPis,applyMask,parseCurrencyDigits,formatCurrencyBRL}=masks;

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
  assert.match(formatCurrencyBRL(0),/0,00/);
  assert.match(formatCurrencyBRL(1234.56),/1\.234,56/);
});

process.on('exit',()=>{try{rmSync(out,{recursive:true,force:true});}catch{}});
