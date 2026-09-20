export type MovyoImportStatus='READY_TO_MIGRATE'|'PENDING_DATA'|'CONFLICT'|'ALREADY_IMPORTED';
export type MovyoRemoteCustomer={
  id?:string|number|null;
  nome?:string|null;
  cnpj?:string|null;
  email?:string|null;
  telefone?:string|null;
  emailCobranca?:string|null;
  enderecoCep?:string|null;
  enderecoRua?:string|null;
  enderecoNumero?:string|null;
  enderecoComplemento?:string|null;
  enderecoBairro?:string|null;
  enderecoCidade?:string|null;
  enderecoEstado?:string|null;
  plano?:string|null;
  statusAssinatura?:string|null;
  dataInicioPlano?:string|null;
  dataFimPlano?:string|null;
  valorMensalidadeCustomizado?:unknown;
  descontoMensalidadePercentual?:unknown;
  billingSource?:string|null;
  [key:string]:unknown;
};

const text=(value:unknown)=>{const result=String(value??'').trim();return result||null;};
const digits=(value:unknown)=>String(value??'').replace(/\D/g,'');
const email=(value:unknown)=>text(value)?.toLowerCase()??null;
const finiteNumber=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)?n:null;};
const positiveMoney=(value:unknown)=>{const n=finiteNumber(value);return n!=null&&n>0?Math.round(n*100)/100:null;};
const percent=(value:unknown)=>{const n=finiteNumber(value);if(n==null)return 0;return Math.min(100,Math.max(0,n));};
const isoDate=(value:unknown)=>{const s=text(value);if(!s)return null;const m=s.match(/^\d{4}-\d{2}-\d{2}/);return m?m[0]:null;};
const validEmail=(value:unknown)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value??''));

export function mapMovyoCustomer(remote:MovyoRemoteCustomer){
  const document=digits(remote.cnpj)||null;
  const financialContactEmail=email(remote.emailCobranca)||email(remote.email);
  const currentPeriodEnd=text(remote.dataFimPlano);
  const state=text(remote.enderecoEstado)?.toUpperCase()??null;
  return{
    externalId:String(remote.id??'').trim(),
    customer:{
      legalName:text(remote.nome)||'',
      tradeName:text(remote.nome),
      personType:document?.length===11?'PF' as const:'PJ' as const,
      document,
      email:email(remote.email),
      phone:digits(remote.telefone)||null,
      financialContactName:null,
      financialContactDocument:null,
      financialContactEmail,
      financialContactPhone:digits(remote.telefone)||null,
      zipCode:digits(remote.enderecoCep)||null,
      street:text(remote.enderecoRua),
      number:text(remote.enderecoNumero),
      complement:text(remote.enderecoComplemento),
      district:text(remote.enderecoBairro),
      city:text(remote.enderecoCidade),
      state,
      status:'ACTIVE',
    },
    planCode:text(remote.plano)?.toLowerCase()??null,
    statusAssinatura:text(remote.statusAssinatura)?.toLowerCase()??null,
    startsAt:text(remote.dataInicioPlano),
    currentPeriodEnd,
    nextDueDate:isoDate(currentPeriodEnd),
    monthlyPriceOverride:positiveMoney(remote.valorMensalidadeCustomizado),
    discountPercent:percent(remote.descontoMensalidadePercentual),
    billingSource:text(remote.billingSource)||'MOVYO_LEGACY',
  };
}

export function missingCommercialBillingFields(c:ReturnType<typeof mapMovyoCustomer>['customer']){
  const missing:string[]=[];
  if(!c.legalName)missing.push('legalName');
  if(!c.document||![11,14].includes(c.document.length))missing.push('document');
  if(!c.financialContactEmail||!validEmail(c.financialContactEmail))missing.push('financialContactEmail');
  if(!c.zipCode||c.zipCode.length!==8)missing.push('zipCode');
  if(!c.street)missing.push('street');
  if(!c.number)missing.push('number');
  if(!c.district)missing.push('district');
  if(!c.city)missing.push('city');
  if(!c.state||c.state.length!==2)missing.push('state');
  return missing;
}

export function missingMovyoBillingFields(mapped:ReturnType<typeof mapMovyoCustomer>){
  return missingCommercialBillingFields(mapped.customer);
}

export function classifyMovyoImport(remote:MovyoRemoteCustomer,context:{matchCount?:number;alreadyImported?:boolean}):MovyoImportStatus{
  if(context.alreadyImported)return'ALREADY_IMPORTED';
  if(Number(context.matchCount||0)>1)return'CONFLICT';
  const mapped=mapMovyoCustomer(remote);
  return missingMovyoBillingFields(mapped).length?'PENDING_DATA':'READY_TO_MIGRATE';
}
