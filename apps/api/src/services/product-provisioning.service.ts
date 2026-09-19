import {pool} from '../db/pool.js';
import {BRASILIA_NOW_SQL} from '../utils/db-time.js';
import {createTenantInTransaction} from './tenant-provisioning.service.js';
import {provisionMovyoCustomer} from './movyo-client.service.js';
import {createProductSubscriptionMonthlyCharge} from './financial.service.js';
import {syncSubscriptionOperationalState} from './product-integration.service.js';
import {assertMovyoProvisioningCustomer,assertProductDocumentsReady,buildMovyoProvisioningPayload,firstProductDueDate,addCalendarDays} from './product-provisioning-core.js';

const fail=(message:string,status=409,code='PRODUCT_PROVISIONING_ERROR',details?:unknown)=>Object.assign(new Error(message),{status,code,details});
const text=(value:unknown)=>String(value??'').trim();
const json=(value:unknown)=>value==null?null:JSON.stringify(value);
function readJson(value:unknown,fallback:any={}){if(value&&typeof value==='object')return value;try{return value?JSON.parse(String(value)):fallback;}catch{return fallback;}}
function dateOnly(value:unknown){const match=String(value??'').match(/^(\d{4}-\d{2}-\d{2})/);return match?.[1]||null;}

async function loadContract(conn:any,contractId:number,lock=false){
  const [rows]=await conn.query(`SELECT c.*,p.proposal_number,p.status AS proposal_status,p.template_id AS proposal_template_id,p.template_version AS proposal_template_version,
    p.rendered_content AS proposal_rendered_content,p.commercial_snapshot_json,p.converted_tenant_id,p.converted_customer_id,p.converted_subscription_id,
    cp.code AS product_code,cp.name AS product_name,cp.default_provider,cp.default_payment_method,cp.default_grace_days,cp.default_auto_block,
    cpp.code AS product_plan_code,cpp.name AS product_plan_name,cpp.price_monthly AS catalog_monthly_price,
    cc.legal_name AS customer_legal_name,cc.trade_name AS customer_trade_name,cc.person_type AS customer_person_type,cc.document AS customer_document,
    cc.email AS customer_email,cc.phone AS customer_phone,cc.financial_contact_name AS customer_financial_contact_name,
    cc.financial_contact_document AS customer_financial_contact_document,cc.financial_contact_email AS customer_financial_contact_email,
    cc.financial_contact_phone AS customer_financial_contact_phone,cc.zip_code AS customer_zip_code,cc.street AS customer_street,
    cc.number AS customer_number,cc.complement AS customer_complement,cc.district AS customer_district,cc.city AS customer_city,cc.state AS customer_state
    FROM commercial_contracts c
    JOIN commercial_proposals p ON p.id=c.proposal_id
    LEFT JOIN commercial_products cp ON cp.id=c.product_id
    LEFT JOIN commercial_product_plans cpp ON cpp.id=c.product_plan_id
    LEFT JOIN commercial_customers cc ON cc.id=c.commercial_customer_id
    WHERE c.id=?${lock?' FOR UPDATE':''}`,[contractId]);
  if(!rows[0])throw fail('Contrato não encontrado.',404,'CONTRACT_NOT_FOUND');
  return rows[0];
}

function customerFromContract(c:any){return{
  id:c.commercial_customer_id,legal_name:c.customer_legal_name,trade_name:c.customer_trade_name,person_type:c.customer_person_type,document:c.customer_document,
  email:c.customer_email,phone:c.customer_phone,financial_contact_name:c.customer_financial_contact_name,financial_contact_document:c.customer_financial_contact_document,
  financial_contact_email:c.customer_financial_contact_email,financial_contact_phone:c.customer_financial_contact_phone,zip_code:c.customer_zip_code,street:c.customer_street,
  number:c.customer_number,complement:c.customer_complement,district:c.customer_district,city:c.customer_city,state:c.customer_state,
};}
function proposalSnapshot(c:any){return{id:c.proposal_id,template_id:c.proposal_template_id,template_version:c.proposal_template_version,rendered_content:c.proposal_rendered_content};}
function contractSnapshot(c:any){return{id:c.id,template_id:c.template_id,template_version:c.template_version,rendered_content:c.rendered_content,start_date:c.start_date,contract_date:c.contract_date,due_day:c.due_day};}
function assertLegacyCredentials(input:any){
  const required=['slug','adminName','adminEmail','adminPassword'] as const;const missing=required.filter(k=>!text(input?.[k]));
  if(missing.length)throw fail(`Informe ${missing.join(', ')} para ativar o Ponto Certo.`,400,'PONTO_CERTO_PROVISIONING_DATA_REQUIRED',{missing});
  if(!/^[a-z0-9-]{2,80}$/.test(text(input.slug)))throw fail('Identificador do tenant inválido.',400,'TENANT_SLUG_INVALID');
  if(text(input.adminPassword).length<8)throw fail('A senha inicial deve ter pelo menos 8 caracteres.',400,'TENANT_PASSWORD_INVALID');
}

async function provisionPontoCerto(contractId:number,actorUserId:number,input:any){
  assertLegacyCredentials(input);
  const conn=await pool.getConnection();let result:any;
  try{
    await conn.beginTransaction();const c=await loadContract(conn,contractId,true);
    if((c.product_code||'PONTO_CERTO')!=='PONTO_CERTO')throw fail('Produto incompatível com o provisionamento Ponto Certo.',409,'PRODUCT_PROVISIONER_MISMATCH');
    if(c.tenant_id){await conn.commit();return{tenantId:Number(c.tenant_id),alreadyConverted:true,productCode:'PONTO_CERTO'};}
    if(c.status!=='SIGNED')throw fail('Somente contrato assinado pode ativar o cliente SaaS.',409,'CONTRACT_NOT_SIGNED');
    result=await createTenantInTransaction(conn,{...input,tenantName:c.company_name,companyName:c.company_name,cnpj:c.cnpj,planId:c.plan_id,trialDays:0});
    await conn.query('INSERT INTO tenant_contracts(tenant_id,max_employees,price_monthly,max_branches,features_json,updated_at) VALUES(?,?,?,?,?,NOW())',[result.tenantId,c.max_employees,c.price_monthly,c.max_branches,c.features_json]);
    await conn.query('UPDATE commercial_contracts SET tenant_id=?,updated_at=NOW() WHERE id=?',[result.tenantId,contractId]);
    await conn.query("UPDATE commercial_proposals SET converted_tenant_id=?,status='CONVERTED',updated_by=?,updated_at=NOW() WHERE id=?",[result.tenantId,actorUserId,c.proposal_id]);
    await conn.commit();return{...result,productCode:'PONTO_CERTO'};
  }catch(error){await conn.rollback();throw error;}finally{conn.release();}
}

async function prepareMovyoIntent(contractId:number,actorUserId:number){
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();const c=await loadContract(conn,contractId,true);
    if(c.product_code!=='MOVYO')throw fail(`Provisionamento ainda não suportado para ${c.product_code||'produto sem código'}.`,409,'PRODUCT_PROVISIONER_UNSUPPORTED');
    if(c.status!=='SIGNED')throw fail('Somente contrato Movyo assinado pode ser provisionado.',409,'CONTRACT_NOT_SIGNED');
    if(!c.commercial_customer_id)throw fail('Vincule um Cliente Comercial à proposta Movyo antes do provisionamento.',409,'COMMERCIAL_CUSTOMER_REQUIRED');
    if(!c.product_plan_id||!c.product_plan_code)throw fail('O contrato Movyo não possui um plano de produto válido.',409,'PRODUCT_PLAN_REQUIRED');
    const customer=customerFromContract(c),proposal=proposalSnapshot(c),contract=contractSnapshot(c);
    assertMovyoProvisioningCustomer(customer);assertProductDocumentsReady({contract,proposal});
    const commercial=readJson(c.commercial_snapshot_json,{}),discountPercent=Number(commercial.discountPercent||0),graceDays=Math.max(0,Number(c.default_grace_days??3));
    const startsAt=dateOnly(c.start_date||c.contract_date);if(!startsAt)throw fail('Contrato Movyo sem início de vigência válido.',409,'PRODUCT_START_DATE_INVALID');
    const dueDate=firstProductDueDate(startsAt,c.due_day||commercial.dueDay||10),graceUntil=addCalendarDays(dueDate,graceDays);
    let subscriptionId=c.product_subscription_id==null?null:Number(c.product_subscription_id);
    if(!subscriptionId){
      const metadata={source:'commercial-contract',contractId:Number(c.id),proposalId:Number(c.proposal_id)};
      const [insert]=await conn.query(`INSERT INTO product_subscriptions(commercial_customer_id,product_id,product_plan_id,tenant_id,external_source,external_account_id,billing_source,status,monthly_price,discount_percent,starts_at,current_period_start,current_period_end,next_due_date,billing_provider,billing_method,grace_days,auto_block,first_cycle_prorata_enabled,blocked_at,grace_until,metadata_json,created_at,updated_at)
        VALUES(?,?,?,NULL,NULL,NULL,'PONTO_CERTO','PROVISIONING',?,?,?,?,?,?,NULL,NULL,?,?,1,NULL,?,?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,[
          c.commercial_customer_id,c.product_id,c.product_plan_id,Number(c.price_monthly||c.catalog_monthly_price||0),discountPercent,`${startsAt} 00:00:00`,`${startsAt} 00:00:00`,`${dueDate} 23:59:59`,dueDate,graceDays,Number(c.default_auto_block??1),`${graceUntil} 23:59:59`,json(metadata)
        ]);
      subscriptionId=Number(insert.insertId);
      await conn.query('UPDATE commercial_contracts SET product_subscription_id=?,updated_at=NOW() WHERE id=?',[subscriptionId,contractId]);
    }
    const key=`movyo-provision:contract:${contractId}:subscription:${subscriptionId}`;
    await conn.query(`INSERT INTO product_sync_logs(product_subscription_id,product_code,external_account_id,action,status,idempotency_key,request_json,created_at)
      VALUES(?,'MOVYO',NULL,'PROVISION','PENDING',?,NULL,${BRASILIA_NOW_SQL}) ON DUPLICATE KEY UPDATE product_subscription_id=VALUES(product_subscription_id)`,[subscriptionId,key]);
    const [subs]=await conn.query('SELECT * FROM product_subscriptions WHERE id=? FOR UPDATE',[subscriptionId]);const subscription=subs[0];
    await conn.commit();
    return{c,customer,proposal,contract,commercial,discountPercent,graceDays,startsAt,dueDate,graceUntil,subscriptionId,key,subscription};
  }catch(error){await conn.rollback();throw error;}finally{conn.release();}
}

async function failMovyoIntent(subscriptionId:number,key:string,error:any){
  const message=String(error?.message||error).slice(0,500);
  await pool.query(`UPDATE product_subscriptions SET status='PROVISIONING_ERROR',updated_at=${BRASILIA_NOW_SQL} WHERE id=? AND external_account_id IS NULL`,[subscriptionId]).catch(()=>undefined);
  await pool.query(`UPDATE product_sync_logs SET status='FAILED',error_message=?,response_json=NULL WHERE idempotency_key=?`,[message,key]).catch(()=>undefined);
}

async function finalizeMovyoProvisioning(prepared:any,externalAccountId:string,response:any,actorUserId:number){
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();const c=await loadContract(conn,Number(prepared.c.id),true);
    const [subs]=await conn.query('SELECT * FROM product_subscriptions WHERE id=? FOR UPDATE',[prepared.subscriptionId]);const current=subs[0];
    if(!current)throw fail('Assinatura Movyo preparada não foi encontrada.',409,'PRODUCT_SUBSCRIPTION_NOT_FOUND');
    if(current.external_account_id&&String(current.external_account_id)!==String(externalAccountId))throw fail('A assinatura já está vinculada a outro restaurante Movyo.',409,'MOVYO_EXTERNAL_ACCOUNT_CONFLICT');
    await conn.query(`UPDATE product_subscriptions SET external_source='MOVYO',external_account_id=?,billing_source='PONTO_CERTO',status='GRACE',current_period_start=?,current_period_end=?,next_due_date=?,grace_until=?,blocked_at=NULL,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[externalAccountId,`${prepared.startsAt} 00:00:00`,`${prepared.dueDate} 23:59:59`,prepared.dueDate,`${prepared.graceUntil} 23:59:59`,prepared.subscriptionId]);
    await conn.query('UPDATE commercial_contracts SET product_subscription_id=?,updated_at=NOW() WHERE id=?',[prepared.subscriptionId,c.id]);
    await conn.query("UPDATE commercial_proposals SET converted_customer_id=?,converted_subscription_id=?,status='CONVERTED',updated_by=?,updated_at=NOW() WHERE id=?",[c.commercial_customer_id,prepared.subscriptionId,actorUserId,c.proposal_id]);
    await conn.query(`INSERT INTO movyo_integration_mappings(movyo_restaurant_id,commercial_customer_id,product_subscription_id,migration_status,last_remote_snapshot_json,last_error,last_sync_at,cutover_at,created_at,updated_at)
      VALUES(?,?,?,'PONTO_CERTO',?,NULL,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})
      ON DUPLICATE KEY UPDATE commercial_customer_id=VALUES(commercial_customer_id),product_subscription_id=VALUES(product_subscription_id),migration_status='PONTO_CERTO',last_remote_snapshot_json=VALUES(last_remote_snapshot_json),last_error=NULL,last_sync_at=${BRASILIA_NOW_SQL},cutover_at=COALESCE(cutover_at,${BRASILIA_NOW_SQL}),updated_at=${BRASILIA_NOW_SQL}`,[externalAccountId,c.commercial_customer_id,prepared.subscriptionId,json(response)]);
    await conn.query(`UPDATE product_sync_logs SET external_account_id=?,status='SUCCESS',response_json=?,error_message=NULL WHERE idempotency_key=?`,[externalAccountId,json(response),prepared.key]);
    await conn.commit();
  }catch(error){await conn.rollback();throw error;}finally{conn.release();}
}

async function provisionMovyo(contractId:number,actorUserId:number){
  const prepared=await prepareMovyoIntent(contractId,actorUserId);
  let externalAccountId=prepared.subscription?.external_account_id?String(prepared.subscription.external_account_id):'';
  let remoteResponse:any=null;
  if(!externalAccountId){
    const payload=buildMovyoProvisioningPayload({customer:prepared.customer,contract:prepared.contract,proposal:prepared.proposal,productPlanCode:prepared.c.product_plan_code,monthlyPrice:Number(prepared.c.price_monthly||prepared.c.catalog_monthly_price||0),discountPercent:prepared.discountPercent,commercialCustomerId:prepared.c.commercial_customer_id,productSubscriptionId:prepared.subscriptionId,graceDays:prepared.graceDays});
    await pool.query('UPDATE product_sync_logs SET request_json=? WHERE idempotency_key=?',[json(payload),prepared.key]);
    try{
      remoteResponse=await provisionMovyoCustomer(payload,prepared.key);externalAccountId=String(remoteResponse?.customer?.id||remoteResponse?.id||'');
      if(!externalAccountId)throw fail('A Movyo não retornou o identificador do restaurante provisionado.',502,'MOVYO_PROVISION_RESPONSE_INVALID',remoteResponse);
    }catch(error){await failMovyoIntent(prepared.subscriptionId,prepared.key,error);throw error;}
  }else remoteResponse={customer:{id:externalAccountId},reused:true};
  await finalizeMovyoProvisioning(prepared,externalAccountId,remoteResponse,actorUserId);
  let charge:any=null,billingWarning:string|null=null;
  try{
    charge=await createProductSubscriptionMonthlyCharge(prepared.subscriptionId,prepared.dueDate.slice(0,7),actorUserId,{issue:true,sendEmailAfterIssue:true});
  }catch(error:any){billingWarning=String(error?.message||error);await syncSubscriptionOperationalState(prepared.subscriptionId,'PROVISIONED_WITHOUT_CHARGE').catch(()=>undefined);}
  return{productCode:'MOVYO',commercialCustomerId:Number(prepared.c.commercial_customer_id),productSubscriptionId:prepared.subscriptionId,externalAccountId,alreadyConverted:Boolean(prepared.subscription?.external_account_id),charge,billingWarning};
}

export async function provisionSignedContract(contractId:number,actorUserId:number,input:any={}){
  const [rows]=await pool.query<any[]>(`SELECT COALESCE(cp.code,'PONTO_CERTO') AS product_code FROM commercial_contracts c LEFT JOIN commercial_products cp ON cp.id=c.product_id WHERE c.id=? LIMIT 1`,[contractId]);
  if(!rows[0])throw fail('Contrato não encontrado.',404,'CONTRACT_NOT_FOUND');
  const productCode=String(rows[0].product_code||'PONTO_CERTO').toUpperCase();
  if(productCode==='PONTO_CERTO')return provisionPontoCerto(contractId,actorUserId,input);
  if(productCode==='MOVYO')return provisionMovyo(contractId,actorUserId);
  throw fail(`O produto ${productCode} ainda não possui provisionamento ativo.`,409,'PRODUCT_PROVISIONER_UNSUPPORTED');
}
