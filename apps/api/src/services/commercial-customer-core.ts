import {isValidBrazilDocument} from '../utils/brazil-document.js';
export type CommercialCustomerInput={
  legalName:string;tradeName?:string|null;personType?:'PF'|'PJ';document?:string|null;email?:string|null;phone?:string|null;
  financialContactName?:string|null;financialContactDocument?:string|null;financialContactEmail?:string|null;financialContactPhone?:string|null;
  zipCode?:string|null;street?:string|null;number?:string|null;complement?:string|null;district?:string|null;city?:string|null;state?:string|null;status?:string|null;
};
const digits=(v:unknown)=>String(v??'').replace(/\D/g,'');
const text=(v:unknown)=>{const s=String(v??'').trim();return s||null;};
const lower=(v:unknown)=>{const s=text(v);return s?.toLowerCase()??null;};
export function normalizeCommercialCustomer(input:CommercialCustomerInput){
  const legalName=String(input.legalName??'').trim(); if(!legalName)throw new Error('Informe a razão social ou nome do cliente comercial.');
  const document=digits(input.document)||null; const inferred=document?.length===11?'PF':'PJ'; const personType=input.personType||inferred;
  if(document&&!isValidBrazilDocument(document,personType))throw new Error(personType==='PF'?'CPF do cliente comercial inválido.':'CNPJ do cliente comercial inválido.');
  const state=text(input.state)?.toUpperCase()??null;if(state&&state.length!==2)throw new Error('UF deve possuir 2 letras.');
  const financialContactDocument=digits(input.financialContactDocument)||null;
  if(financialContactDocument&&!isValidBrazilDocument(financialContactDocument,'PF'))throw new Error('CPF do responsável financeiro inválido.');
  return{legalName,tradeName:text(input.tradeName),personType,document,email:lower(input.email),phone:digits(input.phone)||null,
    financialContactName:text(input.financialContactName),financialContactDocument,
    financialContactEmail:lower(input.financialContactEmail),financialContactPhone:digits(input.financialContactPhone)||null,
    zipCode:digits(input.zipCode)||null,street:text(input.street),number:text(input.number),complement:text(input.complement),district:text(input.district),city:text(input.city),state,status:text(input.status)||'ACTIVE'};
}
export function commercialCustomerCompleteness(input:any){
  const required=['legalName','document','financialContactEmail','zipCode','street','number','district','city','state'];
  const missing=required.filter(k=>!String(input?.[k]??'').trim()); return{complete:missing.length===0,missing};
}
