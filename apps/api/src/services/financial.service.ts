import { createHash, randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import {
  calculateBlockAt,
  dueDateForCompetence,
  normalizedMoney,
  todayInBrasilia,
  validateDueDay,
  type ChargeStatus,
  type ChargeType,
} from "./financial-rules.js";
import { isFirstPaymentTransition, monthlyDescription, providerYourNumber } from "./financial-service-core.js";
import { assertProviderIssueAmount, assertProviderMethod, isPaymentMethodCode, isPaymentProviderCode, providerStatusToChargeStatus, validateProviderSnapshot, PROVIDER_LABELS } from "./payment-provider-core.js";
import { getDefaultPaymentSelection, getProviderIssuePaymentTerms } from "./payment-provider-settings.service.js";
import { getPaymentProvider } from "./provider-registry.js";
import type { PaymentMethodCode, PaymentProviderCode, ProviderChargeSnapshot } from "./payment-provider.types.js";
import { ProviderHttpError } from "./provider-http.js";
import { billingProfileCompleteness, missingPayerFieldsForMethod, normalizeFinancialPayer, payerFromBillingProfile, payerFromCommercialCustomer, providerPayerFromSnapshot, type FinancialPayerInput, type FinancialPayerSnapshot } from "./financial-payer-core.js";
import { advanceProductSubscriptionPeriod, getProductSubscription } from "./product-subscription.service.js";
import { calculateFirstCycleProrata,canGenerateAutomaticCharge,effectiveSubscriptionPrice,resolveProductPaymentSelection } from "./product-subscription-core.js";
import { syncSubscriptionOperationalState } from "./product-integration.service.js";
import {calculateChargeAdjustment,type ChargeDiscountType} from "./financial-reissue-core.js";
import {isValidBrazilDocument} from "../utils/brazil-document.js";
import {notifyFinancialPaymentConfirmed} from "./financial-push.service.js";

const financeError=(message:string,status=400,code="FINANCE_ERROR")=>Object.assign(new Error(message),{status,code});
const json=(value:unknown)=>value==null?null:JSON.stringify(value);

export async function recordFinancialEvent(input:{tenantId:number|null;chargeId?:number|null;productSubscriptionId?:number|null;eventType:string;actorUserId?:number|null;details?:unknown},db:any=pool){
  await db.query(`INSERT INTO financial_events(tenant_id,charge_id,product_subscription_id,event_type,actor_user_id,details_json,created_at) VALUES(?,?,?,?,?,?,${BRASILIA_NOW_SQL})`,[input.tenantId,input.chargeId||null,input.productSubscriptionId||null,input.eventType,input.actorUserId||null,json(input.details)]);
}

export async function ensureBillingProfile(tenantId:number,db:any=pool){
  await db.query(`INSERT IGNORE INTO saas_billing_profiles(tenant_id,due_day,grace_days,auto_block_enabled,auto_monthly_enabled,provider_expiration_days,auto_email_charges,created_at,updated_at) VALUES(?,10,3,1,1,30,1,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,[tenantId]);
  return getBillingProfile(tenantId,db);
}

export async function getBillingProfile(tenantId:number,db:any=pool){
  const [rows]=await db.query(`SELECT bp.*,t.name AS tenant_name,t.status AS tenant_status,COALESCE(tc.price_monthly,p.price_monthly) AS price_monthly,s.status AS subscription_status FROM tenants t LEFT JOIN saas_billing_profiles bp ON bp.tenant_id=t.id LEFT JOIN subscriptions s ON s.id=(SELECT MAX(s2.id) FROM subscriptions s2 WHERE s2.tenant_id=t.id) LEFT JOIN plans p ON p.id=s.plan_id LEFT JOIN tenant_contracts tc ON tc.tenant_id=t.id WHERE t.id=? LIMIT 1`,[tenantId]);
  const row=rows[0];if(!row)throw financeError("Cliente não encontrado.",404,"TENANT_NOT_FOUND");
  if(!row.tenant_id){await db.query(`INSERT IGNORE INTO saas_billing_profiles(tenant_id,due_day,grace_days,auto_block_enabled,auto_monthly_enabled,provider_expiration_days,auto_email_charges,created_at,updated_at) VALUES(?,10,3,1,1,30,1,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,[tenantId]);return getBillingProfile(tenantId,db);}
  const profile={tenantId:Number(row.tenant_id),tenantName:row.tenant_name,tenantStatus:row.tenant_status,dueDay:Number(row.due_day),graceDays:Number(row.grace_days),autoBlockEnabled:Boolean(row.auto_block_enabled),autoMonthlyEnabled:Boolean(row.auto_monthly_enabled),priceMonthly:row.price_monthly==null?null:Number(row.price_monthly),subscriptionStatus:row.subscription_status||null,billingLegalName:row.billing_legal_name||null,billingTradeName:row.billing_trade_name||null,billingDocument:row.billing_document||null,billingEmail:row.billing_email||null,billingPhone:row.billing_phone||null,financialContactName:row.financial_contact_name||null,financialContactDocument:row.financial_contact_document||null,financialContactEmail:row.financial_contact_email||null,financialContactPhone:row.financial_contact_phone||null,billingZipCode:row.billing_zip_code||null,billingStreet:row.billing_street||null,billingNumber:row.billing_number||null,billingComplement:row.billing_complement||null,billingDistrict:row.billing_district||null,billingCity:row.billing_city||null,billingState:row.billing_state||null,autoEmailCharges:Boolean(row.auto_email_charges)};
  return{...profile,completeness:billingProfileCompleteness(profile)};
}

export type BillingProfileUpdate={dueDay:number;autoBlockEnabled:boolean;autoMonthlyEnabled:boolean;billingLegalName?:string|null;billingTradeName?:string|null;billingDocument?:string|null;billingEmail?:string|null;billingPhone?:string|null;financialContactName?:string|null;financialContactDocument?:string|null;financialContactEmail?:string|null;financialContactPhone?:string|null;billingZipCode?:string|null;billingStreet?:string|null;billingNumber?:string|null;billingComplement?:string|null;billingDistrict?:string|null;billingCity?:string|null;billingState?:string|null;autoEmailCharges?:boolean};
export async function updateBillingProfile(tenantId:number,input:BillingProfileUpdate,actorUserId:number){
  const dueDay=validateDueDay(input.dueDay);await ensureBillingProfile(tenantId);const digits=(value:unknown)=>String(value??"").replace(/\D/g,"");const txt=(value:unknown)=>{const v=String(value??"").trim();return v||null;};const doc=digits(input.billingDocument);if(doc&&!isValidBrazilDocument(doc))throw financeError("CPF/CNPJ de faturamento inválido.");const contactDoc=digits(input.financialContactDocument);if(contactDoc&&!isValidBrazilDocument(contactDoc,"PF"))throw financeError("CPF do responsável financeiro inválido.");const state=txt(input.billingState)?.toUpperCase()||null;if(state&&state.length!==2)throw financeError("UF de faturamento inválida.");
  await pool.query(`UPDATE saas_billing_profiles SET due_day=?,grace_days=3,auto_block_enabled=?,auto_monthly_enabled=?,billing_legal_name=?,billing_trade_name=?,billing_document=?,billing_email=?,billing_phone=?,financial_contact_name=?,financial_contact_document=?,financial_contact_email=?,financial_contact_phone=?,billing_zip_code=?,billing_street=?,billing_number=?,billing_complement=?,billing_district=?,billing_city=?,billing_state=?,auto_email_charges=?,updated_at=${BRASILIA_NOW_SQL} WHERE tenant_id=?`,[dueDay,input.autoBlockEnabled?1:0,input.autoMonthlyEnabled?1:0,txt(input.billingLegalName),txt(input.billingTradeName),doc||null,txt(input.billingEmail)?.toLowerCase()||null,digits(input.billingPhone)||null,txt(input.financialContactName),contactDoc||null,txt(input.financialContactEmail)?.toLowerCase()||null,digits(input.financialContactPhone)||null,digits(input.billingZipCode)||null,txt(input.billingStreet),txt(input.billingNumber),txt(input.billingComplement),txt(input.billingDistrict),txt(input.billingCity),state,input.autoEmailCharges===false?0:1,tenantId]);
  await recordFinancialEvent({tenantId,eventType:"BILLING_PROFILE_UPDATED",actorUserId,details:{dueDay,graceDays:3,autoBlockEnabled:input.autoBlockEnabled,autoMonthlyEnabled:input.autoMonthlyEnabled,autoEmailCharges:input.autoEmailCharges!==false}});return getBillingProfile(tenantId);
}

async function tenantMonthlyAmount(tenantId:number,db:any=pool){
  const [rows]=await db.query(`SELECT COALESCE(tc.price_monthly,p.price_monthly) AS amount,s.status AS subscription_status,t.status AS tenant_status FROM tenants t LEFT JOIN subscriptions s ON s.id=(SELECT MAX(s2.id) FROM subscriptions s2 WHERE s2.tenant_id=t.id) LEFT JOIN plans p ON p.id=s.plan_id LEFT JOIN tenant_contracts tc ON tc.tenant_id=t.id WHERE t.id=? LIMIT 1`,[tenantId]);
  const row=rows[0];if(!row)throw financeError("Cliente não encontrado.",404,"TENANT_NOT_FOUND");if(row.tenant_status==="CANCELED")throw financeError("Cliente cancelado não pode receber nova cobrança.",409,"TENANT_CANCELED");const amount=Number(row.amount||0);if(!(amount>0))throw financeError("O cliente não possui mensalidade contratada válida.",409,"MONTHLY_PRICE_MISSING");return normalizedMoney(amount);
}

export async function getImplementationSuggestion(tenantId:number){const [rows]=await pool.query<any[]>(`SELECT implementation_fee,contract_number,status FROM commercial_contracts WHERE tenant_id=? ORDER BY id DESC LIMIT 1`,[tenantId]);return rows[0]?{amount:Number(rows[0].implementation_fee||0),contractNumber:rows[0].contract_number,contractStatus:rows[0].status}:{amount:0,contractNumber:null,contractStatus:null};}

async function resolveSelection(override?:{provider?:PaymentProviderCode;method?:PaymentMethodCode}){
  if(override?.provider||override?.method){if(!override.provider||!override.method)throw financeError("Informe provedor e método juntos.",400,"PAYMENT_SELECTION_INCOMPLETE");if(!isPaymentProviderCode(override.provider)||!isPaymentMethodCode(override.method))throw financeError("Provedor ou método inválido.");assertProviderMethod(override.provider,override.method);const status=getPaymentProvider(override.provider).connectionStatus();if(!status.enabledByEnvironment||!status.configured)throw financeError("O provedor selecionado ainda não está pronto para emissão.",409,"PROVIDER_UNAVAILABLE");return{provider:override.provider,method:override.method};}
  return getDefaultPaymentSelection();
}

async function insertCharge(db:any,input:{tenantId:number|null;commercialCustomerId?:number|null;productSubscriptionId?:number|null;productCode?:string|null;type:ChargeType;competence?:string|null;revision?:number;description:string;amount:number;dueDate:string;blockAt:string;actorUserId?:number|null;provider:PaymentProviderCode;paymentMethod:PaymentMethodCode;payer:FinancialPayerSnapshot;sendEmailAfterIssue:boolean}){
  const ownedByProduct=Boolean(input.productSubscriptionId);
  if(input.tenantId==null&&!ownedByProduct&&(input.type!=="AD_HOC"||input.payer.source!=="EXTERNAL"))throw financeError("Cobrança sem tenant exige uma assinatura de produto ou pagador externo avulso.",400,"CHARGE_OWNER_REQUIRED");
  if(input.payer.source==="EXTERNAL"&&(input.tenantId!=null||ownedByProduct))throw financeError("Pagador externo avulso não deve estar vinculado a tenant/assinatura.",400,"EXTERNAL_PAYER_WITH_OWNER");
  if(input.payer.source==="COMMERCIAL"&&!ownedByProduct)throw financeError("Pagador comercial exige assinatura de produto.",400,"COMMERCIAL_PAYER_SUBSCRIPTION_REQUIRED");
  const idempotencyKey=randomUUID();const p=input.payer;
  const [result]=await db.query(`INSERT INTO financial_charges(tenant_id,commercial_customer_id,product_subscription_id,product_code,payer_source,payer_person_type,payer_name,payer_document,payer_email,payer_phone,payer_zip_code,payer_street,payer_number,payer_complement,payer_district,payer_city,payer_state,send_email_after_issue,type,competence,revision,description,amount,due_date,block_at,status,provider,requested_payment_method,idempotency_key,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT',?,?,?,?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,[input.tenantId,input.commercialCustomerId||null,input.productSubscriptionId||null,input.productCode||null,p.source,p.personType,p.name,p.document,p.email,p.phone,p.zipCode,p.street,p.number,p.complement,p.district,p.city,p.state,input.sendEmailAfterIssue?1:0,input.type,input.competence||null,input.revision??1,input.description,normalizedMoney(input.amount),input.dueDate,input.blockAt,input.provider,input.paymentMethod,idempotencyKey,input.actorUserId||null]);
  const id=Number(result.insertId);const ref=providerYourNumber(id);await db.query(`UPDATE financial_charges SET provider_your_number=? WHERE id=?`,[ref,id]);return id;
}

export async function createMonthlyCharge(tenantId:number,competence:string,actorUserId?:number|null,options:{issue?:boolean;sendEmailAfterIssue?:boolean}={}){
  if(!/^\d{4}-\d{2}$/.test(competence))throw financeError("Competência deve estar no formato AAAA-MM.");
  const profile=await ensureBillingProfile(tenantId),amount=await tenantMonthlyAmount(tenantId),dueDate=dueDateForCompetence(competence,profile.dueDay),blockAt=calculateBlockAt(dueDate,profile.graceDays),payer=payerFromBillingProfile(profile);
  const [existingRows]=await pool.query<any[]>("SELECT id,status,revision FROM financial_charges WHERE tenant_id=? AND type='MONTHLY' AND competence=? ORDER BY revision DESC,id DESC LIMIT 1",[tenantId,competence]);
  const existing=existingRows[0];let id:number;let alreadyExists=false;
  if(existing&&String(existing.status)!=="CANCELED"){id=Number(existing.id);alreadyExists=true;}
  else{
    const selection=await resolveSelection();if(options.issue)assertProviderIssueAmount(selection.provider,selection.method,amount);const revision=existing?Number(existing.revision||1)+1:1;
    try{id=await insertCharge(pool,{tenantId,type:"MONTHLY",competence,revision,description:monthlyDescription(competence),amount,dueDate,blockAt,actorUserId,provider:selection.provider,paymentMethod:selection.method,payer,sendEmailAfterIssue:options.sendEmailAfterIssue??profile.autoEmailCharges});await recordFinancialEvent({tenantId,chargeId:id,eventType:"CHARGE_CREATED",actorUserId,details:{type:"MONTHLY",competence,revision,amount,dueDate,provider:selection.provider,paymentMethod:selection.method,payerSource:payer.source}});}
    catch(error:any){if(error?.code!=="ER_DUP_ENTRY")throw error;const [rows]=await pool.query<any[]>("SELECT id FROM financial_charges WHERE tenant_id=? AND type='MONTHLY' AND competence=? ORDER BY revision DESC,id DESC LIMIT 1",[tenantId,competence]);if(!rows[0])throw error;id=Number(rows[0].id);alreadyExists=true;}
  }
  let emailDelivery:any=null;if(options.issue){const current:any=await getCharge(id);if(["DRAFT","FAILED","ISSUING"].includes(String(current.status))){const issued:any=await issueCharge(id,actorUserId||null);emailDelivery=issued?.emailDelivery||null;}}
  return{...(await getCharge(id)),alreadyExists,emailDelivery};
}

export async function createProductSubscriptionMonthlyCharge(subscriptionId:number,competence:string,actorUserId?:number|null,options:{issue?:boolean;sendEmailAfterIssue?:boolean}={}){
  if(!/^\d{4}-\d{2}$/.test(competence))throw financeError("Competência deve estar no formato AAAA-MM.");
  const subscription:any=await getProductSubscription(subscriptionId);
  const billingLike={status:subscription.status,monthlyPrice:Number(subscription.monthly_price),discountPercent:Number(subscription.discount_percent),nextDueDate:subscription.next_due_date,startsAt:subscription.starts_at,currentPeriodStart:subscription.current_period_start,firstCycleProrataEnabled:Number(subscription.first_cycle_prorata_enabled||0)};
  if(!canGenerateAutomaticCharge(billingLike))throw financeError(subscription.status==="PENDING_DATA"?"Cadastro financeiro pendente. Regularize o cliente antes de emitir a mensalidade.":"Assinatura não está apta à cobrança automática.",409,"SUBSCRIPTION_NOT_BILLABLE");
  const prorata=calculateFirstCycleProrata(billingLike),amount=prorata.amount,dueDate=String(subscription.next_due_date).slice(0,10),graceDays=Number(subscription.grace_days??subscription.default_grace_days??3);
  const configuredProvider=subscription.billing_provider||subscription.default_provider,configuredMethod=subscription.billing_method||subscription.default_payment_method;
  const globalSelection=configuredProvider&&configuredMethod?{}:await getDefaultPaymentSelection();
  const selected=resolveProductPaymentSelection({billingProvider:subscription.billing_provider,billingMethod:subscription.billing_method},{defaultProvider:subscription.default_provider,defaultMethod:subscription.default_payment_method},globalSelection);
  if(!isPaymentProviderCode(selected.provider)||!isPaymentMethodCode(selected.method))throw financeError("Provedor ou método inválido na assinatura.",409,"SUBSCRIPTION_PAYMENT_SELECTION_INVALID");
  const providerStatus=getPaymentProvider(selected.provider).connectionStatus();if(!providerStatus.enabledByEnvironment||!providerStatus.configured)throw financeError("O provedor configurado para esta assinatura não está pronto para emissão.",409,"PROVIDER_UNAVAILABLE");
  assertProviderMethod(selected.provider,selected.method);
  if(options.issue)assertProviderIssueAmount(selected.provider,selected.method,amount);
  const payer=payerFromCommercialCustomer(subscription);
  const description=prorata.isProrata?`Mensalidade ${subscription.product_name} - ${competence} (pró-rata ${prorata.prorataDays}/${prorata.cycleDays} dias)`:`Mensalidade ${subscription.product_name} - ${competence}`;
  const [existingRows]=await pool.query<any[]>("SELECT id,status,revision FROM financial_charges WHERE product_subscription_id=? AND type='MONTHLY' AND competence=? ORDER BY revision DESC,id DESC LIMIT 1",[subscriptionId,competence]);
  const existing=existingRows[0];let id:number;let alreadyExists=false;
  if(existing&&String(existing.status)!=="CANCELED"){id=Number(existing.id);alreadyExists=true;}
  else{
    const revision=existing?Number(existing.revision||1)+1:1;
    try{
      id=await insertCharge(pool,{tenantId:subscription.tenant_id==null?null:Number(subscription.tenant_id),commercialCustomerId:Number(subscription.commercial_customer_id),productSubscriptionId:subscriptionId,productCode:String(subscription.product_code),type:"MONTHLY",competence,revision,description,amount,dueDate,blockAt:calculateBlockAt(dueDate,graceDays),actorUserId,provider:selected.provider,paymentMethod:selected.method,payer,sendEmailAfterIssue:options.sendEmailAfterIssue??true});
      await pool.query(`UPDATE financial_charges SET base_amount=?,is_prorata=?,prorata_days=?,prorata_cycle_days=?,billing_period_start=?,billing_period_end=?,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[prorata.fullAmount,prorata.isProrata?1:0,prorata.prorataDays,prorata.cycleDays,prorata.periodStart,prorata.periodEnd,id]);
      await recordFinancialEvent({tenantId:subscription.tenant_id==null?null:Number(subscription.tenant_id),chargeId:id,eventType:"PRODUCT_CHARGE_CREATED",productSubscriptionId:subscriptionId,actorUserId,details:{subscriptionId,productCode:subscription.product_code,competence,revision,amount,dueDate,provider:selected.provider,paymentMethod:selected.method,prorata:{enabled:prorata.enabled,applied:prorata.isProrata,days:prorata.prorataDays,cycleDays:prorata.cycleDays,baseAmount:prorata.fullAmount,periodStart:prorata.periodStart,periodEnd:prorata.periodEnd}}});
    }catch(error:any){if(error?.code!=="ER_DUP_ENTRY")throw error;const [rows]=await pool.query<any[]>("SELECT id FROM financial_charges WHERE product_subscription_id=? AND type='MONTHLY' AND competence=? ORDER BY revision DESC,id DESC LIMIT 1",[subscriptionId,competence]);if(!rows[0])throw error;id=Number(rows[0].id);alreadyExists=true;}
  }
  let emailDelivery:any=null;if(options.issue){const current:any=await getCharge(id);if(["DRAFT","FAILED","ISSUING"].includes(String(current.status))){const issued:any=await issueCharge(id,actorUserId||null);emailDelivery=issued?.emailDelivery||null;}}
  const result={...(await getCharge(id)),alreadyExists,emailDelivery};
  if(options.issue&&String(subscription.product_code).toUpperCase()==="MOVYO")await syncSubscriptionOperationalState(subscriptionId,"CHARGE_ISSUED").catch(error=>console.error("[movyo-sync] charge",subscriptionId,error instanceof Error?error.message:error));
  return result;
}

export async function createImplementationCharge(input:{tenantId:number;amount:number;dueDate:string;description?:string;actorUserId?:number|null;issue?:boolean;sendEmailAfterIssue?:boolean}){
  const profile=await ensureBillingProfile(input.tenantId),amount=normalizedMoney(input.amount),payer=payerFromBillingProfile(profile);if(!(amount>0))throw financeError("Informe um valor de implantação maior que zero.");const selection=await resolveSelection();if(input.issue)assertProviderIssueAmount(selection.provider,selection.method,amount);const id=await insertCharge(pool,{tenantId:input.tenantId,type:"IMPLEMENTATION",description:input.description?.trim()||"Implantação Ponto Certo",amount,dueDate:input.dueDate,blockAt:calculateBlockAt(input.dueDate,profile.graceDays),actorUserId:input.actorUserId,provider:selection.provider,paymentMethod:selection.method,payer,sendEmailAfterIssue:input.sendEmailAfterIssue??profile.autoEmailCharges});await recordFinancialEvent({tenantId:input.tenantId,chargeId:id,eventType:"CHARGE_CREATED",actorUserId:input.actorUserId,details:{type:"IMPLEMENTATION",amount,dueDate:input.dueDate,provider:selection.provider,paymentMethod:selection.method,payerSource:payer.source}});let emailDelivery:any=null;if(input.issue){const issued:any=await issueCharge(id,input.actorUserId||null);emailDelivery=issued?.emailDelivery||null;}return{...(await getCharge(id)),emailDelivery};
}

export async function createAdHocCharge(input:{tenantId?:number|null;payerSource:"TENANT"|"EXTERNAL";payer?:Omit<FinancialPayerInput,"source">;amount:number;dueDate:string;description:string;provider?:PaymentProviderCode;paymentMethod?:PaymentMethodCode;actorUserId?:number|null;issue?:boolean;sendEmailAfterIssue?:boolean}){
  const amount=normalizedMoney(input.amount);if(!(amount>0))throw financeError("Informe um valor maior que zero.");if(!input.description?.trim())throw financeError("Informe a descrição da cobrança avulsa.");const selection=await resolveSelection(input.provider||input.paymentMethod?{provider:input.provider,method:input.paymentMethod}:undefined);if(input.issue)assertProviderIssueAmount(selection.provider,selection.method,amount);let tenantId:number|null=null;let payer:FinancialPayerSnapshot;let graceDays=3;let sendEmailAfterIssue=input.sendEmailAfterIssue??true;
  if(input.payerSource==="TENANT"){if(!input.tenantId)throw financeError("Selecione o Cliente SaaS.",400,"TENANT_REQUIRED");tenantId=input.tenantId;const profile=await ensureBillingProfile(tenantId);payer=payerFromBillingProfile(profile);graceDays=profile.graceDays;sendEmailAfterIssue=input.sendEmailAfterIssue??profile.autoEmailCharges;}else{if(input.tenantId)throw financeError("Pagador avulso não deve estar vinculado a Cliente SaaS.",400,"EXTERNAL_PAYER_WITH_TENANT");if(!input.payer)throw financeError("Informe os dados do pagador avulso.",400,"PAYER_REQUIRED");payer=normalizeFinancialPayer({...input.payer,source:"EXTERNAL"});}
  const id=await insertCharge(pool,{tenantId,type:"AD_HOC",description:input.description.trim(),amount,dueDate:input.dueDate,blockAt:calculateBlockAt(input.dueDate,graceDays),actorUserId:input.actorUserId,provider:selection.provider,paymentMethod:selection.method,payer,sendEmailAfterIssue});await recordFinancialEvent({tenantId,chargeId:id,eventType:"CHARGE_CREATED",actorUserId:input.actorUserId,details:{type:"AD_HOC",amount,dueDate:input.dueDate,provider:selection.provider,paymentMethod:selection.method,payerSource:payer.source}});let emailDelivery:any=null;if(input.issue){const issued:any=await issueCharge(id,input.actorUserId||null);emailDelivery=issued?.emailDelivery||null;}return{...(await getCharge(id)),emailDelivery};
}

export async function getCharge(id:number,db:any=pool){const [rows]=await db.query(`SELECT c.*,t.name AS tenant_name,cc.legal_name AS commercial_customer_name,cp.name AS product_name,cpp.name AS product_plan_name,bp.due_day,COALESCE(bp.grace_days,ps.grace_days,3) AS grace_days,bp.auto_block_enabled,bp.auto_monthly_enabled FROM financial_charges c LEFT JOIN tenants t ON t.id=c.tenant_id LEFT JOIN saas_billing_profiles bp ON bp.tenant_id=c.tenant_id LEFT JOIN commercial_customers cc ON cc.id=c.commercial_customer_id LEFT JOIN product_subscriptions ps ON ps.id=c.product_subscription_id LEFT JOIN commercial_products cp ON cp.id=ps.product_id LEFT JOIN commercial_product_plans cpp ON cpp.id=ps.product_plan_id WHERE c.id=? LIMIT 1`,[id]);if(!rows[0])throw financeError("Cobrança não encontrada.",404,"CHARGE_NOT_FOUND");const row=rows[0];return{...row,id:Number(row.id),tenant_id:row.tenant_id==null?null:Number(row.tenant_id),commercial_customer_id:row.commercial_customer_id==null?null:Number(row.commercial_customer_id),product_subscription_id:row.product_subscription_id==null?null:Number(row.product_subscription_id),revision:Number(row.revision||1),amount:Number(row.amount),base_amount:row.base_amount==null?Number(row.amount):Number(row.base_amount),discount_base_amount:row.discount_base_amount==null?null:Number(row.discount_base_amount),discount_value:row.discount_value==null?null:Number(row.discount_value),discount_amount:Number(row.discount_amount||0),reissued_from_charge_id:row.reissued_from_charge_id==null?null:Number(row.reissued_from_charge_id),replaced_by_charge_id:row.replaced_by_charge_id==null?null:Number(row.replaced_by_charge_id),is_prorata:Boolean(Number(row.is_prorata||0)),prorata_days:row.prorata_days==null?null:Number(row.prorata_days),prorata_cycle_days:row.prorata_cycle_days==null?null:Number(row.prorata_cycle_days),due_day:row.due_day==null?null:Number(row.due_day),grace_days:row.grace_days==null?3:Number(row.grace_days),auto_block_enabled:Boolean(row.auto_block_enabled),auto_monthly_enabled:Boolean(row.auto_monthly_enabled),send_email_after_issue:Boolean(row.send_email_after_issue)};}

async function applyProviderDetails(chargeId:number,details:ProviderChargeSnapshot,actorUserId?:number|null){
  let syncSubscriptionId:number|null=null;
  let paymentNotification:{chargeId:number;amount:number;paymentMethod:string;providerPaymentId:string|null}|null=null;
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [rows]=await conn.query<any[]>("SELECT * FROM financial_charges WHERE id=? FOR UPDATE",[chargeId]);
    const charge=rows[0];
    if(!charge)throw financeError("Cobrança não encontrada.",404,"CHARGE_NOT_FOUND");
    const externalReference=String(charge.provider_your_number||providerYourNumber(chargeId));
    const decision=validateProviderSnapshot({localAmount:Number(charge.amount),externalReference,snapshot:details});
    const common=[details.providerChargeId||null,details.paymentUrl||null,details.pdfUrl||null,details.barcode||null,details.digitableLine||null,details.pixCopyPaste||null,details.pixQrCode||null,json(details.raw)];

    if(decision.action==="HOLD"){
      await conn.query(`UPDATE financial_charges SET provider_charge_id=COALESCE(provider_charge_id,?),provider_payment_url=COALESCE(?,provider_payment_url),provider_pdf_url=COALESCE(?,provider_pdf_url),barcode=COALESCE(?,barcode),digitable_line=COALESCE(?,digitable_line),pix_copy_paste=COALESCE(?,pix_copy_paste),pix_qr_code=COALESCE(?,pix_qr_code),provider_payload_json=?,failure_message=?,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[...common,decision.reason,chargeId]);
      await recordFinancialEvent({tenantId:charge.tenant_id==null?null:Number(charge.tenant_id),chargeId,productSubscriptionId:charge.product_subscription_id==null?null:Number(charge.product_subscription_id),eventType:"RECONCILIATION_HELD",actorUserId,details:{provider:charge.provider,reason:decision.reason}},conn);
      await conn.commit();
      return{charge:await getCharge(chargeId),reconciled:false,reason:decision.reason};
    }

    if(decision.action==="PAY"){
      const paidAt=details.paidAt?new Date(details.paidAt):new Date(),paidDate=Number.isNaN(paidAt.getTime())?new Date():paidAt;
      const paymentId=details.providerPaymentId||details.providerChargeId||`${charge.provider}:${chargeId}`;
      const method=details.confirmedPaymentMethod||"OTHER";
      const origin=method==="PIX"?"PIX":method==="BOLETO"?"BOLETO":"OTHER";
      const firstPaymentTransition=isFirstPaymentTransition(charge.status);
      if(firstPaymentTransition){
        await conn.query(`INSERT IGNORE INTO financial_payments(charge_id,tenant_id,commercial_customer_id,product_subscription_id,provider,requested_payment_method,payment_method,provider_payment_id,amount,provider_fee,net_amount,paid_at,origin,payload_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,${BRASILIA_NOW_SQL})`,[chargeId,charge.tenant_id,charge.commercial_customer_id||null,charge.product_subscription_id||null,charge.provider,charge.requested_payment_method,method,paymentId,Number(details.receivedAmount??charge.amount),details.providerFee??null,details.netAmount??null,paidDate,origin,json(details.raw)]);
        await conn.query(`UPDATE financial_charges SET status='PAID',provider_charge_id=COALESCE(?,provider_charge_id),provider_payment_url=COALESCE(?,provider_payment_url),provider_pdf_url=COALESCE(?,provider_pdf_url),barcode=COALESCE(?,barcode),digitable_line=COALESCE(?,digitable_line),pix_copy_paste=COALESCE(?,pix_copy_paste),pix_qr_code=COALESCE(?,pix_qr_code),provider_payload_json=?,failure_message=NULL,paid_at=?,issued_at=COALESCE(issued_at,${BRASILIA_NOW_SQL}),updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[...common,paidDate,chargeId]);
        if(charge.product_subscription_id&&String(charge.type)==="MONTHLY"){
          syncSubscriptionId=Number(charge.product_subscription_id);
          await advanceProductSubscriptionPeriod(conn,syncSubscriptionId,String(charge.due_date));
        }
        await recordFinancialEvent({tenantId:charge.tenant_id==null?null:Number(charge.tenant_id),chargeId,productSubscriptionId:charge.product_subscription_id==null?null:Number(charge.product_subscription_id),eventType:"PAYMENT_CONFIRMED",actorUserId,details:{provider:charge.provider,paymentMethod:method,amount:details.receivedAmount??charge.amount,providerPaymentId:paymentId,providerFee:details.providerFee??null,netAmount:details.netAmount??null}},conn);
        paymentNotification={chargeId,amount:Number(details.receivedAmount??charge.amount),paymentMethod:method,providerPaymentId:String(paymentId||"")||null};
      }else{
        await conn.query(`UPDATE financial_charges SET provider_charge_id=COALESCE(?,provider_charge_id),provider_payment_url=COALESCE(?,provider_payment_url),provider_pdf_url=COALESCE(?,provider_pdf_url),barcode=COALESCE(?,barcode),digitable_line=COALESCE(?,digitable_line),pix_copy_paste=COALESCE(?,pix_copy_paste),pix_qr_code=COALESCE(?,pix_qr_code),provider_payload_json=?,failure_message=NULL,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[...common,chargeId]);
      }
    }else{
      let next:ChargeStatus=providerStatusToChargeStatus(details.status);
      if(String(charge.status)==="PAID")next="PAID";
      else if(next==="OPEN"&&String(charge.due_date)<todayInBrasilia())next="OVERDUE";
      await conn.query(`UPDATE financial_charges SET status=?,provider_charge_id=COALESCE(?,provider_charge_id),provider_payment_url=COALESCE(?,provider_payment_url),provider_pdf_url=COALESCE(?,provider_pdf_url),barcode=COALESCE(?,barcode),digitable_line=COALESCE(?,digitable_line),pix_copy_paste=COALESCE(?,pix_copy_paste),pix_qr_code=COALESCE(?,pix_qr_code),provider_payload_json=?,failure_message=NULL,issued_at=COALESCE(issued_at,${BRASILIA_NOW_SQL}),canceled_at=IF(?='CANCELED',COALESCE(canceled_at,${BRASILIA_NOW_SQL}),canceled_at),updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[next,...common,next,chargeId]);
      await recordFinancialEvent({tenantId:charge.tenant_id==null?null:Number(charge.tenant_id),chargeId,productSubscriptionId:charge.product_subscription_id==null?null:Number(charge.product_subscription_id),eventType:"CHARGE_RECONCILED",actorUserId,details:{provider:charge.provider,providerStatus:details.status,localStatus:next}},conn);
    }
    await conn.commit();
  }catch(error){await conn.rollback();throw error;}finally{conn.release();}
  const result={charge:await getCharge(chargeId),reconciled:true,reason:null};
  if(syncSubscriptionId){
    await syncSubscriptionOperationalState(syncSubscriptionId,"PAYMENT_CONFIRMED").catch(error=>console.error("[movyo-sync] payment",syncSubscriptionId,error instanceof Error?error.message:error));
  }
  if(paymentNotification)await notifyFinancialPaymentConfirmed(paymentNotification).catch(error=>console.warn("[finance-push] payment",chargeId,error instanceof Error?error.message:error));
  return result;
}
function providerForCharge(charge:any){if(!isPaymentProviderCode(charge.provider))throw financeError(`A cobrança usa o provedor histórico ${charge.provider||"desconhecido"}, que está disponível somente para consulta.`,409,"HISTORICAL_PROVIDER_READ_ONLY");if(!isPaymentMethodCode(charge.requested_payment_method))throw financeError("A cobrança não possui método de pagamento válido.",409,"PAYMENT_METHOD_MISSING");assertProviderMethod(charge.provider,charge.requested_payment_method);return{provider:getPaymentProvider(charge.provider),code:charge.provider as PaymentProviderCode,method:charge.requested_payment_method as PaymentMethodCode};}

function normalizeProviderMessage(value:unknown){return String(value??"").replace(/\s+/g," ").trim();}
function providerIssueFailure(error:any,code:PaymentProviderCode){
  const raw=normalizeProviderMessage(error?.message||`Falha ao emitir cobrança em ${PROVIDER_LABELS[code]||code}.`);
  const folded=raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  let guidance="";
  if(/recebedor.*cliente.*mesma pessoa|cliente.*recebedor.*mesma pessoa/.test(folded))guidance="Use um CPF/CNPJ do pagador diferente do titular da conta do provedor.";
  else if(/cpf|cnpj|documento/.test(folded)&&/inval|incorret|nao.*valid/.test(folded))guidance="Revise o CPF/CNPJ e os dados do pagador antes de tentar novamente.";
  else if(/email/.test(folded)&&/inval|obrig|ausent/.test(folded))guidance="Revise o e-mail financeiro do pagador.";
  else if(/endereco|cep|logradouro|bairro|cidade|uf/.test(folded)&&/inval|obrig|ausent|incomplet/.test(folded))guidance="Complete ou corrija o endereço de cobrança do pagador.";
  const status=Number(error?.status||0);
  const deterministicHttp=error instanceof ProviderHttpError&&status>=400&&status<500&&![408,409,429].includes(status);
  const deterministicBusiness=Boolean(guidance)||/nao podem ser a mesma pessoa|não podem ser a mesma pessoa/.test(raw.toLowerCase());
  const deterministic=deterministicHttp||deterministicBusiness;
  const provider=PROVIDER_LABELS[code]||code;
  const message=`${provider} recusou a cobrança: ${raw}${guidance?` Ação recomendada: ${guidance}`:""}`.slice(0,500);
  return{deterministic,message,status:deterministic?422:(status||502),code:deterministic?"PROVIDER_REJECTED":String(error?.code||"PROVIDER_ISSUE_UNCERTAIN")};
}

export async function issueCharge(chargeId:number,actorUserId?:number|null){
  let charge=await getCharge(chargeId);if(["PAID","CANCELED"].includes(charge.status))throw financeError("Esta cobrança não pode ser emitida novamente.",409,"CHARGE_FINALIZED");if(charge.provider_charge_id)return reconcileCharge(chargeId,actorUserId);if(charge.status==="ISSUING"){const recovered:any=await reconcileCharge(chargeId,actorUserId);charge=recovered.charge;if(String(charge.status)==="ISSUING")throw financeError(recovered.reason||"A emissão anterior ainda está sem confirmação. Aguarde e reconcilie novamente.",409,"CHARGE_ISSUE_UNCERTAIN");if(!["FAILED","DRAFT"].includes(String(charge.status)))return recovered;}const {provider,code,method}=providerForCharge(charge);assertProviderIssueAmount(code,method,Number(charge.amount));const connection=provider.connectionStatus();if(!connection.enabledByEnvironment||!connection.configured)throw financeError("O provedor desta cobrança não está configurado no servidor.",409,"PROVIDER_UNAVAILABLE");const payerSnapshot:FinancialPayerSnapshot={source:charge.payer_source,personType:charge.payer_person_type,name:charge.payer_name||"",document:charge.payer_document||"",email:charge.payer_email||null,phone:charge.payer_phone||null,zipCode:charge.payer_zip_code||null,street:charge.payer_street||null,number:charge.payer_number||null,complement:charge.payer_complement||null,district:charge.payer_district||null,city:charge.payer_city||null,state:charge.payer_state||null};const missing=missingPayerFieldsForMethod(payerSnapshot,code,method);if(missing.length)throw Object.assign(financeError(`Dados do pagador incompletos para emissão: ${missing.join(", ")}.`,409,"PAYER_DATA_INCOMPLETE"),{missing});const payer=providerPayerFromSnapshot(payerSnapshot);await pool.query(`UPDATE financial_charges SET status='ISSUING',failure_message=NULL,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[chargeId]);await recordFinancialEvent({tenantId:charge.tenant_id,chargeId,eventType:"CHARGE_ISSUE_STARTED",actorUserId,details:{provider:code,paymentMethod:method,externalReference:charge.provider_your_number}});
  try{const paymentTerms=await getProviderIssuePaymentTerms(code);const issued=await provider.issue({externalReference:String(charge.provider_your_number),idempotencyKey:String(charge.idempotency_key||randomUUID()),amount:Number(charge.amount),dueDate:String(charge.due_date).slice(0,10),description:charge.description,payer,paymentMethod:method,paymentTerms});await pool.query(`UPDATE financial_charges SET provider_charge_id=?,provider_payment_url=?,provider_pdf_url=?,barcode=?,digitable_line=?,pix_copy_paste=?,pix_qr_code=?,provider_payload_json=?,issued_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[issued.providerChargeId,issued.paymentUrl||null,issued.pdfUrl||null,issued.barcode||null,issued.digitableLine||null,issued.pixCopyPaste||null,issued.pixQrCode||null,json(issued.raw),chargeId]);await recordFinancialEvent({tenantId:charge.tenant_id,chargeId,eventType:"CHARGE_ISSUED",actorUserId,details:{provider:code,paymentMethod:method,providerChargeId:issued.providerChargeId}});const result=await applyProviderDetails(chargeId,issued,actorUserId);const current=result.charge;if(current.send_email_after_issue){try{const {sendFinancialChargeEmail}=await import("./financial-email.service.js");const emailDelivery=await sendFinancialChargeEmail({chargeId,deliveryType:"AUTO",actorUserId});return{...result,emailDelivery};}catch(emailError:any){return{...result,emailDelivery:{status:"FAILED",message:String(emailError?.message||"Falha ao enviar cobrança por e-mail."),deliveryId:emailError?.deliveryId||null}};}}return result;}
  catch(error:any){const failure=providerIssueFailure(error,code);const nextStatus:ChargeStatus=failure.deterministic?"FAILED":"ISSUING";await pool.query(`UPDATE financial_charges SET status=?,failure_message=?,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[nextStatus,failure.message,chargeId]);await recordFinancialEvent({tenantId:charge.tenant_id,chargeId,eventType:failure.deterministic?"CHARGE_ISSUE_FAILED":"CHARGE_ISSUE_UNCERTAIN",actorUserId,details:{provider:code,paymentMethod:method,message:failure.message,code:failure.code}});throw Object.assign(new Error(failure.message),{status:failure.status,code:failure.code});}
}

function minutesSince(value:unknown){const t=new Date(String(value||'')).getTime();return Number.isFinite(t)?Math.max(0,(Date.now()-t)/60000):999;}
export async function reconcileCharge(chargeId:number,actorUserId?:number|null){
  let charge:any=await getCharge(chargeId);const {provider,method}=providerForCharge(charge);let details:ProviderChargeSnapshot|null=null;
  if(charge.provider_charge_id)details=await provider.getCharge(charge.provider_charge_id,String(charge.provider_your_number||""),method);
  else if(provider.findChargeByExternalReference&&charge.provider_your_number){
    details=await provider.findChargeByExternalReference(String(charge.provider_your_number),method,{createdAt:charge.created_at||charge.updated_at,dueDate:charge.due_date,payerDocument:charge.payer_document});
    if(details?.providerChargeId){await pool.query(`UPDATE financial_charges SET provider_charge_id=?,updated_at=${BRASILIA_NOW_SQL} WHERE id=? AND provider_charge_id IS NULL`,[details.providerChargeId,chargeId]);charge=await getCharge(chargeId);await recordFinancialEvent({tenantId:charge.tenant_id,chargeId,productSubscriptionId:charge.product_subscription_id,eventType:"CHARGE_PROVIDER_ID_RECOVERED",actorUserId,details:{provider:charge.provider,providerChargeId:details.providerChargeId,externalReference:charge.provider_your_number}});}
  }
  if(!details){
    const safeToFail=String(charge.status)==="ISSUING"&&minutesSince(charge.updated_at||charge.created_at)>=5;
    if(safeToFail){const message="Emissão não localizada no provedor após reconciliação segura. A cobrança pode ser emitida novamente.";await pool.query(`UPDATE financial_charges SET status='FAILED',failure_message=?,updated_at=${BRASILIA_NOW_SQL} WHERE id=? AND status='ISSUING'`,[message,chargeId]);await recordFinancialEvent({tenantId:charge.tenant_id,chargeId,productSubscriptionId:charge.product_subscription_id,eventType:"CHARGE_ISSUE_NOT_FOUND",actorUserId,details:{provider:charge.provider,externalReference:charge.provider_your_number}});return{charge:await getCharge(chargeId),reconciled:true,reason:message};}
    await recordFinancialEvent({tenantId:charge.tenant_id,chargeId,productSubscriptionId:charge.product_subscription_id,eventType:"RECONCILIATION_NOT_FOUND",actorUserId,details:{provider:charge.provider,externalReference:charge.provider_your_number}});return{charge,reconciled:false,reason:charge.provider_charge_id?"Cobrança ainda não localizada no provedor.":"Emissão ainda não localizada no provedor; aguarde alguns minutos antes de tentar novamente."};
  }
  return applyProviderDetails(chargeId,details,actorUserId);
}

export async function cancelCharge(chargeId:number,actorUserId?:number|null,reason="SOLICITACAO_ADMIN"){let charge:any=await getCharge(chargeId);if(charge.status==="PAID")throw financeError("Cobrança paga não pode ser cancelada.",409,"PAID_CHARGE");if(charge.status==="CANCELED")return charge;if(charge.status==="ISSUING"&&!charge.provider_charge_id){const reconciled:any=await reconcileCharge(chargeId,actorUserId);charge=reconciled.charge;if(charge.status==="ISSUING")throw financeError("A emissão ainda está incerta no provedor. Aguarde a reconciliação antes de cancelar.",409,"CHARGE_ISSUE_UNCERTAIN");if(charge.status==="PAID")throw financeError("Cobrança paga não pode ser cancelada.",409,"PAID_CHARGE");if(charge.status==="CANCELED")return charge;}if(charge.provider_charge_id){const {provider,method}=providerForCharge(charge);await provider.cancel(charge.provider_charge_id,method);}await pool.query(`UPDATE financial_charges SET status='CANCELED',canceled_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[chargeId]);await recordFinancialEvent({tenantId:charge.tenant_id,chargeId,productSubscriptionId:charge.product_subscription_id,eventType:"CHARGE_CANCELED",actorUserId,details:{provider:charge.provider,providerCancelRequested:Boolean(charge.provider_charge_id),reason}});return getCharge(chargeId);}


export async function reissueChargeWithAdjustment(chargeId:number,input:{discountType:ChargeDiscountType;discountValue?:number;dueDate?:string|null;reason:string;applyRecurringDiscount?:boolean},actorUserId?:number|null){
  let original:any=await getCharge(chargeId);
  if(String(original.status)==="PAID")throw financeError("Cobrança paga não pode ser reemitida.",409,"CHARGE_FINALIZED");
  if(String(original.status)==="ISSUING")throw financeError("A cobrança está com emissão incerta. Reconcile a emissão antes de cancelar/reemitir.",409,"CHARGE_ISSUE_UNCERTAIN");
  if(String(original.status)==="CANCELED"){
    if(!original.replaced_by_charge_id)throw financeError("Cobrança cancelada não pode ser reemitida.",409,"CHARGE_FINALIZED");
    const resumed:any=await getCharge(Number(original.replaced_by_charge_id));let issueError:string|null=null;
    if(["DRAFT","FAILED"].includes(String(resumed.status))){try{await issueCharge(resumed.id,actorUserId||null);}catch(error:any){issueError=String(error?.message||error).slice(0,500);}}
    return{previousCharge:await getCharge(chargeId),newCharge:await getCharge(resumed.id),issueError,resumed:true};
  }
  const reason=String(input.reason||'').trim();if(reason.length<3)throw financeError("Informe o motivo do ajuste/reemissão.");
  const adjustment=calculateChargeAdjustment(Number(original.amount),input.discountType,Number(input.discountValue||0));
  // Valida o limite do provedor ANTES de preparar/cancelar a cobrança original.
  // Evita cancelar um boleto válido para depois descobrir que a substituta não pode ser emitida.
  const originalSelection=providerForCharge(original);
  assertProviderIssueAmount(originalSelection.code,originalSelection.method,adjustment.newAmount);
  const requestedDue=String(input.dueDate||original.due_date||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(requestedDue))throw financeError("Data de vencimento inválida.");
  const today=todayInBrasilia();const dueDate=requestedDue<today?today:requestedDue;
  if(input.applyRecurringDiscount){
    if(String(adjustment.discountType)!=="PERCENT")throw financeError("O desconto recorrente só pode ser gravado como percentual. Para desconto fixo, edite a assinatura.",409,"RECURRING_DISCOUNT_PERCENT_ONLY");
    if(!original.product_subscription_id)throw financeError("Esta cobrança não pertence a uma assinatura de produto.",409,"PRODUCT_SUBSCRIPTION_REQUIRED");
  }
  let replacementPayer:FinancialPayerSnapshot={source:original.payer_source,personType:original.payer_person_type,name:original.payer_name||'',document:original.payer_document||'',email:original.payer_email||null,phone:original.payer_phone||null,zipCode:original.payer_zip_code||null,street:original.payer_street||null,number:original.payer_number||null,complement:original.payer_complement||null,district:original.payer_district||null,city:original.payer_city||null,state:original.payer_state||null};
  if(original.product_subscription_id)replacementPayer=payerFromCommercialCustomer(await getProductSubscription(Number(original.product_subscription_id)));
  else if(original.tenant_id&&String(original.payer_source)==='TENANT')replacementPayer=payerFromBillingProfile(await ensureBillingProfile(Number(original.tenant_id)));

  // Se o provedor já informar pagamento, confirma a baixa antes de qualquer cancelamento.
  if(original.provider_charge_id){const {provider,method}=providerForCharge(original);const remote=await provider.getCharge(original.provider_charge_id,String(original.provider_your_number||''),method);if(remote?.status==='PAID'){await applyProviderDetails(chargeId,remote,actorUserId);throw financeError("A cobrança foi paga no provedor e não pode ser reemitida.",409,"PAID_CHARGE");}}

  // Fase 1: prepara uma única cobrança substituta local, mantendo a original intacta.
  let replacementId=0;
  const prepare=await pool.getConnection();
  try{
    await prepare.beginTransaction();
    const [lockedRows]=await prepare.query<any[]>("SELECT * FROM financial_charges WHERE id=? FOR UPDATE",[chargeId]);const locked=lockedRows[0];
    if(!locked)throw financeError("Cobrança não encontrada.",404,"CHARGE_NOT_FOUND");
    if(String(locked.status)==="PAID")throw financeError("Cobrança paga não pode ser reemitida.",409,"PAID_CHARGE");
    if(String(locked.status)==="ISSUING")throw financeError("A cobrança entrou em emissão durante o ajuste. Reconcile antes de continuar.",409,"CHARGE_CHANGED");
    if(String(locked.status)==="CANCELED"&&locked.replaced_by_charge_id){replacementId=Number(locked.replaced_by_charge_id);await prepare.commit();}
    else{
      const [pendingRows]=await prepare.query<any[]>("SELECT id,amount,due_date,reissue_reason FROM financial_charges WHERE reissued_from_charge_id=? AND status IN ('DRAFT','FAILED') ORDER BY id DESC LIMIT 1 FOR UPDATE",[chargeId]);
      const pending=pendingRows[0];
      if(pending){
        if(Math.abs(Number(pending.amount)-adjustment.newAmount)>0.001||String(pending.due_date).slice(0,10)!==dueDate||String(pending.reissue_reason||'')!==reason)throw financeError("Já existe uma reemissão preparada para esta cobrança com parâmetros diferentes. Conclua ou cancele a operação pendente.",409,"REISSUE_ALREADY_PREPARED");
        replacementId=Number(pending.id);await prepare.commit();
      }else{
        let revision=Number(locked.revision||1)+1;
        if(locked.competence){const ownerSql=locked.product_subscription_id?'product_subscription_id=?':'tenant_id=?';const ownerId=locked.product_subscription_id||locked.tenant_id;const [revRows]=await prepare.query<any[]>(`SELECT COALESCE(MAX(revision),0)+1 AS next_revision FROM financial_charges WHERE ${ownerSql} AND type=? AND competence=?`,[ownerId,locked.type,locked.competence]);revision=Math.max(revision,Number(revRows[0]?.next_revision||revision));}
        const idempotencyKey=randomUUID(),blockAt=calculateBlockAt(dueDate,Number(original.grace_days||3));
        const [r]=await prepare.query<any>(`INSERT INTO financial_charges(tenant_id,commercial_customer_id,product_subscription_id,product_code,payer_source,payer_person_type,payer_name,payer_document,payer_email,payer_phone,payer_zip_code,payer_street,payer_number,payer_complement,payer_district,payer_city,payer_state,send_email_after_issue,type,competence,revision,description,amount,base_amount,discount_base_amount,discount_scope,discount_type,discount_value,discount_amount,is_prorata,prorata_days,prorata_cycle_days,billing_period_start,billing_period_end,due_date,block_at,status,provider,requested_payment_method,idempotency_key,reissued_from_charge_id,reissue_reason,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'DRAFT',?,?,?,?,?,?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,[
          locked.tenant_id,locked.commercial_customer_id,locked.product_subscription_id,locked.product_code,replacementPayer.source,replacementPayer.personType,replacementPayer.name,replacementPayer.document,replacementPayer.email,replacementPayer.phone,replacementPayer.zipCode,replacementPayer.street,replacementPayer.number,replacementPayer.complement,replacementPayer.district,replacementPayer.city,replacementPayer.state,Number(locked.send_email_after_issue||0),locked.type,locked.competence,revision,locked.description,adjustment.newAmount,locked.base_amount==null?Number(locked.amount):locked.base_amount,adjustment.baseAmount,'CHARGE_ONLY',adjustment.discountType,adjustment.discountValue,adjustment.discountAmount,Number(locked.is_prorata||0),locked.prorata_days,locked.prorata_cycle_days,locked.billing_period_start,locked.billing_period_end,dueDate,blockAt,locked.provider,locked.requested_payment_method,idempotencyKey,chargeId,reason,actorUserId||null
        ]);
        replacementId=Number(r.insertId);const ref=providerYourNumber(replacementId);await prepare.query(`UPDATE financial_charges SET provider_your_number=? WHERE id=?`,[ref,replacementId]);
        await recordFinancialEvent({tenantId:locked.tenant_id==null?null:Number(locked.tenant_id),chargeId:replacementId,productSubscriptionId:locked.product_subscription_id==null?null:Number(locked.product_subscription_id),eventType:"CHARGE_REISSUE_PREPARED",actorUserId,details:{reissuedFromChargeId:chargeId,reason,discountType:adjustment.discountType,discountValue:adjustment.discountValue,discountAmount:adjustment.discountAmount,newAmount:adjustment.newAmount,dueDate}},prepare);
        await prepare.commit();
      }
    }
  }catch(error){await prepare.rollback();throw error;}finally{prepare.release();}

  // Fase 2: cancela remotamente. Em erro, consulta o provedor para saber se o cancelamento já ocorreu.
  original=await getCharge(chargeId);
  if(original.provider_charge_id){
    const {provider,method}=providerForCharge(original);let canceled=false;
    try{await provider.cancel(original.provider_charge_id,method);canceled=true;}catch(cancelError:any){
      try{const snapshot=await provider.getCharge(original.provider_charge_id,String(original.provider_your_number||''),method);canceled=snapshot?.status==='CANCELED';if(snapshot?.status==='PAID'){await applyProviderDetails(chargeId,snapshot,actorUserId);}}
      catch{canceled=false;}
      if(!canceled){const message=String(cancelError?.message||'Falha ao confirmar o cancelamento no provedor.').slice(0,500);await pool.query(`UPDATE financial_charges SET status='CANCELED',failure_message=?,reissue_reason=CONCAT(COALESCE(reissue_reason,''),' [REISSUE_ABORTED]'),updated_at=${BRASILIA_NOW_SQL} WHERE id=? AND reissued_from_charge_id=?`,[message,replacementId,chargeId]);await recordFinancialEvent({tenantId:original.tenant_id,chargeId:replacementId,productSubscriptionId:original.product_subscription_id,eventType:"CHARGE_REISSUE_ABORTED",actorUserId,details:{reissuedFromChargeId:chargeId,reason:message}});throw financeError(`Não foi possível confirmar o cancelamento da cobrança original no provedor: ${message}`,409,"PROVIDER_CANCEL_NOT_CONFIRMED");}
    }
  }

  // Fase 3: somente após cancelamento remoto confirmado, troca a referência local de forma transacional.
  const finalize=await pool.getConnection();
  try{
    await finalize.beginTransaction();
    const [lockedRows]=await finalize.query<any[]>("SELECT * FROM financial_charges WHERE id=? FOR UPDATE",[chargeId]);const locked=lockedRows[0];if(!locked)throw financeError("Cobrança não encontrada.",404,"CHARGE_NOT_FOUND");
    if(String(locked.status)==="PAID")throw financeError("Cobrança paga não pode ser reemitida.",409,"PAID_CHARGE");
    await finalize.query(`UPDATE financial_charges SET status='CANCELED',canceled_at=COALESCE(canceled_at,${BRASILIA_NOW_SQL}),replaced_by_charge_id=?,reissue_reason=?,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[replacementId,reason,chargeId]);
    if(input.applyRecurringDiscount&&locked.product_subscription_id)await finalize.query(`UPDATE product_subscriptions SET discount_percent=?,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[adjustment.discountValue,locked.product_subscription_id]);
    await recordFinancialEvent({tenantId:locked.tenant_id==null?null:Number(locked.tenant_id),chargeId,productSubscriptionId:locked.product_subscription_id==null?null:Number(locked.product_subscription_id),eventType:"CHARGE_REISSUED",actorUserId,details:{replacementChargeId:replacementId,reason,providerCancelConfirmed:Boolean(locked.provider_charge_id),oldAmount:Number(locked.amount),newAmount:adjustment.newAmount,dueDate}},finalize);
    await recordFinancialEvent({tenantId:locked.tenant_id==null?null:Number(locked.tenant_id),chargeId:replacementId,productSubscriptionId:locked.product_subscription_id==null?null:Number(locked.product_subscription_id),eventType:"CHARGE_ADJUSTMENT_CREATED",actorUserId,details:{reissuedFromChargeId:chargeId,reason,discountScope:'CHARGE_ONLY',discountType:adjustment.discountType,discountValue:adjustment.discountValue,discountAmount:adjustment.discountAmount,baseAmount:adjustment.baseAmount,newAmount:adjustment.newAmount,dueDate,applyRecurringDiscount:Boolean(input.applyRecurringDiscount)}},finalize);
    await finalize.commit();
  }catch(error){await finalize.rollback();throw error;}finally{finalize.release();}

  let issueError:string|null=null;
  const replacement:any=await getCharge(replacementId);if(["DRAFT","FAILED"].includes(String(replacement.status))){try{await issueCharge(replacementId,actorUserId||null);}catch(error:any){issueError=String(error?.message||error).slice(0,500);}}
  if(original.product_subscription_id)await syncSubscriptionOperationalState(Number(original.product_subscription_id),"CHARGE_REISSUED").catch(error=>console.error("[movyo-sync] charge-reissue",original.product_subscription_id,error instanceof Error?error.message:error));
  return{previousCharge:await getCharge(chargeId),newCharge:await getCharge(replacementId),issueError,resumed:false};
}

export async function recordManualPayment(chargeId:number,actorUserId:number,paidAt?:string){
  const when=paidAt?new Date(paidAt):new Date();if(Number.isNaN(when.getTime()))throw financeError("Data de pagamento inválida.");
  let syncSubscriptionId:number|null=null;
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [rows]=await conn.query<any[]>("SELECT * FROM financial_charges WHERE id=? FOR UPDATE",[chargeId]);
    const charge=rows[0];if(!charge)throw financeError("Cobrança não encontrada.",404,"CHARGE_NOT_FOUND");
    if(charge.status==="PAID"){await conn.commit();return getCharge(chargeId);}
    if(charge.status==="CANCELED")throw financeError("Cobrança cancelada não pode receber baixa manual.",409,"CANCELED_CHARGE");
    const paymentId=`MANUAL:${chargeId}:${createHash("sha256").update(`${actorUserId}:${when.toISOString()}`).digest("hex").slice(0,24)}`;
    await conn.query(`INSERT INTO financial_payments(charge_id,tenant_id,commercial_customer_id,product_subscription_id,provider,requested_payment_method,payment_method,provider_payment_id,amount,net_amount,paid_at,origin,payload_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'MANUAL',?,${BRASILIA_NOW_SQL})`,[chargeId,charge.tenant_id,charge.commercial_customer_id||null,charge.product_subscription_id||null,charge.provider,charge.requested_payment_method,"MANUAL",paymentId,charge.amount,charge.amount,when,json({actorUserId})]);
    await conn.query(`UPDATE financial_charges SET status='PAID',paid_at=?,failure_message=NULL,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[when,chargeId]);
    if(charge.product_subscription_id&&String(charge.type)==="MONTHLY"){
      syncSubscriptionId=Number(charge.product_subscription_id);
      await advanceProductSubscriptionPeriod(conn,syncSubscriptionId,String(charge.due_date));
    }
    await recordFinancialEvent({tenantId:charge.tenant_id==null?null:Number(charge.tenant_id),chargeId,productSubscriptionId:charge.product_subscription_id==null?null:Number(charge.product_subscription_id),eventType:"PAYMENT_CONFIRMED_MANUAL",actorUserId,details:{provider:charge.provider,amount:charge.amount,paidAt:when.toISOString()}},conn);
    await conn.commit();
  }catch(error){await conn.rollback();throw error;}finally{conn.release();}
  if(syncSubscriptionId)await syncSubscriptionOperationalState(syncSubscriptionId,"PAYMENT_CONFIRMED_MANUAL").catch(error=>console.error("[movyo-sync] manual-payment",syncSubscriptionId,error instanceof Error?error.message:error));
  const paidCharge:any=await getCharge(chargeId);
  await notifyFinancialPaymentConfirmed({chargeId,amount:Number(paidCharge.amount),paymentMethod:"MANUAL",providerPaymentId:`MANUAL:${chargeId}`}).catch(error=>console.warn("[finance-push] manual-payment",chargeId,error instanceof Error?error.message:error));
  return paidCharge;
}

export async function getChargePdf(chargeId:number){const charge=await getCharge(chargeId);if(!charge.provider_charge_id)throw financeError("Cobrança ainda não foi emitida.",409,"CHARGE_NOT_ISSUED");const {provider,method}=providerForCharge(charge);if(!provider.getPdf)throw financeError("Este provedor não disponibiliza PDF de boleto para esta cobrança.",404,"PDF_UNAVAILABLE");return provider.getPdf(charge.provider_charge_id,method);}

export async function listCharges(filters:{tenantId?:number;status?:string;type?:string;provider?:string;paymentMethod?:string;from?:string;to?:string;limit?:number}={}){const where:string[]=["1=1"],params:any[]=[];if(filters.tenantId){where.push("c.tenant_id=?");params.push(filters.tenantId);}if(filters.status){where.push("c.status=?");params.push(filters.status);}if(filters.type){where.push("c.type=?");params.push(filters.type);}if(filters.provider){where.push("c.provider=?");params.push(filters.provider);}if(filters.paymentMethod){where.push("c.requested_payment_method=?");params.push(filters.paymentMethod);}if(filters.from){where.push("c.due_date>=?");params.push(filters.from);}if(filters.to){where.push("c.due_date<=?");params.push(filters.to);}const limit=Math.min(500,Math.max(1,Number(filters.limit||200)));const [rows]=await pool.query<any[]>(`SELECT c.*,t.name AS tenant_name,cc.legal_name AS commercial_customer_name,cp.name AS product_name,EXISTS(SELECT 1 FROM financial_access_exceptions e WHERE c.tenant_id IS NOT NULL AND e.tenant_id=c.tenant_id AND e.revoked_at IS NULL AND ${BRASILIA_NOW_SQL} BETWEEN e.starts_at AND e.ends_at AND (e.charge_id IS NULL OR e.charge_id=c.id)) AS has_active_exception,(SELECT d.status FROM financial_charge_deliveries d WHERE d.charge_id=c.id ORDER BY d.created_at DESC,d.id DESC LIMIT 1) AS last_delivery_status FROM financial_charges c LEFT JOIN tenants t ON t.id=c.tenant_id LEFT JOIN commercial_customers cc ON cc.id=c.commercial_customer_id LEFT JOIN product_subscriptions ps ON ps.id=c.product_subscription_id LEFT JOIN commercial_products cp ON cp.id=ps.product_id WHERE ${where.join(" AND ")} ORDER BY c.due_date DESC,c.id DESC LIMIT ${limit}`,params);return rows.map((r:any)=>({...r,id:Number(r.id),tenant_id:r.tenant_id==null?null:Number(r.tenant_id),product_subscription_id:r.product_subscription_id==null?null:Number(r.product_subscription_id),revision:Number(r.revision||1),amount:Number(r.amount),base_amount:r.base_amount==null?Number(r.amount):Number(r.base_amount),discount_base_amount:r.discount_base_amount==null?null:Number(r.discount_base_amount),discount_value:r.discount_value==null?null:Number(r.discount_value),discount_amount:Number(r.discount_amount||0),reissued_from_charge_id:r.reissued_from_charge_id==null?null:Number(r.reissued_from_charge_id),replaced_by_charge_id:r.replaced_by_charge_id==null?null:Number(r.replaced_by_charge_id),has_active_exception:Boolean(r.has_active_exception)}));}

export async function listReceipts(filters:{tenantId?:number;provider?:string;paymentMethod?:string;from?:string;to?:string;limit?:number}={}){const where=["1=1"],params:any[]=[];if(filters.tenantId){where.push("p.tenant_id=?");params.push(filters.tenantId);}if(filters.provider){where.push("p.provider=?");params.push(filters.provider);}if(filters.paymentMethod){where.push("p.payment_method=?");params.push(filters.paymentMethod);}if(filters.from){where.push("DATE(p.paid_at)>=?");params.push(filters.from);}if(filters.to){where.push("DATE(p.paid_at)<=?");params.push(filters.to);}const limit=Math.min(500,Math.max(1,Number(filters.limit||200)));const [rows]=await pool.query<any[]>(`SELECT p.*,c.type,c.description,c.due_date,c.payer_source,c.payer_name,c.payer_document,c.payer_email,t.name AS tenant_name FROM financial_payments p JOIN financial_charges c ON c.id=p.charge_id LEFT JOIN tenants t ON t.id=p.tenant_id WHERE ${where.join(" AND ")} ORDER BY p.paid_at DESC,p.id DESC LIMIT ${limit}`,params);return rows.map((r:any)=>({...r,id:Number(r.id),charge_id:Number(r.charge_id),tenant_id:r.tenant_id==null?null:Number(r.tenant_id),amount:Number(r.amount),provider_fee:r.provider_fee==null?null:Number(r.provider_fee),net_amount:r.net_amount==null?null:Number(r.net_amount)}));}

export async function listFinancialEvents(filters:{tenantId?:number;chargeId?:number;provider?:string;limit?:number}={}){const where=["1=1"],params:any[]=[];if(filters.tenantId){where.push("e.tenant_id=?");params.push(filters.tenantId);}if(filters.chargeId){where.push("e.charge_id=?");params.push(filters.chargeId);}if(filters.provider){where.push("c.provider=?");params.push(filters.provider);}const limit=Math.min(500,Math.max(1,Number(filters.limit||200)));const [rows]=await pool.query<any[]>(`SELECT e.*,t.name AS tenant_name,c.description AS charge_description,c.payer_source,c.payer_name,c.payer_document,c.provider,c.requested_payment_method,u.name AS actor_name FROM financial_events e LEFT JOIN tenants t ON t.id=e.tenant_id LEFT JOIN financial_charges c ON c.id=e.charge_id LEFT JOIN users u ON u.id=e.actor_user_id WHERE ${where.join(" AND ")} ORDER BY e.created_at DESC,e.id DESC LIMIT ${limit}`,params);return rows;}

export async function getFinancialDashboard(){
  const today=todayInBrasilia(),monthStart=`${today.slice(0,7)}-01`;
  const [paymentRows]=await pool.query<any[]>(`SELECT COALESCE(SUM(amount),0) AS received_month FROM financial_payments WHERE DATE(paid_at)>=? AND DATE(paid_at)<=?`,[monthStart,today]);
  const blockedExpr=`((fc.tenant_id IS NOT NULL AND bp.auto_block_enabled=1 AND NOT EXISTS(SELECT 1 FROM financial_access_exceptions e WHERE e.tenant_id=fc.tenant_id AND e.revoked_at IS NULL AND ${BRASILIA_NOW_SQL} BETWEEN e.starts_at AND e.ends_at AND (e.charge_id IS NULL OR e.charge_id=fc.id))) OR (fc.product_subscription_id IS NOT NULL AND ps.auto_block=1 AND (ps.grace_until IS NULL OR DATE(ps.grace_until)<?)))`;
  const [chargeRows]=await pool.query<any[]>(`SELECT COALESCE(SUM(CASE WHEN fc.status IN ('OPEN','OVERDUE','ISSUING') THEN fc.amount ELSE 0 END),0) AS receivable,COALESCE(SUM(CASE WHEN fc.status='OVERDUE' THEN fc.amount ELSE 0 END),0) AS overdue,COUNT(DISTINCT CASE WHEN fc.status='OVERDUE' THEN CASE WHEN fc.tenant_id IS NOT NULL THEN CONCAT('T:',fc.tenant_id) WHEN fc.product_subscription_id IS NOT NULL THEN CONCAT('S:',fc.product_subscription_id) END END) AS delinquent,COUNT(DISTINCT CASE WHEN fc.status IN ('OPEN','OVERDUE') AND fc.block_at<=? AND ${blockedExpr} THEN CASE WHEN fc.tenant_id IS NOT NULL THEN CONCAT('T:',fc.tenant_id) WHEN fc.product_subscription_id IS NOT NULL THEN CONCAT('S:',fc.product_subscription_id) END END) AS blocked FROM financial_charges fc LEFT JOIN saas_billing_profiles bp ON bp.tenant_id=fc.tenant_id LEFT JOIN product_subscriptions ps ON ps.id=fc.product_subscription_id`,[today,today]);
  const [tenantMrrRows]=await pool.query<any[]>(`SELECT COALESCE(SUM(COALESCE(tc.price_monthly,p.price_monthly)),0) AS mrr FROM tenants t JOIN subscriptions s ON s.id=(SELECT MAX(s2.id) FROM subscriptions s2 WHERE s2.tenant_id=t.id) JOIN plans p ON p.id=s.plan_id LEFT JOIN tenant_contracts tc ON tc.tenant_id=t.id WHERE t.status='ACTIVE' AND s.status IN ('ACTIVE','PAST_DUE')`);
  const [productMrrRows]=await pool.query<any[]>(`SELECT COALESCE(SUM(ps.monthly_price*(1-LEAST(100,GREATEST(0,ps.discount_percent))/100)),0) AS mrr FROM product_subscriptions ps WHERE ps.tenant_id IS NULL AND ps.status IN ('ACTIVE','GRACE','PAST_DUE','BLOCKED')`);
  const [providerRows]=await pool.query<any[]>(`SELECT provider,COALESCE(SUM(amount),0) AS received,COALESCE(SUM(provider_fee),0) AS fees,COALESCE(SUM(net_amount),0) AS net FROM financial_payments WHERE DATE(paid_at)>=? AND DATE(paid_at)<=? GROUP BY provider ORDER BY received DESC`,[monthStart,today]);
  const [attentionRows]=await pool.query<any[]>(`SELECT fc.id AS charge_id,fc.tenant_id,fc.product_subscription_id,COALESCE(t.name,cc.legal_name,'Cliente') AS owner_name,cp.name AS product_name,fc.description,fc.amount,fc.due_date,CASE WHEN fc.status IN ('OPEN','OVERDUE') AND fc.block_at<=? AND ${blockedExpr} THEN 1 ELSE 0 END AS blocking FROM financial_charges fc LEFT JOIN tenants t ON t.id=fc.tenant_id LEFT JOIN saas_billing_profiles bp ON bp.tenant_id=fc.tenant_id LEFT JOIN product_subscriptions ps ON ps.id=fc.product_subscription_id LEFT JOIN commercial_customers cc ON cc.id=fc.commercial_customer_id LEFT JOIN commercial_products cp ON cp.id=ps.product_id WHERE fc.status='OVERDUE' OR (fc.status IN ('OPEN','OVERDUE') AND fc.block_at<=? AND ${blockedExpr}) ORDER BY blocking DESC,fc.due_date ASC,fc.id ASC LIMIT 8`,[today,today,today,today]);
  return{receivedMonth:Number(paymentRows[0]?.received_month||0),receivable:Number(chargeRows[0]?.receivable||0),overdue:Number(chargeRows[0]?.overdue||0),delinquentTenants:Number(chargeRows[0]?.delinquent||0),blockedTenants:Number(chargeRows[0]?.blocked||0),mrr:Number(tenantMrrRows[0]?.mrr||0)+Number(productMrrRows[0]?.mrr||0),byProvider:providerRows.map((r:any)=>({provider:r.provider,received:Number(r.received||0),fees:Number(r.fees||0),net:Number(r.net||0)})),recentReceipts:await listReceipts({limit:8}),attention:attentionRows.map((r:any)=>({chargeId:Number(r.charge_id),tenantId:r.tenant_id==null?null:Number(r.tenant_id),productSubscriptionId:r.product_subscription_id==null?null:Number(r.product_subscription_id),name:String(r.owner_name||'Cliente'),productName:r.product_name||null,amount:Number(r.amount||0),dueDate:r.due_date,blocking:Boolean(r.blocking)}))};
}

export async function markOverdueCharges(){const today=todayInBrasilia();const [result]=await pool.query<any>(`UPDATE financial_charges SET status='OVERDUE',updated_at=${BRASILIA_NOW_SQL} WHERE status='OPEN' AND due_date<?`,[today]);return Number(result.affectedRows||0);}
export async function listAutomaticReconciliationCandidates(limit=100){
  const safeLimit=Math.min(250,Math.max(1,limit));
  const [rows]=await pool.query<any[]>(`SELECT id FROM financial_charges
    WHERE provider IN ('CORA','EFI','MERCADO_PAGO')
      AND updated_at<=DATE_SUB(${BRASILIA_NOW_SQL},INTERVAL 5 MINUTE)
      AND (status='ISSUING' OR (status IN ('OPEN','OVERDUE') AND provider_charge_id IS NOT NULL))
    ORDER BY CASE status WHEN 'OVERDUE' THEN 0 WHEN 'ISSUING' THEN 1 ELSE 2 END,updated_at ASC,id ASC
    LIMIT ${safeLimit}`);
  return rows.map((r:any)=>Number(r.id));
}

// Compatibilidade com chamadas antigas. Agora a rotina também recupera pagamentos
// OPEN/OVERDUE quando o webhook não chegar ou falhar.
export async function listAmbiguousCharges(limit=100){return listAutomaticReconciliationCandidates(limit);}
