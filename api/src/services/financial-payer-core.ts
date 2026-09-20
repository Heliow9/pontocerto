import type { PaymentMethodCode, PaymentProviderCode, ProviderPayer } from './payment-provider.types.js';

export type FinancialPayerSource='TENANT'|'COMMERCIAL'|'EXTERNAL';
export type FinancialPersonType='PF'|'PJ';
export type FinancialPayerInput={
  source:FinancialPayerSource;
  personType:FinancialPersonType;
  name:string;
  document:string;
  email?:string|null;
  phone?:string|null;
  zipCode?:string|null;
  street?:string|null;
  number?:string|null;
  complement?:string|null;
  district?:string|null;
  city?:string|null;
  state?:string|null;
};
export type FinancialPayerSnapshot={
  source:FinancialPayerSource;
  personType:FinancialPersonType;
  name:string;
  document:string;
  email:string|null;
  phone:string|null;
  zipCode:string|null;
  street:string|null;
  number:string|null;
  complement:string|null;
  district:string|null;
  city:string|null;
  state:string|null;
};

const digits=(value:unknown)=>String(value??'').replace(/\D/g,'');
const text=(value:unknown)=>{const v=String(value??'').trim();return v||null;};
const email=(value:unknown)=>{const v=String(value??'').trim().toLowerCase();return v||null;};

export function normalizeFinancialPayer(input:FinancialPayerInput):FinancialPayerSnapshot{
  const document=digits(input.document);
  if(input.personType==='PF'&&document.length!==11)throw new Error('CPF do pagador deve possuir 11 dígitos.');
  if(input.personType==='PJ'&&document.length!==14)throw new Error('CNPJ do pagador deve possuir 14 dígitos.');
  const name=String(input.name??'').trim();
  if(!name)throw new Error('Informe o nome ou razão social do pagador.');
  const state=text(input.state)?.toUpperCase()??null;
  if(state&&state.length!==2)throw new Error('UF do pagador deve possuir 2 letras.');
  return{
    source:input.source,
    personType:input.personType,
    name,
    document,
    email:email(input.email),
    phone:digits(input.phone)||null,
    zipCode:digits(input.zipCode)||null,
    street:text(input.street),
    number:text(input.number),
    complement:text(input.complement),
    district:text(input.district),
    city:text(input.city),
    state,
  };
}

export function payerFromBillingProfile(profile:any):FinancialPayerSnapshot{
  const document=digits(profile.billingDocument??profile.billing_document);
  const personType:FinancialPersonType=document.length===11?'PF':'PJ';
  return{
    source:'TENANT',personType,
    name:String(profile.billingLegalName??profile.billing_legal_name??profile.tenantName??profile.tenant_name??'').trim(),
    document,
    email:email(profile.financialContactEmail??profile.financial_contact_email??profile.billingEmail??profile.billing_email??null),
    phone:digits(profile.financialContactPhone??profile.financial_contact_phone??profile.billingPhone??profile.billing_phone)||null,
    zipCode:digits(profile.billingZipCode??profile.billing_zip_code)||null,
    street:text(profile.billingStreet??profile.billing_street),
    number:text(profile.billingNumber??profile.billing_number),
    complement:text(profile.billingComplement??profile.billing_complement),
    district:text(profile.billingDistrict??profile.billing_district),
    city:text(profile.billingCity??profile.billing_city),
    state:text(profile.billingState??profile.billing_state)?.toUpperCase()??null,
  };
}


export function payerFromCommercialCustomer(customer:any):FinancialPayerSnapshot{
  const document=digits(customer.document??customer.customer_document);
  const personType:FinancialPersonType=document.length===11?'PF':'PJ';
  return{
    source:'COMMERCIAL',personType,
    name:String(customer.legal_name??customer.customer_name??'').trim(),
    document,
    email:email(customer.financial_contact_email??customer.email??customer.customer_email??null),
    phone:digits(customer.financial_contact_phone??customer.phone??customer.customer_phone)||null,
    zipCode:digits(customer.zip_code)||null,
    street:text(customer.street),number:text(customer.number),complement:text(customer.complement),district:text(customer.district),city:text(customer.city),state:text(customer.state)?.toUpperCase()??null,
  };
}

export function missingPayerFieldsForMethod(payer:FinancialPayerSnapshot,provider:PaymentProviderCode,method:PaymentMethodCode){
  const missing:string[]=[];
  if(!payer.name)missing.push('name');
  if(!payer.document||(payer.personType==='PF'&&payer.document.length!==11)||(payer.personType==='PJ'&&payer.document.length!==14))missing.push('document');
  if(provider==='MERCADO_PAGO'&&method==='BOLETO'){
    if(!payer.email)missing.push('email');
    for(const key of ['zipCode','street','number','district','city','state'] as const)if(!payer[key])missing.push(key);
  }
  return missing;
}

export function billingProfileCompleteness(profile:any){
  const required=['billingLegalName','billingDocument','financialContactName','financialContactEmail','billingZipCode','billingStreet','billingNumber','billingDistrict','billingCity','billingState'];
  const aliases:Record<string,string>={
    billingLegalName:'billing_legal_name',billingDocument:'billing_document',financialContactName:'financial_contact_name',financialContactEmail:'financial_contact_email',
    billingZipCode:'billing_zip_code',billingStreet:'billing_street',billingNumber:'billing_number',billingDistrict:'billing_district',billingCity:'billing_city',billingState:'billing_state',
  };
  const missing=required.filter(key=>!String(profile?.[key]??profile?.[aliases[key]]??'').trim());
  return{complete:missing.length===0,missing};
}

export function providerPayerFromSnapshot(payer:FinancialPayerSnapshot):ProviderPayer{
  return{document:payer.document,name:payer.name,email:payer.email,phone:payer.phone,address:payer.street,number:payer.number,complement:payer.complement,district:payer.district,city:payer.city,state:payer.state,zipCode:payer.zipCode};
}
