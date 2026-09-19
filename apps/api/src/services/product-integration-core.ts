export type MovyoBillingCharge={id:number|string;status?:string|null;provider?:string|null;paymentMethod?:string|null;amount?:number|null;baseAmount?:number|null;isProrata?:boolean|null;prorataDays?:number|null;prorataCycleDays?:number|null;periodStart?:string|null;periodEnd?:string|null;dueDate?:string|null;paymentUrl?:string|null;pdfUrl?:string|null;digitableLine?:string|null;pixCopyPaste?:string|null;pixQrCode?:string|null};
export type MovyoBillingPayloadInput={pontoCertoCustomerId:number|string;subscriptionId:number|string;status:string;planCode?:string|null;monthlyPrice?:number|null;discountPercent?:number|null;currentPeriodEnd?:string|null;graceUntil?:string|null;charge?:MovyoBillingCharge|null};

export function mapSubscriptionOperationalState(status:unknown){
  const normalized=String(status||'ACTIVE').trim().toUpperCase();
  if(normalized==='CANCELED')return{billingStatus:'CANCELED',billingAccessBlocked:true};
  if(['BLOCKED','PAST_DUE','SUSPENDED'].includes(normalized))return{billingStatus:'BLOCKED',billingAccessBlocked:true};
  if(normalized==='GRACE')return{billingStatus:'GRACE',billingAccessBlocked:false};
  return{billingStatus:'ACTIVE',billingAccessBlocked:false};
}

export function buildMovyoBillingPayload(input:MovyoBillingPayloadInput){
  const state=mapSubscriptionOperationalState(input.status);
  const charge=input.charge?{
    id:String(input.charge.id),
    status:input.charge.status||null,
    provider:input.charge.provider||null,
    paymentMethod:input.charge.paymentMethod||null,
    amount:input.charge.amount==null?null:Number(input.charge.amount),
    baseAmount:input.charge.baseAmount==null?null:Number(input.charge.baseAmount),
    isProrata:Boolean(input.charge.isProrata),
    prorataDays:input.charge.prorataDays==null?null:Number(input.charge.prorataDays),
    prorataCycleDays:input.charge.prorataCycleDays==null?null:Number(input.charge.prorataCycleDays),
    periodStart:input.charge.periodStart||null,
    periodEnd:input.charge.periodEnd||null,
    dueDate:input.charge.dueDate||null,
    paymentUrl:input.charge.paymentUrl||null,
    pdfUrl:input.charge.pdfUrl||null,
    digitableLine:input.charge.digitableLine||null,
    pixCopyPaste:input.charge.pixCopyPaste||null,
    pixQrCode:input.charge.pixQrCode||null,
  }:null;
  return{
    pontoCertoCustomerId:String(input.pontoCertoCustomerId),
    pontoCertoSubscriptionId:String(input.subscriptionId),
    billingSource:'PONTO_CERTO',
    ...state,
    planCode:input.planCode||null,
    monthlyPrice:input.monthlyPrice==null?0:Number(input.monthlyPrice),
    discountPercent:input.discountPercent==null?0:Number(input.discountPercent),
    currentPeriodEnd:input.currentPeriodEnd||null,
    graceUntil:input.graceUntil||null,
    charge,
  };
}
