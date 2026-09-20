export const brazilDocumentDigits=(value:unknown)=>String(value??'').replace(/\D/g,'');

function allSame(value:string){return /^(\d)\1+$/.test(value);}
function mod11Digit(base:string,weights:number[]){
  const sum=base.split('').reduce((acc,digit,index)=>acc+Number(digit)*weights[index],0);
  const remainder=sum%11;
  return remainder<2?0:11-remainder;
}

export function isValidCpf(value:unknown){
  const cpf=brazilDocumentDigits(value);
  if(cpf.length!==11||allSame(cpf))return false;
  const d1=mod11Digit(cpf.slice(0,9),[10,9,8,7,6,5,4,3,2]);
  const d2=mod11Digit(cpf.slice(0,9)+d1,[11,10,9,8,7,6,5,4,3,2]);
  return cpf===cpf.slice(0,9)+String(d1)+String(d2);
}

export function isValidCnpj(value:unknown){
  const cnpj=brazilDocumentDigits(value);
  if(cnpj.length!==14||allSame(cnpj))return false;
  const base=cnpj.slice(0,12);
  const d1=mod11Digit(base,[5,4,3,2,9,8,7,6,5,4,3,2]);
  const d2=mod11Digit(base+d1,[6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return cnpj===base+String(d1)+String(d2);
}

export function isValidBrazilDocument(value:unknown,personType?:'PF'|'PJ'|null){
  const doc=brazilDocumentDigits(value);
  if(personType==='PF')return isValidCpf(doc);
  if(personType==='PJ')return isValidCnpj(doc);
  return doc.length===11?isValidCpf(doc):doc.length===14?isValidCnpj(doc):false;
}
