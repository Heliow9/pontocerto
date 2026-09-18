import { createHash } from "node:crypto";

function normalize(value: any): any {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,normalize(value[key])]));
  return value;
}

export function canonicalJson(value: unknown) { return JSON.stringify(normalize(value)); }

function root(payload:any){return payload?.cobranca||payload?.data?.cobranca||payload?.data||payload||{};}
export function providerReferenceFromWebhook(payload:any){const p=root(payload);return{providerChargeId:p.codigoSolicitacao?String(p.codigoSolicitacao):null,yourNumber:p.seuNumero?String(p.seuNumero):null};}
export function normalizePaymentOrigin(value: unknown): "PIX"|"BOLETO"|null { const s=String(value||"").toUpperCase(); return s==="PIX"?"PIX":s==="BOLETO"?"BOLETO":null; }

export function interWebhookEventKey(payload:any){
  const p=root(payload);
  const explicit=p.idEvento||p.eventId||p.id;
  if(explicit)return `event:${String(explicit)}`;
  const stable=[p.codigoSolicitacao,p.seuNumero,p.situacao||p.status,p.dataHoraSituacao||p.dataHora||p.dataRecebimento,p.origemRecebimento,p.valorTotalRecebimento||p.valorRecebido]
    .map(v=>v==null?"":String(v)).join("|");
  const source=stable.replace(/\|/g,"").length?stable:canonicalJson(payload);
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}
