import { pool } from '../db/pool.js';
import { BRASILIA_NOW_SQL } from '../utils/db-time.js';
import { buildFinancialChargeEmailContent, resolveChargeRecipient } from './financial-email-core.js';
import { sendSmtpMessage } from './commercial-email.service.js';
import { sanitizeSmtpError } from './commercial-email-core.js';
import { getCharge, recordFinancialEvent } from './financial.service.js';

const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const err=(message:string,status=400,code='FINANCIAL_EMAIL_ERROR')=>Object.assign(new Error(message),{status,code});

export type FinancialDeliveryType='AUTO'|'MANUAL';
export async function listChargeDeliveries(chargeId:number){
  const [rows]=await pool.query<any[]>(`SELECT d.*,u.name AS sent_by_name FROM financial_charge_deliveries d LEFT JOIN users u ON u.id=d.sent_by WHERE d.charge_id=? ORDER BY d.created_at DESC,d.id DESC`,[chargeId]);
  return rows.map((r:any)=>({...r,id:Number(r.id),charge_id:Number(r.charge_id),tenant_id:r.tenant_id==null?null:Number(r.tenant_id),sent_by:r.sent_by==null?null:Number(r.sent_by)}));
}

export async function sendFinancialChargeEmail(input:{chargeId:number;deliveryType:FinancialDeliveryType;actorUserId?:number|null;to?:string|null;cc?:string|null}){
  const charge=await getCharge(input.chargeId);
  const hasArtifact=Boolean(charge.provider_charge_id||charge.provider_payment_url||charge.provider_pdf_url||charge.digitable_line||charge.pix_copy_paste);
  if(['DRAFT','ISSUING','FAILED'].includes(charge.status)&&!hasArtifact)throw err('A cobrança ainda não foi emitida e não pode ser enviada por e-mail.',409,'CHARGE_NOT_ISSUED');
  const to=resolveChargeRecipient(charge,input.to);
  const cc=String(input.cc||'').trim().toLowerCase()||null;
  if(cc&&!emailRe.test(cc))throw err('E-mail em cópia (CC) inválido.',400,'INVALID_CC_EMAIL');
  const content=buildFinancialChargeEmailContent(charge);
  const [created]=await pool.query<any>(`INSERT INTO financial_charge_deliveries(charge_id,tenant_id,recipient_email,cc_email,subject,delivery_type,status,sent_by,created_at) VALUES(?,?,?,?,?,?,'PENDING',?,${BRASILIA_NOW_SQL})`,[input.chargeId,charge.tenant_id,to,cc,content.subject,input.deliveryType,input.actorUserId||null]);
  const deliveryId=Number(created.insertId);
  try{
    const sent=await sendSmtpMessage({to,cc,subject:content.subject,text:content.text,html:content.html});
    await pool.query(`UPDATE financial_charge_deliveries SET status='SENT',smtp_message_id=?,sent_at=${BRASILIA_NOW_SQL} WHERE id=?`,[sent.messageId||null,deliveryId]);
    await recordFinancialEvent({tenantId:charge.tenant_id,chargeId:input.chargeId,eventType:'CHARGE_EMAIL_SENT',actorUserId:input.actorUserId||null,details:{deliveryId,to,cc,deliveryType:input.deliveryType,messageId:sent.messageId||null}});
    return{id:deliveryId,status:'SENT' as const,to,cc,messageId:sent.messageId||null};
  }catch(error:any){
    const message=sanitizeSmtpError(error);
    await pool.query(`UPDATE financial_charge_deliveries SET status='FAILED',error_message=? WHERE id=?`,[message.slice(0,500),deliveryId]);
    await recordFinancialEvent({tenantId:charge.tenant_id,chargeId:input.chargeId,eventType:'CHARGE_EMAIL_FAILED',actorUserId:input.actorUserId||null,details:{deliveryId,to,cc,deliveryType:input.deliveryType,message}});
    throw Object.assign(new Error(message),{status:error?.status||502,code:'CHARGE_EMAIL_FAILED',deliveryId});
  }
}
