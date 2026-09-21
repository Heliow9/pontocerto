import {createHash} from "node:crypto";
import {pool} from "../db/pool.js";
import {env} from "../config/env.js";
import {BRASILIA_NOW_SQL} from "../utils/db-time.js";
import {sendWebPushPayload,webPushReady} from "./notifications.service.js";

export async function getFinancialPushSettings(userId:number){
  const [rows]=await pool.query<any[]>("SELECT device_key,enabled,payment_confirmed,updated_at FROM saas_financial_push_subscriptions WHERE user_id=? ORDER BY updated_at DESC",[userId]);
  return{publicKey:env.VAPID_PUBLIC_KEY||null,webReady:webPushReady(),subscriptions:rows.map(r=>({deviceKey:r.device_key,enabled:Boolean(r.enabled),paymentConfirmed:Boolean(r.payment_confirmed),updatedAt:r.updated_at}))};
}

export async function saveFinancialPushSubscription(input:{userId:number;deviceKey:string;destination:any;paymentConfirmed?:boolean}){
  if(!webPushReady())throw Object.assign(new Error("As notificações PWA ainda não estão configuradas no servidor."),{status:503,code:"PUSH_NOT_CONFIGURED"});
  const endpoint=String(input.destination?.endpoint||"");
  if(!endpoint)throw Object.assign(new Error("Assinatura de notificação sem endpoint."),{status:400,code:"PUSH_ENDPOINT_MISSING"});
  const hash=createHash("sha256").update(endpoint).digest("hex");
  const destination=JSON.stringify(input.destination);
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    await conn.query("DELETE FROM saas_financial_push_subscriptions WHERE user_id=? AND device_key=? AND endpoint_hash<>?",[input.userId,input.deviceKey,hash]);
    await conn.query(`INSERT INTO saas_financial_push_subscriptions(user_id,device_key,endpoint_hash,destination,payment_confirmed,enabled,created_at,updated_at) VALUES(?,?,?,?,?,1,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL}) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),device_key=VALUES(device_key),destination=VALUES(destination),payment_confirmed=VALUES(payment_confirmed),enabled=1,updated_at=VALUES(updated_at)`,[input.userId,input.deviceKey,hash,destination,input.paymentConfirmed===false?0:1]);
    await conn.commit();
  }catch(error){await conn.rollback();throw error;}finally{conn.release();}
  return{enabled:true};
}

export async function disableFinancialPushSubscription(userId:number,deviceKey:string){
  await pool.query(`UPDATE saas_financial_push_subscriptions SET enabled=0,updated_at=${BRASILIA_NOW_SQL} WHERE user_id=? AND device_key=?`,[userId,deviceKey]);
  return{enabled:false};
}

function brl(value:number){return Number(value||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});}
function paymentMethodLabel(value:string){const v=String(value||"").toUpperCase();return v==="PIX"?"Pix":v==="BOLETO"?"boleto":v==="MANUAL"?"baixa manual":"pagamento";}

export async function notifyFinancialPaymentConfirmed(input:{chargeId:number;amount:number;paymentMethod:string;providerPaymentId?:string|null}){
  if(!webPushReady())return{sent:0,failed:0,skipped:true};
  const [charges]=await pool.query<any[]>(`SELECT c.id,c.description,c.payer_name,c.product_code,t.name AS tenant_name,cc.legal_name AS commercial_customer_name FROM financial_charges c LEFT JOIN tenants t ON t.id=c.tenant_id LEFT JOIN commercial_customers cc ON cc.id=c.commercial_customer_id WHERE c.id=? LIMIT 1`,[input.chargeId]);
  const charge=charges[0];if(!charge)return{sent:0,failed:0,skipped:true};
  const owner=String(charge.commercial_customer_name||charge.tenant_name||charge.payer_name||"Cliente");
  const eventKey=`PAYMENT_CONFIRMED:${input.chargeId}:${String(input.providerPaymentId||"LOCAL")}`.slice(0,190);
  const [subs]=await pool.query<any[]>(`SELECT s.* FROM saas_financial_push_subscriptions s JOIN users u ON u.id=s.user_id AND u.active=1 AND u.role='SUPER_ADMIN' WHERE s.enabled=1 AND s.payment_confirmed=1`);
  let sent=0,failed=0;
  for(const sub of subs){
    const [claim]=await pool.query<any>(`INSERT IGNORE INTO saas_financial_push_deliveries(subscription_id,event_key,charge_id,status,created_at) VALUES(?,?,?,'CLAIMED',${BRASILIA_NOW_SQL})`,[sub.id,eventKey,input.chargeId]);
    if(!claim.affectedRows)continue;
    try{
      await sendWebPushPayload(sub.destination,{title:"Ponto Certo · pagamento confirmado",body:`${owner} · ${brl(input.amount)} recebido via ${paymentMethodLabel(input.paymentMethod)}.`,url:"/#saas/finance-receipts",tag:`finance-payment-${input.chargeId}`,expiresAt:Date.now()+86400000},{ttl:86400,urgency:"high"});
      await pool.query(`UPDATE saas_financial_push_deliveries SET status='SENT',sent_at=${BRASILIA_NOW_SQL} WHERE id=?`,[claim.insertId]);sent++;
    }catch(error:any){
      const message=String(error?.message||"Falha ao enviar notificação.").slice(0,500);
      await pool.query(`UPDATE saas_financial_push_deliveries SET status='FAILED',error_message=? WHERE id=?`,[message,claim.insertId]);failed++;
      if([404,410].includes(Number(error?.statusCode)))await pool.query(`UPDATE saas_financial_push_subscriptions SET enabled=0,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[sub.id]);
    }
  }
  await pool.query(`DELETE FROM saas_financial_push_deliveries WHERE created_at<DATE_SUB(${BRASILIA_NOW_SQL},INTERVAL 90 DAY)`);
  return{sent,failed,skipped:false};
}
