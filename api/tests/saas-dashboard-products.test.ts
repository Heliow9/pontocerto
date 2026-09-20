import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProductDashboardRows,loadSaasDashboardProducts} from '../src/services/saas-dashboard-finance.js';

test('normalizes multiproduct MRR and status counts including zero products',()=>{
  const out=normalizeProductDashboardRows([
    {productCode:'PONTO_CERTO',productName:'Ponto Certo',mrr:'1299.00',active:'8',pastDue:'1',blocked:'2'},
    {productCode:'MOVYO',productName:'Movyo',mrr:'359.80',active:'2',pastDue:'0',blocked:'1'},
    {productCode:'PAYHUB',productName:'PayHub',mrr:null,active:null,pastDue:null,blocked:null},
  ]);
  assert.equal(out.mrrTotal,1658.8);
  assert.equal(out.mrrPontoCerto,1299);
  assert.equal(out.mrrMovyo,359.8);
  assert.equal(out.mrrPayHub,0);
  assert.equal(out.activeSubscriptions,10);
  assert.equal(out.pastDueSubscriptions,1);
  assert.equal(out.blockedSubscriptions,3);
  assert.deepEqual(out.products[2],{productCode:'PAYHUB',productName:'PayHub',mrr:0,active:0,pastDue:0,blocked:0});
});

test('product dashboard loader uses product subscriptions and preserves inactive catalog products',async()=>{
  let sql='';
  const executor={query:async(q:string)=>{sql=q;return [[
    {productCode:'PONTO_CERTO',productName:'Ponto Certo',mrr:'100.00',active:'1',pastDue:'0',blocked:'0'},
    {productCode:'MOVYO',productName:'Movyo',mrr:'69.90',active:'1',pastDue:'0',blocked:'0'},
    {productCode:'PAYHUB',productName:'PayHub',mrr:'0',active:'0',pastDue:'0',blocked:'0'},
  ],[]];}};
  const out=await loadSaasDashboardProducts(executor);
  assert.match(sql,/FROM commercial_products cp/i);
  assert.match(sql,/LEFT JOIN product_subscriptions ps/i);
  assert.match(sql,/PAST_DUE/);
  assert.equal(out.mrrTotal,169.9);
  assert.equal(out.products.length,3);
});
