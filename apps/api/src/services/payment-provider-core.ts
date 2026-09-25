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

/** Valor mínimo conhecido para emissão no provedor.
 * A Cora exige pelo menos R$ 5,00 nas modalidades que geram boleto
 * (boleto simples ou Boleto + Pix/BolePix). Pix puro não é restringido aqui.
 */
export function providerMinimumIssueAmount(provider: PaymentProviderCode, method: PaymentMethodCode): number | null {
  return provider === "CORA" && (method === "BOLETO" || method === "HYBRID") ? 5 : null;
}

export function providerMinimumIssueMessage(provider: PaymentProviderCode, method: PaymentMethodCode): string | null {
  const minimum=providerMinimumIssueAmount(provider,method);
  if(minimum==null)return null;
  const label=method === "HYBRID" ? "Boleto + Pix (BolePix)" : "boleto";
  return `${PROVIDER_LABELS[provider]} exige valor mínimo de R$ ${minimum.toFixed(2).replace(".",",")} para emissão de ${label}.`;
}

export function assertProviderIssueAmount(provider: PaymentProviderCode, method: PaymentMethodCode, amount: number) {
  const minimum=providerMinimumIssueAmount(provider,method);
  if(minimum==null)return;
  const numeric=Number(amount);
  if(Number.isFinite(numeric)&&Math.round(numeric*100)>=Math.round(minimum*100))return;
  throw Object.assign(new Error(providerMinimumIssueMessage(provider,method)!),{
    status:422,code:"PROVIDER_MINIMUM_AMOUNT",provider,method,minimumAmount:minimum,
  });
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
    const received=cents(input.snapshot.receivedAmount),nominal=cents(input.localAmount);
    if(received!=null&&received!==nominal){
      let expected:number|null=null;
      if(input.snapshot.provider==="CORA"&&received>Number(nominal)){
        expected=Number(nominal)+(cents(input.snapshot.paidFine)||0)+(cents(input.snapshot.paidInterest)||0);
      }else if(input.snapshot.provider==="CORA"&&received<Number(nominal)){
        const fixed=cents(input.snapshot.configuredDiscountAmount);
        const percent=Number(input.snapshot.configuredDiscountPercent||0);
        if(fixed!=null&&fixed>0)expected=Math.max(0,Number(nominal)-fixed);
        else if(percent>0)expected=Math.max(0,Number(nominal)-Math.round(Number(nominal)*(percent/100)));
      }
      if(expected==null||received!==expected)return {action:"HOLD" as const,reason:"O valor recebido não corresponde ao valor nominal nem aos ajustes configurados no provedor."};
    }
    return {action:"PAY" as const,reason:null};
  }
  return {action:"SYNC" as const,reason:null};
}
