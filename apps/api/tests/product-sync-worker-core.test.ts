import test from 'node:test';
import assert from 'node:assert/strict';
import {decideMovyoReconciliation,runBounded} from '../src/services/product-sync-worker-core.js';

const local={subscriptionId:88,commercialCustomerId:55,status:'ACTIVE',currentPeriodEnd:'2026-10-15 23:59:59',graceUntil:null};

test('in-sync Movyo license needs no write',()=>{
  assert.equal(decideMovyoReconciliation(local,{billingSource:'PONTO_CERTO',billingStatus:'ACTIVE',billingAccessBlocked:false,billingCurrentPeriodEnd:'2026-10-15T23:59:59.000Z',billingGraceUntil:null,pontoCertoCustomerId:'55',pontoCertoSubscriptionId:'88'}).action,'NONE');
});

test('safe status/date drift requests authoritative resync',()=>{
  const d=decideMovyoReconciliation(local,{billingSource:'PONTO_CERTO',billingStatus:'BLOCKED',billingAccessBlocked:true,billingCurrentPeriodEnd:'2026-09-15',pontoCertoCustomerId:'55',pontoCertoSubscriptionId:'88'});
  assert.equal(d.action,'SYNC');
  assert.ok(d.differences.includes('billingStatus'));
  assert.ok(d.differences.includes('billingCurrentPeriodEnd'));
});

test('identity mismatch is conflict and is never auto-fixed',()=>{
  const d=decideMovyoReconciliation(local,{billingSource:'PONTO_CERTO',billingStatus:'ACTIVE',pontoCertoCustomerId:'999',pontoCertoSubscriptionId:'88'});
  assert.equal(d.action,'CONFLICT');
});

test('missing remote customer is flagged',()=>{
  assert.equal(decideMovyoReconciliation(local,null).action,'MISSING');
});

test('bounded runner isolates failures and respects concurrency',async()=>{
  let active=0,max=0;
  const out=await runBounded([1,2,3,4,5],2,async n=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;if(n===3)throw new Error('boom');return n*2;});
  assert.ok(max<=2);
  assert.equal(out.length,5);
  assert.equal(out.filter(x=>x.ok).length,4);
  assert.equal(out.find(x=>x.index===2)?.ok,false);
});
