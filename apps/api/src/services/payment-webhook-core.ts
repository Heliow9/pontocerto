import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProviderCode } from "./payment-provider.types.js";

export function stableWebhookEventKey(provider:PaymentProviderCode,payload:unknown,explicit?:string|null){
  if(explicit&&String(explicit).trim())return String(explicit).slice(0,190);
  return createHash("sha256").update(`${provider}:${JSON.stringify(payload??null)}`).digest("hex");
}
export function mercadoPagoSignatureValid(input:{signature?:string|null;requestId?:string|null;dataId?:string|null;secret?:string|null}){
  if(!input.secret)return false;
  if(!input.signature||!input.requestId||!input.dataId)return false;
  const parts=Object.fromEntries(input.signature.split(",").map(part=>part.split("=",2).map(v=>v.trim())).filter(pair=>pair.length===2));
  const ts=parts.ts, received=parts.v1;if(!ts||!received)return false;
  const manifest=`id:${String(input.dataId).toLowerCase()};request-id:${input.requestId};ts:${ts};`;
  const expected=createHmac("sha256",input.secret).update(manifest).digest("hex");
  try{return timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(received,"hex"));}catch{return false;}
}

export type MercadoPagoNotificationResource={
  paymentId:string|null;
  mode:"WEBHOOK"|"IPN"|"UNKNOWN";
  topic:string|null;
};

export function resolveMercadoPagoNotificationResource(payload:any,query:Record<string,any>={}):MercadoPagoNotificationResource{
  const explicitDataId=query["data.id"]??query.data_id??payload?.data?.id;
  const topic=String(query.type??query.topic??payload?.type??"").trim().toLowerCase()||null;
  if(explicitDataId!=null&&String(explicitDataId).trim()){
    return{paymentId:String(explicitDataId).trim(),mode:"WEBHOOK",topic};
  }
  const legacyId=query.id;
  if(legacyId!=null&&String(legacyId).trim()&&["payment","payments"].includes(String(topic||""))){
    return{paymentId:String(legacyId).trim(),mode:"IPN",topic};
  }
  return{paymentId:null,mode:"UNKNOWN",topic};
}
