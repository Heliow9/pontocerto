export function shouldGenerateMonthly(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Data inválida.");
  return date.endsWith("-01");
}
export function financialWorkerDateContext(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Data inválida.");
  return { date, competence: date.slice(0, 7), generateMonthly: shouldGenerateMonthly(date) };
}

export function shouldAttemptAutomaticDelivery(input:{alreadyExists:boolean;autoEmailCharges:boolean;sendEmailAfterIssue:boolean;status:string;lastDeliveryStatus?:string|null}){
  if(input.alreadyExists)return false;
  if(!input.autoEmailCharges||!input.sendEmailAfterIssue)return false;
  return ['OPEN','OVERDUE','PAID'].includes(input.status);
}

export function shouldGenerateProductMonthly(input:{billingSource?:string|null;status?:string|null;nextDueDate?:string|null;today:string}){
  const source=String(input.billingSource||'').toUpperCase();
  const status=String(input.status||'').toUpperCase();
  const due=String(input.nextDueDate||'').slice(0,10);
  if(source!=='PONTO_CERTO')return false;
  if(!['ACTIVE','GRACE'].includes(status))return false;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!/^\d{4}-\d{2}-\d{2}$/.test(input.today))return false;
  return due.slice(0,7)===input.today.slice(0,7);
}

export function productSubscriptionFinancialState(input:{chargeStatus?:string|null;dueDate?:string|null;blockAt?:string|null;autoBlock?:boolean;graceUntil?:string|null;today:string}):'ACTIVE'|'GRACE'|'BLOCKED'{
  const chargeStatus=String(input.chargeStatus||'').toUpperCase();
  const today=String(input.today).slice(0,10);
  const due=String(input.dueDate||'').slice(0,10);
  const blockAt=String(input.blockAt||'').slice(0,10);
  const graceUntil=String(input.graceUntil||'').slice(0,10);
  if(['PAID','CANCELED',''].includes(chargeStatus))return'ACTIVE';
  if(!due||today<=due)return'ACTIVE';
  if(graceUntil&&today<=graceUntil)return'GRACE';
  if(input.autoBlock===false)return'GRACE';
  if(blockAt&&today>=blockAt)return'BLOCKED';
  return'GRACE';
}
