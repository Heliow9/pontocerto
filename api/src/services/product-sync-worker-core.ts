export type LocalMovyoSubscriptionState={
  subscriptionId:number|string;
  commercialCustomerId:number|string;
  status:string;
  currentPeriodEnd?:string|null;
  graceUntil?:string|null;
};
export type RemoteMovyoLicenseState={
  billingSource?:string|null;
  billingStatus?:string|null;
  billingAccessBlocked?:boolean|null;
  billingCurrentPeriodEnd?:string|null;
  billingGraceUntil?:string|null;
  pontoCertoCustomerId?:string|number|null;
  pontoCertoSubscriptionId?:string|number|null;
};
export type ReconcileDecision={action:'NONE'|'SYNC'|'CONFLICT'|'MISSING';differences:string[]};

const dateKey=(value:unknown)=>{
  if(!value)return null;
  const raw=String(value);const m=raw.match(/^(\d{4}-\d{2}-\d{2})/);if(m)return m[1];
  const d=new Date(raw);return Number.isNaN(d.getTime())?raw:d.toISOString().slice(0,10);
};
const expectedState=(status:unknown)=>{
  const s=String(status||'ACTIVE').toUpperCase();
  if(s==='CANCELED')return{billingStatus:'CANCELED',billingAccessBlocked:true};
  if(['BLOCKED','PAST_DUE','SUSPENDED'].includes(s))return{billingStatus:'BLOCKED',billingAccessBlocked:true};
  if(s==='GRACE')return{billingStatus:'GRACE',billingAccessBlocked:false};
  return{billingStatus:'ACTIVE',billingAccessBlocked:false};
};
const idConflict=(remote:unknown,local:unknown)=>remote!=null&&String(remote)!==''&&String(remote)!==String(local);

export function decideMovyoReconciliation(local:LocalMovyoSubscriptionState,remote:RemoteMovyoLicenseState|null|undefined):ReconcileDecision{
  if(!remote)return{action:'MISSING',differences:['remoteCustomer']};
  if(idConflict(remote.pontoCertoCustomerId,local.commercialCustomerId)||idConflict(remote.pontoCertoSubscriptionId,local.subscriptionId))return{action:'CONFLICT',differences:['identity']};
  const expected=expectedState(local.status),differences:string[]=[];
  if(String(remote.billingSource||'').toUpperCase()!=='PONTO_CERTO')differences.push('billingSource');
  if(String(remote.billingStatus||'').toUpperCase()!==expected.billingStatus)differences.push('billingStatus');
  if(Boolean(remote.billingAccessBlocked)!==expected.billingAccessBlocked)differences.push('billingAccessBlocked');
  if(dateKey(remote.billingCurrentPeriodEnd)!==dateKey(local.currentPeriodEnd))differences.push('billingCurrentPeriodEnd');
  if(dateKey(remote.billingGraceUntil)!==dateKey(local.graceUntil))differences.push('billingGraceUntil');
  return{action:differences.length?'SYNC':'NONE',differences};
}

export async function runBounded<T,R>(items:T[],limit:number,worker:(item:T,index:number)=>Promise<R>){
  const results:Array<{index:number;ok:true;value:R}|{index:number;ok:false;error:unknown}>=new Array(items.length);
  let next=0;
  async function consume(){
    for(;;){
      const index=next++;if(index>=items.length)return;
      try{results[index]={index,ok:true,value:await worker(items[index],index)};}catch(error){results[index]={index,ok:false,error};}
    }
  }
  const count=Math.max(1,Math.min(Number(limit)||1,items.length||1));
  await Promise.all(Array.from({length:count},()=>consume()));
  return results;
}
