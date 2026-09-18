import { pool } from "../db/pool.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { interWebhookEventKey, providerReferenceFromWebhook } from "./inter-webhook-core.js";
import { reconcileCharge } from "./financial.service.js";

function payloadJson(payload:unknown){return JSON.stringify(payload??null);}

export async function processInterWebhook(payload:any, accountReference?:string|null){
  const eventKey=interWebhookEventKey(payload);
  const ref=providerReferenceFromWebhook(payload);
  const root=payload?.cobranca||payload?.data?.cobranca||payload?.data||payload||{};
  const accountRef=accountReference||root.contaCorrente||root.conta||null;
  await pool.query(
    `INSERT IGNORE INTO financial_webhook_events(provider,event_key,account_reference,payload_json,received_at,status)
     VALUES('INTER',?,?,?,${BRASILIA_NOW_SQL},'RECEIVED')`,[eventKey,accountRef,payloadJson(payload)]);
  const [events]=await pool.query<any[]>("SELECT id,status FROM financial_webhook_events WHERE provider='INTER' AND event_key=? LIMIT 1",[eventKey]);
  const event=events[0];
  if(!event)return {eventKey,status:"FAILED"};
  if(event.status==="PROCESSED"||event.status==="IGNORED")return {eventKey,status:event.status,duplicate:true};
  try{
    let rows:any[]=[];
    if(ref.providerChargeId)[rows]=await pool.query<any[]>("SELECT id FROM financial_charges WHERE provider='INTER' AND provider_charge_id=? LIMIT 1",[ref.providerChargeId]);
    if(!rows[0]&&ref.yourNumber)[rows]=await pool.query<any[]>("SELECT id FROM financial_charges WHERE provider='INTER' AND provider_your_number=? LIMIT 1",[ref.yourNumber]);
    if(!rows[0]){
      await pool.query(`UPDATE financial_webhook_events SET status='IGNORED',processed_at=${BRASILIA_NOW_SQL},error_message='Cobrança local não localizada.' WHERE id=?`,[event.id]);
      return {eventKey,status:"IGNORED"};
    }
    const result=await reconcileCharge(Number(rows[0].id),null);
    await pool.query(`UPDATE financial_webhook_events SET status='PROCESSED',processed_at=${BRASILIA_NOW_SQL},error_message=NULL WHERE id=?`,[event.id]);
    return {eventKey,status:"PROCESSED",chargeId:Number(rows[0].id),reconciled:result.reconciled};
  }catch(error:any){
    const message=error instanceof Error?error.message.slice(0,500):"Falha ao reconciliar evento do Banco Inter.";
    await pool.query(`UPDATE financial_webhook_events SET status='FAILED',processed_at=${BRASILIA_NOW_SQL},error_message=? WHERE id=?`,[message,event.id]);
    return {eventKey,status:"FAILED",error:message};
  }
}

export async function retryFailedInterWebhooks(limit=25){
  const [rows]=await pool.query<any[]>("SELECT payload_json FROM financial_webhook_events WHERE provider='INTER' AND status='FAILED' ORDER BY received_at ASC LIMIT ?",[Math.min(100,Math.max(1,limit))]);
  const results=[];
  for(const row of rows){try{results.push(await processInterWebhook(JSON.parse(row.payload_json)));}catch{/* isolate */}}
  return results;
}
