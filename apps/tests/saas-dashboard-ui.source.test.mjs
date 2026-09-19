import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('SaaS overview has executive finance hierarchy and quick actions',()=>{
  const portal=read('web/src/pages/SaasPortal.tsx');
  const css=read('web/src/pages/commercial.css');
  for(const label of ['Recebido no mês','A receber','Vencido','Atenção necessária','+ Novo cliente','+ Nova cobrança','+ Nova proposta','Ver inadimplentes']) assert.match(portal,new RegExp(label.replace(/[+]/g,'\\+')));
  assert.match(css,/commercial-finance-kpis/);
  assert.match(css,/commercial-health-grid/);
  assert.match(css,/commercial-attention/);
});

test('legacy Inter SaaS page is removed',()=>{
  assert.equal(fs.existsSync(new URL('../web/src/pages/SaasFinanceInter.tsx',import.meta.url)),false);
});
