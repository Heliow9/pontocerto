import type { PaymentMethodCode, PaymentProviderCode, ProviderCapabilities, ProviderChargeSnapshot, ProviderLocalStatus } from "./payment-provider.types.js";

export const PROVIDER_LABELS: Record<PaymentProviderCode,string> = {
  CORA: "Cora",
  EFI: "Efí Bank",
  MERCADO_PAGO: "Mercado Pago",
};

export const PROVIDER_CAPABILITIES: Record<PaymentProviderCode,ProviderCapabilities> = {
  CORA: { pix:true,boleto:true,hybridBoletoPix:true,pdf:true,hostedCheckout:false,webhook:true },
  EFI: { pix:true,boleto:true,hybridBoletoPix:true,pdf:true,hostedCheckout:true,webhook:true },
  MERCADO_PAGO: { pix:true,boleto:true,hybridBoletoPix:false,pdf:false,hostedCheckout:true,webhook:true },
};

export function isPaymentProviderCode(value: unknown): value is PaymentProviderCode {
  return value === "CORA" || value === "EFI" || value === "MERCADO_PAGO";
}
export function isPaymentMethodCode(value: unknown): value is PaymentMethodCode {
  return value === "HYBRID" || value === "PIX" || value === "BOLETO";
}
export function methodSupported(provider: PaymentProviderCode, method: PaymentMethodCode) {
  const c=PROVIDER_CAPABILITIES[provider];
  return method === "HYBRID" ? c.hybridBoletoPix : method === "PIX" ? c.pix : c.boleto;
}
export function assertProviderMethod(provider: PaymentProviderCode, method: PaymentMethodCode) {
  if(!methodSupported(provider,method)) throw Object.assign(new Error(`${PROVIDER_LABELS[provider]} não suporta o método ${method}.`),{status:409,code:"PAYMENT_METHOD_UNSUPPORTED"});
}
export function providerStatusToChargeStatus(status: ProviderLocalStatus): "ISSUING"|"OPEN"|"PAID"|"CANCELED"|"FAILED" {
  return status === "PROCESSING" ? "ISSUING" : status;
}
export function validateProviderSnapshot(input:{localAmount:number;externalReference:string;snapshot:ProviderChargeSnapshot}) {
  const cents=(v:number|null|undefined)=>v==null?null:Math.round(v*100);
  if(!input.snapshot.providerChargeId)return {action:"HOLD" as const,reason:"Cobrança do provedor sem identificador."};
  if(input.snapshot.externalReference && input.snapshot.externalReference !== input.externalReference)return {action:"HOLD" as const,reason:"A referência externa retornada pelo provedor não corresponde à cobrança local."};
  if(input.snapshot.nominalAmount!=null && cents(input.snapshot.nominalAmount)!==cents(input.localAmount))return {action:"HOLD" as const,reason:"O valor nominal retornado pelo provedor diverge da cobrança local."};
  if(input.snapshot.status==="PAID"){
    if(input.snapshot.receivedAmount!=null && cents(input.snapshot.receivedAmount)!==cents(input.localAmount))return {action:"HOLD" as const,reason:"O valor recebido não corresponde ao valor integral da cobrança."};
    return {action:"PAY" as const,reason:null};
  }
  return {action:"SYNC" as const,reason:null};
}
