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
