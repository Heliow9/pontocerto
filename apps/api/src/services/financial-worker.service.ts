import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { todayInBrasilia } from "./financial-rules.js";
import { financialWorkerDateContext, shouldGenerateProductMonthly } from "./financial-worker-core.js";
import { createMonthlyCharge, createProductSubscriptionMonthlyCharge, listAmbiguousCharges, markOverdueCharges, reconcileCharge } from "./financial.service.js";
import { getTenantFinancialAccess, syncSubscriptionFinancialStatus } from "./financial-access.service.js";
import { syncProductFinancialAccess } from "./product-financial-access.service.js";
import { retryFailedProviderWebhooks } from "./payment-webhook.service.js";

let running=false;
let timer:ReturnType<typeof setInterval>|null=null;

export async function runFinancialWorker() {
  if(running)return {skipped:true};
  running=true;
  const summary={monthlyCreated:0,monthlyErrors:0,productMonthlyCreated:0,productMonthlyErrors:0,emailSent:0,emailErrors:0,overdue:0,reconciled:0,reconcileErrors:0,accessSynced:0,accessErrors:0,productAccessSynced:0,productAccessErrors:0,webhooksRetried:0};
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
        try{const result:any=await createMonthlyCharge(Number(row.tenant_id),context.competence,null,{issue:true});if(!result.alreadyExists)summary.monthlyCreated++;if(result.emailDelivery?.status==="SENT")summary.emailSent++;if(result.emailDelivery?.status==="FAILED")summary.emailErrors++;}
        catch(error){summary.monthlyErrors++;console.error("[financial-worker] monthly",row.tenant_id,error instanceof Error?error.message:error);}
      }
    }

    const [productSubscriptions]=await pool.query<any[]>(`SELECT ps.id,ps.billing_source,ps.status,ps.next_due_date FROM product_subscriptions ps JOIN commercial_products cp ON cp.id=ps.product_id WHERE ps.tenant_id IS NULL AND ps.next_due_date IS NOT NULL AND cp.active=1 AND ps.status IN ('ACTIVE','GRACE')`);
    for(const row of productSubscriptions){
      if(!shouldGenerateProductMonthly({billingSource:row.billing_source,status:row.status,nextDueDate:row.next_due_date,today:context.date}))continue;
      try{const result:any=await createProductSubscriptionMonthlyCharge(Number(row.id),context.competence,null,{issue:true,sendEmailAfterIssue:true});if(!result.alreadyExists)summary.productMonthlyCreated++;if(result.emailDelivery?.status==="SENT")summary.emailSent++;if(result.emailDelivery?.status==="FAILED")summary.emailErrors++;}
      catch(error){summary.productMonthlyErrors++;console.error("[financial-worker] product-monthly",row.id,error instanceof Error?error.message:error);}
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
    const [externalSubscriptions]=await pool.query<any[]>(`SELECT id FROM product_subscriptions WHERE tenant_id IS NULL AND billing_source='PONTO_CERTO' AND status IN ('ACTIVE','GRACE','PAST_DUE','BLOCKED')`);
    for(const row of externalSubscriptions){
      try{await syncProductFinancialAccess(Number(row.id),context.date);summary.productAccessSynced++;}
      catch(error){summary.productAccessErrors++;console.error("[financial-worker] product-access",row.id,error instanceof Error?error.message:error);}
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
