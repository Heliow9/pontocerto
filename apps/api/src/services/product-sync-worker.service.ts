import {createHash} from 'node:crypto';
import {env} from '../config/env.js';
import {pool} from '../db/pool.js';
import {BRASILIA_NOW_SQL} from '../utils/db-time.js';
import {getMovyoLicense} from './movyo-client.service.js';
import {syncSubscriptionOperationalState} from './product-integration.service.js';
import {decideMovyoReconciliation,runBounded} from './product-sync-worker-core.js';

let running=false;
let timer:ReturnType<typeof setInterval>|null=null;
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,32);
const json=(v:unknown)=>v==null?null:JSON.stringify(v);

async function logAttention(row:any,action:string,remote:unknown,error?:unknown){
  const key=`movyo-worker:${row.id}:${action}:${hash(remote||String((error as any)?.message||error||''))}`;
  await pool.query(`INSERT INTO product_sync_logs(product_subscription_id,product_code,external_account_id,action,status,idempotency_key,request_json,response_json,error_message,created_at)
    VALUES(?,'MOVYO',?,?, 'FAILED',?,?,?,?,${BRASILIA_NOW_SQL})
    ON DUPLICATE KEY UPDATE response_json=VALUES(response_json),error_message=VALUES(error_message)`,[
      Number(row.id),String(row.external_account_id),action,key,
      json({subscriptionId:Number(row.id),commercialCustomerId:Number(row.commercial_customer_id)}),json(remote),
      error?String((error as any)?.message||error).slice(0,500):null,
    ]);
}

export async function runProductSyncWorker(){
  if(running)return{skipped:true,reason:'ALREADY_RUNNING'};
  running=true;
  const summary={checked:0,inSync:0,resynced:0,conflicts:0,missing:0,errors:0};
  try{
    const [rows]=await pool.query<any[]>(`SELECT ps.id,ps.commercial_customer_id,ps.external_account_id,ps.status,ps.current_period_end,ps.grace_until
      FROM product_subscriptions ps JOIN commercial_products cp ON cp.id=ps.product_id
      WHERE cp.code='MOVYO' AND ps.external_account_id IS NOT NULL AND ps.external_account_id<>''`);
    const results=await runBounded(rows,4,async row=>{
      summary.checked++;
      let remote:any;
      try{remote=await getMovyoLicense(String(row.external_account_id));}
      catch(error:any){
        if(error?.code==='MOVYO_CUSTOMER_NOT_FOUND'||Number(error?.status)===404){summary.missing++;await logAttention(row,'RECONCILE_MISSING',null,error);return;}
        summary.errors++;await logAttention(row,'RECONCILE_ERROR',null,error);return;
      }
      const decision=decideMovyoReconciliation({subscriptionId:Number(row.id),commercialCustomerId:Number(row.commercial_customer_id),status:String(row.status),currentPeriodEnd:row.current_period_end,graceUntil:row.grace_until},remote);
      if(decision.action==='NONE'){summary.inSync++;return;}
      if(decision.action==='CONFLICT'){summary.conflicts++;await logAttention(row,'RECONCILE_CONFLICT',{remote,differences:decision.differences});return;}
      if(decision.action==='MISSING'){summary.missing++;await logAttention(row,'RECONCILE_MISSING',remote);return;}
      try{await syncSubscriptionOperationalState(Number(row.id),'RECONCILE_WORKER');summary.resynced++;}
      catch(error){summary.errors++;await logAttention(row,'RECONCILE_SYNC_FAILED',{remote,differences:decision.differences},error);}
    });
    // runBounded normally isolates item failures; retain an outer counter for unexpected callback escapes.
    summary.errors+=results.filter(r=>!r.ok).length;
    return summary;
  }finally{running=false;}
}

export function startProductSyncWorker(){
  if(env.MOVYO_SYNC_WORKER_ENABLED!=='1'||env.MOVYO_BRIDGE_ENABLED!=='1'||timer)return;
  const run=()=>void runProductSyncWorker().catch(error=>console.error('[movyo-sync-worker]',error));
  run();
  timer=setInterval(run,30*60*1000);
  timer.unref?.();
}
