import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { todayInBrasilia } from "./financial-rules.js";
import { financialWorkerDateContext } from "./financial-worker-core.js";
import { createMonthlyCharge, listAmbiguousCharges, markOverdueCharges, reconcileCharge } from "./financial.service.js";
import { getTenantFinancialAccess, syncSubscriptionFinancialStatus } from "./financial-access.service.js";
import { retryFailedProviderWebhooks } from "./payment-webhook.service.js";

let running=false;
let timer:ReturnType<typeof setInterval>|null=null;

export async function runFinancialWorker() {
  if(running)return {skipped:true};
  running=true;
  const summary={monthlyCreated:0,monthlyErrors:0,overdue:0,reconciled:0,reconcileErrors:0,accessSynced:0,accessErrors:0,webhooksRetried:0};
  try{
    summary.overdue=await markOverdueCharges();
    const context=financialWorkerDateContext(todayInBrasilia());
    if(context.generateMonthly){
      const [tenants]=await pool.query<any[]>(
        `SELECT bp.tenant_id FROM saas_billing_profiles bp
         JOIN tenants t ON t.id=bp.tenant_id
         JOIN subscriptions s ON s.id=(SELECT MAX(s2.id) FROM subscriptions s2 WHERE s2.tenant_id=t.id)
         WHERE bp.auto_monthly_enabled=1 AND t.status='ACTIVE' AND s.status IN ('ACTIVE','PAST_DUE')`);
      for(const row of tenants){
        try{const result=await createMonthlyCharge(Number(row.tenant_id),context.competence,null,{issue:true});if(!result.alreadyExists)summary.monthlyCreated++;}
        catch(error){summary.monthlyErrors++;console.error("[financial-worker] monthly",row.tenant_id,error instanceof Error?error.message:error);}
      }
    }
    for(const chargeId of await listAmbiguousCharges(50)){
      try{await reconcileCharge(chargeId,null);summary.reconciled++;}catch(error){summary.reconcileErrors++;console.error("[financial-worker] reconcile",chargeId,error instanceof Error?error.message:error);}
    }
    const retried=await retryFailedProviderWebhooks(25);summary.webhooksRetried=retried.length;
    const [profiles]=await pool.query<any[]>("SELECT tenant_id FROM saas_billing_profiles");
    for(const row of profiles){
      try{const access=await getTenantFinancialAccess(Number(row.tenant_id));await syncSubscriptionFinancialStatus(Number(row.tenant_id),access.blocked);summary.accessSynced++;}
      catch(error){summary.accessErrors++;console.error("[financial-worker] access",row.tenant_id,error instanceof Error?error.message:error);}
    }
    return summary;
  }finally{running=false;}
}

export function startFinancialWorker(){
  if(env.FINANCIAL_WORKER_ENABLED!=="1"||timer)return;
  const run=()=>void runFinancialWorker().catch(error=>console.error("[financial-worker] run",error));
  run();
  timer=setInterval(run,15*60*1000);
  timer.unref?.();
}
