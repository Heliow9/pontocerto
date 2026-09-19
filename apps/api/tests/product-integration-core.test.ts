import test from 'node:test';
import assert from 'node:assert/strict';
import {mapSubscriptionOperationalState,buildMovyoBillingPayload} from '../src/services/product-integration-core.js';

test('maps subscription states without conflating operational block',()=>{
  assert.deepEqual(mapSubscriptionOperationalState('ACTIVE'),{billingStatus:'ACTIVE',billingAccessBlocked:false});
  assert.deepEqual(mapSubscriptionOperationalState('GRACE'),{billingStatus:'GRACE',billingAccessBlocked:false});
  assert.deepEqual(mapSubscriptionOperationalState('PAST_DUE'),{billingStatus:'BLOCKED',billingAccessBlocked:true});
  assert.deepEqual(mapSubscriptionOperationalState('BLOCKED'),{billingStatus:'BLOCKED',billingAccessBlocked:true});
  assert.deepEqual(mapSubscriptionOperationalState('CANCELED'),{billingStatus:'CANCELED',billingAccessBlocked:true});
});

test('billing payload carries charge payment surfaces but no secrets',()=>{
  const payload=buildMovyoBillingPayload({
    pontoCertoCustomerId:55, subscriptionId:88,status:'ACTIVE',planCode:'professional',monthlyPrice:179.9,discountPercent:0,currentPeriodEnd:'2026-10-15T23:59:59.000Z',graceUntil:null,
    charge:{id:321,status:'OPEN',provider:'EFI',paymentMethod:'HYBRID',amount:119.93,baseAmount:179.9,isProrata:true,prorataDays:20,prorataCycleDays:30,periodStart:'2026-09-20',periodEnd:'2026-10-10',dueDate:'2026-10-10',paymentUrl:'https://pay',pdfUrl:'https://pdf',digitableLine:'123',pixCopyPaste:'pix',pixQrCode:'qr'}
  });
  assert.equal(payload.pontoCertoSubscriptionId,'88');
  assert.equal(payload.billingStatus,'ACTIVE');
  assert.equal(payload.charge?.paymentMethod,'HYBRID');
  assert.equal(payload.charge?.isProrata,true);
  assert.equal(payload.charge?.prorataDays,20);
  assert.equal(payload.charge?.baseAmount,179.9);
  assert.equal((payload as any).secret,undefined);
});
