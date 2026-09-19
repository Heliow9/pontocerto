import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFinanceSummary, loadSaasDashboardFinance } from "../src/services/saas-dashboard-finance.js";

test("normalizes null aggregates and numeric strings to zero/numbers",()=>{
  assert.deepEqual(normalizeFinanceSummary({
    receivedMonth:null,openAmount:"120.50",openCount:"2",overdueAmount:null,
    overdueCount:null,overdueTenants:"1",blockedTenants:null
  }),{
    receivedMonth:0,openAmount:120.5,openCount:2,overdueAmount:0,
    overdueCount:0,overdueTenants:1,blockedTenants:0
  });
});


test("empty financial database returns zero summary and empty attention",async()=>{
  let calls=0;
  const executor={query:async()=>{calls++;return calls===1?[[{receivedMonth:null,openAmount:null,openCount:null,overdueAmount:null,overdueCount:null,overdueTenants:null,blockedTenants:null}],[]]:[[],[]];}};
  const result=await loadSaasDashboardFinance(executor);
  assert.deepEqual(result,{receivedMonth:0,openAmount:0,openCount:0,overdueAmount:0,overdueCount:0,overdueTenants:0,blockedTenants:0,attention:[]});
});
