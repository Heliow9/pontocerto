import {pool} from '../db/pool.js';
import {BRASILIA_NOW_SQL} from '../utils/db-time.js';
import {todayInBrasilia} from './financial-rules.js';
import {productSubscriptionFinancialState} from './financial-worker-core.js';
import {recordFinancialEvent} from './financial.service.js';
import {syncSubscriptionOperationalState} from './product-integration.service.js';

const accessError=(message:string,status=400,code='PRODUCT_FINANCIAL_ACCESS_ERROR')=>Object.assign(new Error(message),{status,code});
const terminal=new Set(['CANCELED','PENDING_DATA','PROVISIONING','PROVISIONING_ERROR']);

export async function getProductFinancialAccess(subscriptionId:number,today=todayInBrasilia()){
  const [subs]=await pool.query<any[]>(`SELECT id,tenant_id,status,auto_block,grace_until,blocked_at,billing_source FROM product_subscriptions WHERE id=? LIMIT 1`,[subscriptionId]);
  const subscription=subs[0];
  if(!subscription)throw accessError('Assinatura de produto não encontrada.',404,'PRODUCT_SUBSCRIPTION_NOT_FOUND');
  const [charges]=await pool.query<any[]>(`SELECT id,status,due_date,block_at,amount FROM financial_charges WHERE product_subscription_id=? AND status IN ('OPEN','OVERDUE','ISSUING') ORDER BY due_date ASC,id ASC`,[subscriptionId]);
  let state:'ACTIVE'|'GRACE'|'BLOCKED'='ACTIVE';
  for(const charge of charges){
    const candidate=productSubscriptionFinancialState({chargeStatus:charge.status,dueDate:charge.due_date,blockAt:charge.block_at,autoBlock:Boolean(Number(subscription.auto_block)),graceUntil:subscription.grace_until,today});
    if(candidate==='BLOCKED'){state='BLOCKED';break;}
    if(candidate==='GRACE')state='GRACE';
  }
  return{subscriptionId,status:state,currentStatus:String(subscription.status),billingSource:String(subscription.billing_source||''),graceUntil:subscription.grace_until||null,blockedAt:subscription.blocked_at||null,openCharges:charges.map((r:any)=>({id:Number(r.id),status:r.status,dueDate:r.due_date,blockAt:r.block_at,amount:Number(r.amount)}))};
}

export async function syncProductFinancialAccess(subscriptionId:number,today=todayInBrasilia()){
  const access=await getProductFinancialAccess(subscriptionId,today);
  if(terminal.has(access.currentStatus))return{...access,changed:false,skipped:true};
  const changed=access.currentStatus!==access.status;
  if(changed){
    if(access.status==='BLOCKED')await pool.query(`UPDATE product_subscriptions SET status='BLOCKED',blocked_at=COALESCE(blocked_at,${BRASILIA_NOW_SQL}),updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[subscriptionId]);
    else await pool.query(`UPDATE product_subscriptions SET status=?,blocked_at=NULL,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[access.status,subscriptionId]);
    await syncSubscriptionOperationalState(subscriptionId,'FINANCIAL_ACCESS_CHANGED').catch(error=>console.error('[product-financial-access] sync',subscriptionId,error instanceof Error?error.message:error));
  }
  return{...access,changed,skipped:false};
}

export async function grantProductFinancialException(input:{subscriptionId:number;endsAt:string;reason:string;actorUserId:number}){
  const endsAt=new Date(input.endsAt);
  if(Number.isNaN(endsAt.getTime())||endsAt.getTime()<=Date.now())throw accessError('A data final da liberação deve estar no futuro.',400,'PRODUCT_EXCEPTION_END_INVALID');
  if(!String(input.reason||'').trim())throw accessError('Informe o motivo da liberação temporária.',400,'PRODUCT_EXCEPTION_REASON_REQUIRED');
  const [rows]=await pool.query<any[]>('SELECT id,tenant_id,status FROM product_subscriptions WHERE id=? LIMIT 1',[input.subscriptionId]);
  const row=rows[0];if(!row)throw accessError('Assinatura de produto não encontrada.',404,'PRODUCT_SUBSCRIPTION_NOT_FOUND');
  if(terminal.has(String(row.status)))throw accessError('Esta assinatura não pode receber liberação temporária no status atual.',409,'PRODUCT_EXCEPTION_STATUS_INVALID');
  await pool.query(`UPDATE product_subscriptions SET grace_until=?,status='GRACE',blocked_at=NULL,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[endsAt,input.subscriptionId]);
  await recordFinancialEvent({tenantId:row.tenant_id==null?null:Number(row.tenant_id),productSubscriptionId:input.subscriptionId,eventType:'PRODUCT_FINANCIAL_ACCESS_EXCEPTION_GRANTED',actorUserId:input.actorUserId,details:{endsAt:endsAt.toISOString(),reason:String(input.reason).trim()}});
  await syncSubscriptionOperationalState(input.subscriptionId,'FINANCIAL_EXCEPTION_GRANTED').catch(error=>console.error('[product-financial-access] grant sync',input.subscriptionId,error instanceof Error?error.message:error));
  return getProductFinancialAccess(input.subscriptionId);
}

export async function revokeProductFinancialException(input:{subscriptionId:number;actorUserId:number}){
  const [rows]=await pool.query<any[]>('SELECT id,tenant_id,grace_until FROM product_subscriptions WHERE id=? LIMIT 1',[input.subscriptionId]);
  const row=rows[0];if(!row)throw accessError('Assinatura de produto não encontrada.',404,'PRODUCT_SUBSCRIPTION_NOT_FOUND');
  await pool.query(`UPDATE product_subscriptions SET grace_until=NULL,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[input.subscriptionId]);
  await recordFinancialEvent({tenantId:row.tenant_id==null?null:Number(row.tenant_id),productSubscriptionId:input.subscriptionId,eventType:'PRODUCT_FINANCIAL_ACCESS_EXCEPTION_REVOKED',actorUserId:input.actorUserId,details:{previousGraceUntil:row.grace_until||null}});
  const access=await syncProductFinancialAccess(input.subscriptionId);
  if(!access.changed)await syncSubscriptionOperationalState(input.subscriptionId,'FINANCIAL_EXCEPTION_REVOKED').catch(error=>console.error('[product-financial-access] revoke sync',input.subscriptionId,error instanceof Error?error.message:error));
  return getProductFinancialAccess(input.subscriptionId);
}
