import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateFirstCycleProrata} from '../src/services/product-subscription-core.js';

test('first cycle prorata uses actual days in the billing cycle',()=>{
  const result=calculateFirstCycleProrata({
    monthlyPrice:129.90,
    discountPercent:0,
    startsAt:'2026-09-20 00:00:00',
    currentPeriodStart:'2026-09-20 00:00:00',
    nextDueDate:'2026-10-10',
    firstCycleProrataEnabled:true,
  });
  assert.equal(result.isProrata,true);
  assert.equal(result.prorataDays,20);
  assert.equal(result.cycleDays,30);
  assert.equal(result.fullAmount,129.90);
  assert.equal(result.amount,86.60);
  assert.equal(result.periodStart,'2026-09-20');
  assert.equal(result.periodEnd,'2026-10-10');
});

test('prorata is calculated after commercial discount',()=>{
  const result=calculateFirstCycleProrata({
    monthlyPrice:179.90,
    discountPercent:10,
    startsAt:'2026-09-20',
    currentPeriodStart:'2026-09-20',
    nextDueDate:'2026-10-10',
    firstCycleProrataEnabled:1,
  });
  assert.equal(result.fullAmount,161.91);
  assert.equal(result.amount,107.94);
});

test('full cycle remains full monthly price',()=>{
  const result=calculateFirstCycleProrata({monthlyPrice:129.90,startsAt:'2026-09-10',currentPeriodStart:'2026-09-10',nextDueDate:'2026-10-10',firstCycleProrataEnabled:true});
  assert.equal(result.isProrata,false);
  assert.equal(result.prorataDays,30);
  assert.equal(result.cycleDays,30);
  assert.equal(result.amount,129.90);
});

test('existing or migrated subscription is not retroactively prorated',()=>{
  const disabled=calculateFirstCycleProrata({monthlyPrice:129.90,startsAt:'2026-01-20',currentPeriodStart:'2026-09-10',nextDueDate:'2026-10-10',firstCycleProrataEnabled:false});
  assert.equal(disabled.isProrata,false);
  assert.equal(disabled.amount,129.90);
  const advanced=calculateFirstCycleProrata({monthlyPrice:129.90,startsAt:'2026-09-20',currentPeriodStart:'2026-10-10',nextDueDate:'2026-11-10',firstCycleProrataEnabled:true});
  assert.equal(advanced.isProrata,false);
  assert.equal(advanced.amount,129.90);
});
