const digits=(value:unknown)=>String(value??'').replace(/\D/g,'');
const text=(value:unknown)=>String(value??'').trim();
const validEmail=(value:unknown)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value));
const isoDate=(value:unknown)=>{const match=text(value).match(/^(\d{4})-(\d{2})-(\d{2})/);if(!match)throw Object.assign(new Error('Data de início inválida.'),{status:400,code:'PRODUCT_START_DATE_INVALID'});return`${match[1]}-${match[2]}-${match[3]}`;};
const pad=(n:number)=>String(n).padStart(2,'0');
const daysInMonth=(year:number,month:number)=>new Date(Date.UTC(year,month,0)).getUTCDate();
function dateParts(value:string){const [year,month,day]=value.split('-').map(Number);return{year,month,day};}
function dateWithDay(year:number,month:number,day:number){const clipped=Math.min(Math.max(1,day),daysInMonth(year,month));return`${year}-${pad(month)}-${pad(clipped)}`;}
function nextMonth(year:number,month:number){return month===12?{year:year+1,month:1}:{year,month:month+1};}
export function addCalendarDays(value:string,days:number){const {year,month,day}=dateParts(isoDate(value));const date=new Date(Date.UTC(year,month-1,day));date.setUTCDate(date.getUTCDate()+Math.max(0,Math.trunc(days||0)));return`${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())}`;}

export function firstProductDueDate(startDate:unknown,dueDay:unknown){
  const start=isoDate(startDate),parts=dateParts(start),wanted=Math.min(31,Math.max(1,Math.trunc(Number(dueDay)||parts.day)));
  let candidate=dateWithDay(parts.year,parts.month,wanted);
  if(candidate<=start){const next=nextMonth(parts.year,parts.month);candidate=dateWithDay(next.year,next.month,wanted);}
  return candidate;
}

export function missingMovyoCommercialCustomerFields(customer:any){
  const missing:string[]=[];const document=digits(customer?.document);const email=customer?.financial_contact_email||customer?.email;const zip=digits(customer?.zip_code);
  if(!text(customer?.legal_name))missing.push('legal_name');
  if(![11,14].includes(document.length))missing.push('document');
  if(!validEmail(email))missing.push('financial_contact_email');
  if(zip.length!==8)missing.push('zip_code');
  if(!text(customer?.street))missing.push('street');
  if(!text(customer?.number))missing.push('number');
  if(!text(customer?.district))missing.push('district');
  if(!text(customer?.city))missing.push('city');
  if(text(customer?.state).length!==2)missing.push('state');
  return missing;
}

export function assertMovyoProvisioningCustomer(customer:any){
  const missing=missingMovyoCommercialCustomerFields(customer);if(missing.length)throw Object.assign(new Error(`Complete o cadastro financeiro do Cliente Comercial antes de provisionar a Movyo: ${missing.join(', ')}.`),{status:409,code:'COMMERCIAL_CUSTOMER_BILLING_INCOMPLETE',missing});return true;
}

export function assertProductDocumentsReady(input:{contract:any;proposal:any}){
  const contractOk=Boolean(input.contract?.template_id&&input.contract?.template_version&&text(input.contract?.rendered_content));
  const proposalOk=Boolean(input.proposal?.template_id&&input.proposal?.template_version&&text(input.proposal?.rendered_content));
  if(!contractOk||!proposalOk)throw Object.assign(new Error('A proposta e o contrato do produto precisam estar gerados com os templates ativos antes do provisionamento.'),{status:409,code:'PRODUCT_DOCUMENTS_NOT_RENDERED',missing:[...(!proposalOk?['proposal']:[]),...(!contractOk?['contract']:[])]});
  return true;
}

export function buildMovyoProvisioningPayload(input:{customer:any;contract:any;proposal:any;productPlanCode:string;monthlyPrice:number;discountPercent?:number;commercialCustomerId:number|string;productSubscriptionId:number|string;graceDays?:number}){
  assertMovyoProvisioningCustomer(input.customer);assertProductDocumentsReady({contract:input.contract,proposal:input.proposal});
  const startsAt=isoDate(input.contract.start_date||input.contract.contract_date||new Date().toISOString().slice(0,10));
  const dueDate=firstProductDueDate(startsAt,input.contract.due_day||10),graceDays=Math.max(0,Math.trunc(Number(input.graceDays??3))),graceDate=addCalendarDays(dueDate,graceDays);
  return{
    nome:text(input.customer.legal_name),cnpj:digits(input.customer.document),email:text(input.customer.email||input.customer.financial_contact_email).toLowerCase(),telefone:digits(input.customer.phone||input.customer.financial_contact_phone),
    emailCobranca:text(input.customer.financial_contact_email||input.customer.email).toLowerCase(),financialEmail:text(input.customer.financial_contact_email||input.customer.email).toLowerCase(),
    enderecoCep:digits(input.customer.zip_code),enderecoRua:text(input.customer.street),enderecoNumero:text(input.customer.number),enderecoBairro:text(input.customer.district),enderecoCidade:text(input.customer.city),enderecoEstado:text(input.customer.state).toUpperCase().slice(0,2),
    planCode:text(input.productPlanCode).toLowerCase(),monthlyPrice:Number(input.monthlyPrice||0),discountPercent:Number(input.discountPercent||0),startsAt:`${startsAt}T00:00:00-03:00`,
    billingSource:'PONTO_CERTO',billingStatus:'GRACE',billingAccessBlocked:false,pontoCertoCustomerId:String(input.commercialCustomerId),pontoCertoSubscriptionId:String(input.productSubscriptionId),currentPeriodEnd:`${dueDate}T23:59:59-03:00`,graceUntil:`${graceDate}T23:59:59-03:00`,
  };
}
