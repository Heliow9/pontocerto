import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import type { PaymentProviderCode } from "./payment-provider.types.js";
import { isPaymentProviderCode } from "./payment-provider-core.js";
import { stableWebhookEventKey, mercadoPagoSignatureValid, resolveMercadoPagoNotificationResource } from "./payment-webhook-core.js";
import { resolveEfiNotificationToken } from "./efi-provider.js";
import { reconcileCharge } from "./financial.service.js";
import { getPaymentProvider } from "./provider-registry.js";

const asString=(v:any)=>v==null?null:String(v);
async function locateCharge(provider:PaymentProviderCode,providerChargeId:string|null,externalReference:string|null){
  let rows:any[]=[];
  if(providerChargeId)[rows]=await pool.query<any[]>("SELECT id FROM financial_charges WHERE provider=? AND provider_charge_id=? LIMIT 1",[provider,providerChargeId]);
  if(!rows[0]&&externalReference)[rows]=await pool.query<any[]>("SELECT id FROM financial_charges WHERE provider=? AND provider_your_number=? LIMIT 1",[provider,externalReference]);
  return rows[0]?Number(rows[0].id):null;
}

async function process(provider:PaymentProviderCode,input:{payload:any;eventKey?:string|null;providerChargeId?:string|null;externalReference?:string|null;accountReference?:string|null}){
  const eventKey=stableWebhookEventKey(provider,input.payload,input.eventKey);
  await pool.query(`INSERT IGNORE INTO financial_webhook_events(provider,event_key,account_reference,payload_json,received_at,status) VALUES(?,?,?,?,${BRASILIA_NOW_SQL},'RECEIVED')`,[provider,eventKey,input.accountReference||null,JSON.stringify(input.payload??null)]);
  const [events]=await pool.query<any[]>("SELECT id,status FROM financial_webhook_events WHERE provider=? AND event_key=? LIMIT 1",[provider,eventKey]);const event=events[0];
  if(!event)return{eventKey,status:"FAILED"};if(event.status==="PROCESSED"||event.status==="IGNORED")return{eventKey,status:event.status,duplicate:true};
  try{const chargeId=await locateCharge(provider,input.providerChargeId||null,input.externalReference||null);if(!chargeId){await pool.query(`UPDATE financial_webhook_events SET status='IGNORED',processed_at=${BRASILIA_NOW_SQL},error_message='Cobrança local não localizada.' WHERE id=?`,[event.id]);return{eventKey,status:"IGNORED"};}const result=await reconcileCharge(chargeId,null);await pool.query(`UPDATE financial_webhook_events SET status='PROCESSED',processed_at=${BRASILIA_NOW_SQL},error_message=NULL WHERE id=?`,[event.id]);return{eventKey,status:"PROCESSED",chargeId,reconciled:result.reconciled};}
  catch(error:any){const message=String(error?.message||"Falha ao reconciliar webhook.").slice(0,500);await pool.query(`UPDATE financial_webhook_events SET status='FAILED',processed_at=${BRASILIA_NOW_SQL},error_message=? WHERE id=?`,[message,event.id]);return{eventKey,status:"FAILED",error:message};}
}

export async function processCoraWebhook(payload:any,headers:Record<string,any>={}){
  // A Cora envia as referências principais do webhook em headers e pode mandar corpo vazio.
  // Persistimos uma cópia normalizada desses headers junto ao payload para que o worker
  // consiga repetir a reconciliação sem perder o invoice id em uma falha transitória.
  const persisted=payload&&typeof payload==="object"&&!Array.isArray(payload)?{...payload}:{};
  const saved=persisted?._coraWebhook||{};
  const resourceId=asString(headers["webhook-resource-id"]||saved.resourceId||payload?.resource_id||payload?.resourceId||payload?.data?.id||payload?.id);
  const eventId=asString(headers["webhook-event-id"]||saved.eventId||payload?.event_id||payload?.eventId);
  const eventType=asString(headers["webhook-event-type"]||saved.eventType||payload?.event_type||payload?.eventType);
  const storedPayload={...persisted,_coraWebhook:{eventId,eventType,resourceId}};
  return process("CORA",{payload:storedPayload,eventKey:eventId,providerChargeId:resourceId});
}

export async function processEfiWebhook(payload:any){
  if(payload?.notification){const resolved=await resolveEfiNotificationToken(String(payload.notification));const providerChargeId=resolved.chargeId?`BOLIX:${resolved.chargeId}`:null;return process("EFI",{payload:{...payload,resolved:resolved.raw},eventKey:`notification:${payload.notification}`,providerChargeId});}
  const pix=Array.isArray(payload?.pix)?payload.pix:[];const first=pix[0];const txid=asString(first?.txid||payload?.txid);return process("EFI",{payload,eventKey:asString(first?.endToEndId||first?.endToEndID)||null,providerChargeId:txid?`PIX:${txid}`:null});
}

export async function processMercadoPagoWebhook(payload:any,headers:Record<string,any>,query:Record<string,any>){
  const resource=resolveMercadoPagoNotificationResource(payload,query);
  const dataId=asString(resource.paymentId);
  const signature=asString(headers["x-signature"]);
  const requestId=asString(headers["x-request-id"]);
  if(!dataId)throw Object.assign(new Error("Notificação Mercado Pago sem identificador de pagamento."),{status:400,code:"MP_WEBHOOK_PAYMENT_ID_MISSING"});

  // Webhooks atuais são autenticados por HMAC. O fallback IPN é aceito apenas para o
  // tópico payment e nunca confia no corpo: ele apenas dispara uma consulta autenticada
  // à API do Mercado Pago durante reconcileCharge antes de qualquer baixa local.
  if(resource.mode==="WEBHOOK"&&!mercadoPagoSignatureValid({signature,requestId,dataId,secret:env.MP_WEBHOOK_SECRET}))
    throw Object.assign(new Error("Assinatura do webhook Mercado Pago inválida."),{status:401,code:"INVALID_WEBHOOK_SIGNATURE"});

  const eventKey=resource.mode==="IPN"
    ?`ipn:${resource.topic||"payment"}:${dataId}`
    :(asString(payload?.id)||requestId||`webhook:${dataId}`);

  // O webhook pode chegar milissegundos antes de applyProviderDetails persistir provider_charge_id.
  // Nessa janela recuperamos o external_reference no próprio Mercado Pago e localizamos a cobrança
  // por provider_your_number. A consulta remota é autenticada e não confia no conteúdo do callback.
  let externalReference:string|null=null;
  const localByProviderId=await locateCharge("MERCADO_PAGO",`PAYMENT:${dataId}`,null);
  if(!localByProviderId){
    try{
      const remote=await getPaymentProvider("MERCADO_PAGO").getCharge(`PAYMENT:${dataId}`,"","BOLETO");
      externalReference=asString(remote?.externalReference);
    }catch(error:any){
      throw Object.assign(new Error(`Não foi possível confirmar a notificação no Mercado Pago: ${String(error?.message||error)}`),{status:503,code:"MP_WEBHOOK_CONFIRMATION_FAILED"});
    }
  }
  return process("MERCADO_PAGO",{payload:{...payload,_notificationMode:resource.mode,_notificationQuery:query},eventKey,providerChargeId:`PAYMENT:${dataId}`,externalReference});
}

export async function retryFailedProviderWebhooks(limit=25){
  const [rows]=await pool.query<any[]>(`SELECT provider,payload_json,event_key FROM financial_webhook_events WHERE provider IN ('CORA','EFI','MERCADO_PAGO') AND status='FAILED' ORDER BY received_at ASC LIMIT ${Math.min(100,Math.max(1,limit))}`);const results:any[]=[];
  for(const row of rows){if(!isPaymentProviderCode(row.provider))continue;try{const payload=JSON.parse(row.payload_json);if(row.provider==="CORA")results.push(await processCoraWebhook(payload));else if(row.provider==="EFI")results.push(await processEfiWebhook(payload));else{const resource=resolveMercadoPagoNotificationResource(payload,payload?._notificationQuery||{});results.push(await process("MERCADO_PAGO",{payload,eventKey:row.event_key,providerChargeId:resource.paymentId?`PAYMENT:${resource.paymentId}`:null}));}}catch{/* isolate */}}
  return results;
}
