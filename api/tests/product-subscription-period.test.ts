import test from 'node:test';
import assert from 'node:assert/strict';
import {addOneCalendarMonthDate} from '../src/services/product-subscription-core.js';

test('advances billing dates preserving day and clipping month end',()=>{
  assert.equal(addOneCalendarMonthDate('2026-10-15'),'2026-11-15');
  assert.equal(addOneCalendarMonthDate('2026-01-31'),'2026-02-28');
  assert.equal(addOneCalendarMonthDate('2028-01-31'),'2028-02-29');
  assert.equal(addOneCalendarMonthDate('2026-08-31'),'2026-09-30');
});
