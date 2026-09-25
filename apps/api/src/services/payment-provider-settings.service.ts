import { pool } from "../db/pool.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { assertProviderMethod, isPaymentMethodCode, isPaymentProviderCode, PROVIDER_LABELS } from "./payment-provider-core.js";
import { getPaymentProvider, listPaymentProviders } from "./provider-registry.js";
import type { PaymentMethodCode, PaymentProviderCode, ProviderIssuePaymentTerms } from "./payment-provider.types.js";

const settingsError=(message:string,status=400,code="FINANCIAL_SETTINGS_ERROR")=>Object.assign(new Error(message),{status,code});

export type CoraPaymentTermsSettings={discountAmount:number;fineAmount:number;interestRate:number};
const DEFAULT_CORA_TERMS:CoraPaymentTermsSettings={discountAmount:0,fineAmount:0,interestRate:0};
const money2=(value:unknown)=>Math.max(0,Math.round(Number(value||0)*100)/100);
const percent2=(value:unknown)=>Math.min(100,Math.max(0,Math.round(Number(value||0)*100)/100));
function readJson(value:unknown){try{return value?JSON.parse(String(value)):{};}catch{return{};}}
function normalizeCoraTerms(value:any):CoraPaymentTermsSettings{return{discountAmount:money2(value?.discountAmount),fineAmount:money2(value?.fineAmount),interestRate:percent2(value?.interestRate)};}
function coraTermsFromStored(value:unknown){const parsed=readJson(value);return normalizeCoraTerms(parsed?.paymentTerms||DEFAULT_CORA_TERMS);}

export async function getFinancialProviderSettings(){
  const [rows]=await pool.query<any[]>("SELECT default_payment_provider,default_payment_method,updated_at FROM financial_settings WHERE id=1 LIMIT 1");
  const row=rows[0]||{};
  const [dbRows]=await pool.query<any[]>("SELECT provider,is_default,enabled,environment,last_test_at,last_test_status,last_test_message,settings_json FROM payment_provider_settings ORDER BY provider");
  const db=new Map<string,any>(dbRows.map((r:any)=>[String(r.provider),r]));
  const providers=listPaymentProviders().map(provider=>{
    const status=provider.connectionStatus(); const stored:any=db.get(provider.code)||{};
    return {...status,label:PROVIDER_LABELS[provider.code],selected:row.default_payment_provider===provider.code,dbEnabled:Boolean(stored.enabled),lastTestAt:stored.last_test_at||null,lastTestStatus:stored.last_test_status||"NEVER",lastTestMessage:stored.last_test_message||null,paymentTerms:provider.code==="CORA"?coraTermsFromStored(stored.settings_json):null};
  });
  return {defaultProvider:isPaymentProviderCode(row.default_payment_provider)?row.default_payment_provider:null,defaultMethod:isPaymentMethodCode(row.default_payment_method)?row.default_payment_method:null,updatedAt:row.updated_at||null,providers};
}

export async function updateFinancialProviderSettings(input:{provider:PaymentProviderCode;method:PaymentMethodCode},actorUserId?:number|null){
  if(!isPaymentProviderCode(input.provider))throw settingsError("Provedor de pagamento inválido.");
  if(!isPaymentMethodCode(input.method))throw settingsError("Método de pagamento inválido.");
  assertProviderMethod(input.provider,input.method);
  const provider=getPaymentProvider(input.provider); const status=provider.connectionStatus();
  if(!status.enabledByEnvironment)throw settingsError(`${PROVIDER_LABELS[input.provider]} está desativado no servidor.`,409,"PROVIDER_DISABLED");
  if(!status.configured)throw settingsError(`${PROVIDER_LABELS[input.provider]} ainda não possui todas as credenciais necessárias.`,409,"PROVIDER_NOT_CONFIGURED");
  const conn=await pool.getConnection();
  try{await conn.beginTransaction();
    await conn.query(`INSERT INTO financial_settings(id,default_payment_provider,default_payment_method,updated_by,created_at,updated_at) VALUES(1,?,?,?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL}) ON DUPLICATE KEY UPDATE default_payment_provider=VALUES(default_payment_provider),default_payment_method=VALUES(default_payment_method),updated_by=VALUES(updated_by),updated_at=${BRASILIA_NOW_SQL}`,[input.provider,input.method,actorUserId||null]);
    await conn.query(`UPDATE payment_provider_settings SET is_default=(provider=?),updated_at=${BRASILIA_NOW_SQL}`,[input.provider]);
    await conn.commit();
  }catch(e){await conn.rollback();throw e;}finally{conn.release();}
  return getFinancialProviderSettings();
}

export async function updateCoraPaymentTerms(input:CoraPaymentTermsSettings){
  const terms=normalizeCoraTerms(input);
  const [rows]=await pool.query<any[]>("SELECT settings_json FROM payment_provider_settings WHERE provider='CORA' LIMIT 1");
  const settings=readJson(rows[0]?.settings_json);settings.paymentTerms=terms;
  const payload=JSON.stringify(settings);
  await pool.query(`INSERT INTO payment_provider_settings(provider,is_default,enabled,environment,last_test_status,settings_json,created_at,updated_at) VALUES('CORA',0,0,'production','NEVER',?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL}) ON DUPLICATE KEY UPDATE settings_json=VALUES(settings_json),updated_at=${BRASILIA_NOW_SQL}`,[payload]);
  return terms;
}

export async function getProviderIssuePaymentTerms(code:PaymentProviderCode):Promise<ProviderIssuePaymentTerms|null>{
  if(code!=="CORA")return null;
  const [rows]=await pool.query<any[]>("SELECT settings_json FROM payment_provider_settings WHERE provider='CORA' LIMIT 1");
  const terms=coraTermsFromStored(rows[0]?.settings_json);
  return terms.discountAmount>0||terms.fineAmount>0||terms.interestRate>0?terms:null;
}

export async function getDefaultPaymentSelection(){
  const [rows]=await pool.query<any[]>("SELECT default_payment_provider,default_payment_method FROM financial_settings WHERE id=1 LIMIT 1");
  const row=rows[0];
  if(!row||!isPaymentProviderCode(row.default_payment_provider)||!isPaymentMethodCode(row.default_payment_method))throw settingsError("Defina o provedor e o método de pagamento padrão em Financeiro > Provedores.",409,"DEFAULT_PROVIDER_MISSING");
  const providerCode: PaymentProviderCode=row.default_payment_provider;
  const methodCode: PaymentMethodCode=row.default_payment_method;
  assertProviderMethod(providerCode,methodCode);
  const status=getPaymentProvider(providerCode).connectionStatus();
  if(!status.enabledByEnvironment||!status.configured)throw settingsError(`O provedor padrão ${PROVIDER_LABELS[providerCode]} não está pronto para uso.`,409,"DEFAULT_PROVIDER_UNAVAILABLE");
  return {provider:providerCode,method:methodCode};
}

export async function testPaymentProvider(code:PaymentProviderCode){
  if(!isPaymentProviderCode(code))throw settingsError("Provedor inválido.");
  const provider=getPaymentProvider(code);
  try{const result=await provider.testConnection();await pool.query(`UPDATE payment_provider_settings SET enabled=1,environment=?,last_test_at=${BRASILIA_NOW_SQL},last_test_status='OK',last_test_message=?,updated_at=${BRASILIA_NOW_SQL} WHERE provider=?`,[result.environment,result.message,code]);return result;}
  catch(error:any){await pool.query(`UPDATE payment_provider_settings SET last_test_at=${BRASILIA_NOW_SQL},last_test_status='ERROR',last_test_message=?,updated_at=${BRASILIA_NOW_SQL} WHERE provider=?`,[String(error?.message||"Falha no teste.").slice(0,500),code]);throw error;}
}

export async function configurePaymentProviderWebhook(code:PaymentProviderCode,url:string){
  const provider=getPaymentProvider(code);if(!provider.configureWebhook)throw settingsError(`${PROVIDER_LABELS[code]} não oferece configuração remota de webhook.`,409,"WEBHOOK_MANUAL_ONLY");return provider.configureWebhook(url);
}
