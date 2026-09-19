export type MaskKind="cpf"|"cnpj"|"cpfCnpj"|"phone"|"cep"|"pis";

export function digitsOnly(value:unknown,maxLength?:number){
  const digits=String(value??"").replace(/\D/g,"");
  return maxLength==null?digits:digits.slice(0,maxLength);
}

export function formatCpf(value:unknown){
  const d=digitsOnly(value,11);
  return d
    .replace(/^(\d{3})(\d)/,"$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/,"$1.$2.$3")
    .replace(/\.(\d{3})(\d)/,".$1-$2");
}

export function formatCnpj(value:unknown){
  const d=digitsOnly(value,14);
  return d
    .replace(/^(\d{2})(\d)/,"$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/,"$1.$2.$3")
    .replace(/\.(\d{3})(\d)/,".$1/$2")
    .replace(/(\/\d{4})(\d)/,"$1-$2");
}

export function formatCpfCnpj(value:unknown){
  const d=digitsOnly(value,14);
  return d.length<=11?formatCpf(d):formatCnpj(d);
}

export function formatPhone(value:unknown){
  const raw=digitsOnly(value,13);
  const international=raw.length>11&&raw.startsWith("55");
  const d=international?raw.slice(2,13):raw.slice(0,11);
  if(!d)return international?"+55 " : "";
  let local="";
  if(d.length<=2)local=`(${d}`;
  else if(d.length<=6)local=`(${d.slice(0,2)}) ${d.slice(2)}`;
  else if(d.length<=10)local=`(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  else local=`(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  return international?`+55 ${local}`:local;
}

export function formatCep(value:unknown){
  const d=digitsOnly(value,8);
  return d.replace(/^(\d{5})(\d)/,"$1-$2");
}

export function formatPis(value:unknown){
  const d=digitsOnly(value,11);
  if(d.length<=3)return d;
  if(d.length<=8)return `${d.slice(0,3)}.${d.slice(3)}`;
  if(d.length<=10)return `${d.slice(0,3)}.${d.slice(3,8)}.${d.slice(8)}`;
  return `${d.slice(0,3)}.${d.slice(3,8)}.${d.slice(8,10)}-${d.slice(10)}`;
}

export function applyMask(mask:MaskKind,value:unknown){
  switch(mask){
    case "cpf": return formatCpf(value);
    case "cnpj": return formatCnpj(value);
    case "cpfCnpj": return formatCpfCnpj(value);
    case "phone": return formatPhone(value);
    case "cep": return formatCep(value);
    case "pis": return formatPis(value);
  }
}

export function maskMaxLength(mask:MaskKind){
  return {cpf:14,cnpj:18,cpfCnpj:18,phone:19,cep:9,pis:14}[mask];
}

export function parseCurrencyDigits(raw:unknown):number|null{
  const digits=digitsOnly(raw);
  if(!digits)return null;
  return Number(digits)/100;
}

export function formatCurrencyBRL(value:number|null|undefined){
  if(value==null||Number.isNaN(Number(value)))return "";
  return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value));
}
