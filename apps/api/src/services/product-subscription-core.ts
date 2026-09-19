export type SubscriptionBillingLike={
  status?:string|null;
  monthlyPrice?:number|null;
  discountPercent?:number|null;
  nextDueDate?:string|null;
  startsAt?:string|null;
  currentPeriodStart?:string|null;
  firstCycleProrataEnabled?:boolean|number|null;
  billingProvider?:string|null;
  billingMethod?:string|null;
};
export type ProductBillingPair={provider:string|null;method:string|null};
export type ProductBillingConnection={enabledByEnvironment:boolean;configured:boolean};
export type FirstCycleProrataResult={
  enabled:boolean;
  isProrata:boolean;
  fullAmount:number;
  amount:number;
  periodStart:string|null;
  periodEnd:string|null;
  prorataDays:number|null;
  cycleDays:number|null;
  ratio:number;
};
const paymentSelectionError=(message:string,code:string,status=409)=>Object.assign(new Error(message),{code,status});

export function effectiveSubscriptionPrice(s:SubscriptionBillingLike){
  const price=Math.max(0,Number(s.monthlyPrice||0));
  const discount=Math.min(100,Math.max(0,Number(s.discountPercent||0)));
  return Math.round(price*(1-discount/100)*100)/100;
}
export function canGenerateAutomaticCharge(s:SubscriptionBillingLike){
  return ['ACTIVE','GRACE'].includes(String(s.status||'').toUpperCase())&&Boolean(s.nextDueDate)&&effectiveSubscriptionPrice(s)>0;
}
function scopePair(provider:unknown,method:unknown,label:string){
  const p=provider?String(provider):null,m=method?String(method):null;
  if(Boolean(p)!==Boolean(m))throw paymentSelectionError(`Defina provedor e método juntos em ${label}.`,'PAYMENT_SELECTION_INCOMPLETE',400);
  return p&&m?{provider:p,method:m}:null;
}
export function resolveProductPaymentSelection(s:any,p:any,g:any){
  const subscription=scopePair(s?.billingProvider??s?.billing_provider,s?.billingMethod??s?.billing_method,'assinatura');if(subscription)return subscription;
  const product=scopePair(p?.defaultProvider??p?.default_provider,p?.defaultMethod??p?.default_payment_method,'produto');if(product)return product;
  const global=scopePair(g?.provider,g?.method,'padrão global');if(global)return global;
  throw paymentSelectionError('Defina provedor e método de pagamento para esta assinatura, produto ou padrão global.','PAYMENT_SELECTION_MISSING');
}
export function validateProductBillingPair(selection:ProductBillingPair,connection:ProductBillingConnection){
  const provider=selection.provider?String(selection.provider):null,method=selection.method?String(selection.method):null;
  if(!provider&&!method)return{provider:null,method:null};
  if(!provider||!method)throw paymentSelectionError('Informe provedor e método de pagamento juntos.','PAYMENT_SELECTION_INCOMPLETE',400);
  if(!connection.enabledByEnvironment)throw paymentSelectionError('O provedor selecionado está desativado no servidor.','PROVIDER_DISABLED');
  if(!connection.configured)throw paymentSelectionError('O provedor selecionado ainda não possui todas as credenciais necessárias.','PROVIDER_NOT_CONFIGURED');
  return{provider,method};
}

function isoDateOnly(value:string|Date|null|undefined){
  if(!value)return null;
  const raw=value instanceof Date?value.toISOString():String(value);
  const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m)return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}
function utcDate(value:string){
  const [year,month,day]=value.split('-').map(Number);
  return new Date(Date.UTC(year,month-1,day));
}
function diffCalendarDays(from:string,to:string){
  return Math.round((utcDate(to).getTime()-utcDate(from).getTime())/86400000);
}
function previousCalendarMonthDate(dateLike:string){
  const m=dateLike.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m)throw new Error('Data de período inválida.');
  const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
  const targetMonth=month===1?12:month-1,targetYear=month===1?year-1:year;
  const last=new Date(Date.UTC(targetYear,targetMonth,0)).getUTCDate();
  return `${targetYear}-${String(targetMonth).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`;
}

/**
 * Calcula o primeiro ciclo proporcional usando a quantidade real de dias do ciclo
 * entre o vencimento anterior e o primeiro vencimento.
 * Ex.: início 20/09 e vencimento 10/10 => 20 dias de um ciclo de 30 dias.
 */
export function calculateFirstCycleProrata(s:SubscriptionBillingLike):FirstCycleProrataResult{
  const fullAmount=effectiveSubscriptionPrice(s);
  const enabled=s.firstCycleProrataEnabled===true||Number(s.firstCycleProrataEnabled)===1;
  const startsAt=isoDateOnly(s.startsAt),currentStart=isoDateOnly(s.currentPeriodStart),dueDate=isoDateOnly(s.nextDueDate);
  const base:FirstCycleProrataResult={enabled,isProrata:false,fullAmount,amount:fullAmount,periodStart:startsAt,periodEnd:dueDate,prorataDays:null,cycleDays:null,ratio:1};
  if(!enabled||!startsAt||!dueDate||fullAmount<=0)return base;
  // Depois que o primeiro pagamento avança current_period_start para o vencimento,
  // o pró-rata não deve voltar a ser aplicado.
  if(currentStart&&currentStart!==startsAt)return base;
  if(diffCalendarDays(startsAt,dueDate)<=0)return base;
  const previousDue=previousCalendarMonthDate(dueDate);
  const cycleDays=diffCalendarDays(previousDue,dueDate);
  if(cycleDays<=0)return base;
  const rawDays=diffCalendarDays(startsAt,dueDate);
  const prorataDays=Math.min(cycleDays,Math.max(0,rawDays));
  if(prorataDays<=0)return{...base,prorataDays,cycleDays,ratio:0,amount:0,isProrata:true};
  const ratio=Math.min(1,prorataDays/cycleDays);
  const amount=Math.round((fullAmount*ratio+Number.EPSILON)*100)/100;
  return{enabled,isProrata:prorataDays<cycleDays,fullAmount,amount,periodStart:startsAt,periodEnd:dueDate,prorataDays,cycleDays,ratio};
}

export function addOneCalendarMonthIso(dateLike:string|Date){
  const d=new Date(dateLike);if(Number.isNaN(d.getTime()))throw new Error('Data de período inválida.');
  const year=d.getUTCFullYear(),month=d.getUTCMonth(),day=d.getUTCDate(); const targetMonth=month+1; const y=year+Math.floor(targetMonth/12),m=((targetMonth%12)+12)%12;
  const last=new Date(Date.UTC(y,m+1,0)).getUTCDate(); const out=new Date(d);out.setUTCFullYear(y,m,Math.min(day,last));return out.toISOString();
}
export function addOneCalendarMonthDate(dateLike:string|Date){
  const raw=dateLike instanceof Date?dateLike.toISOString():String(dateLike);
  const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m)throw new Error('Data de período inválida.');
  const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
  const targetMonth=month===12?1:month+1,targetYear=month===12?year+1:year;
  const last=new Date(Date.UTC(targetYear,targetMonth,0)).getUTCDate();
  const clipped=Math.min(day,last);
  return `${targetYear}-${String(targetMonth).padStart(2,'0')}-${String(clipped).padStart(2,'0')}`;
}
