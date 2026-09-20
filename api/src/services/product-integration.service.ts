import {createHash} from 'node:crypto';
import {pool} from '../db/pool.js';
import {BRASILIA_NOW_SQL} from '../utils/db-time.js';
import {getProductSubscription} from './product-subscription.service.js';
import {buildMovyoBillingPayload} from './product-integration-core.js';
import {syncMovyoSubscription} from './movyo-client.service.js';

const json=(v:unknown)=>v==null?null:JSON.stringify(v);
function syncKey(subscriptionId:number,payload:unknown){return `movyo:${subscriptionId}:${createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0,40)}`;}

async function latestCharge(subscriptionId:number){
  const [rows]=await pool.query<any[]>(`SELECT id,status,provider,requested_payment_method,amount,base_amount,is_prorata,prorata_days,prorata_cycle_days,billing_period_start,billing_period_end,due_date,provider_payment_url,provider_pdf_url,digitable_line,pix_copy_paste,pix_qr_code FROM financial_charges WHERE product_subscription_id=? ORDER BY id DESC LIMIT 1`,[subscriptionId]);
  const r=rows[0];if(!r)return null;
  return{id:Number(r.id),status:r.status,provider:r.provider,paymentMethod:r.requested_payment_method,amount:Number(r.amount),baseAmount:r.base_amount==null?Number(r.amount):Number(r.base_amount),isProrata:Boolean(Number(r.is_prorata||0)),prorataDays:r.prorata_days==null?null:Number(r.prorata_days),prorataCycleDays:r.prorata_cycle_days==null?null:Number(r.prorata_cycle_days),periodStart:r.billing_period_start||null,periodEnd:r.billing_period_end||null,dueDate:r.due_date,paymentUrl:r.provider_payment_url,pdfUrl:r.provider_pdf_url,digitableLine:r.digitable_line,pixCopyPaste:r.pix_copy_paste,pixQrCode:r.pix_qr_code};
}

async function writeSyncLog(input:{subscriptionId:number;externalAccountId:string;action:string;status:'SUCCESS'|'FAILED';idempotencyKey:string;request:unknown;response?:unknown;error?:unknown}){
  const errorMessage=input.error?String((input.error as any)?.message||input.error).slice(0,500):null;
  await pool.query(`INSERT INTO product_sync_logs(product_subscription_id,product_code,external_account_id,action,status,idempotency_key,request_json,response_json,error_message,created_at) VALUES(?,'MOVYO',?,?,?,?,?,?,?,${BRASILIA_NOW_SQL}) ON DUPLICATE KEY UPDATE status=VALUES(status),response_json=COALESCE(VALUES(response_json),response_json),error_message=VALUES(error_message)`,[input.subscriptionId,input.externalAccountId,input.action,input.status,input.idempotencyKey,json(input.request),json(input.response),errorMessage]);
}

export async function syncSubscriptionOperationalState(subscriptionId:number,reason='SYNC'){
  const s:any=await getProductSubscription(subscriptionId);
  if(String(s.product_code).toUpperCase()!=='MOVYO')return{skipped:true,reason:'PRODUCT_NOT_MOVYO'};
  if(!s.external_account_id)return{skipped:true,reason:'EXTERNAL_ACCOUNT_MISSING'};
  const charge=await latestCharge(subscriptionId);
  const payload=buildMovyoBillingPayload({
    pontoCertoCustomerId:Number(s.commercial_customer_id),subscriptionId,status:String(s.status),planCode:s.plan_code||null,
    monthlyPrice:Number(s.monthly_price),discountPercent:Number(s.discount_percent),currentPeriodEnd:s.current_period_end||null,graceUntil:s.grace_until||null,charge,
  });
  const key=syncKey(subscriptionId,payload),externalAccountId=String(s.external_account_id);
  try{
    const response=await syncMovyoSubscription(externalAccountId,payload,key);
    await writeSyncLog({subscriptionId,externalAccountId,action:reason,status:'SUCCESS',idempotencyKey:key,request:payload,response});
    return{skipped:false,response,payload};
  }catch(error){
    await writeSyncLog({subscriptionId,externalAccountId,action:reason,status:'FAILED',idempotencyKey:key,request:payload,error}).catch(()=>undefined);
    throw error;
  }
}
