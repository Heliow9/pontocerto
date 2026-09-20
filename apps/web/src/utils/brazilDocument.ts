export const documentDigits=(value:unknown)=>String(value??'').replace(/\D/g,'');
const same=(s:string)=>/^(\d)\1+$/.test(s);
const digit=(base:string,weights:number[])=>{const sum=base.split('').reduce((a,d,i)=>a+Number(d)*weights[i],0);const r=sum%11;return r<2?0:11-r;};
export function validCpf(value:unknown){const s=documentDigits(value);if(s.length!==11||same(s))return false;const d1=digit(s.slice(0,9),[10,9,8,7,6,5,4,3,2]);const d2=digit(s.slice(0,9)+d1,[11,10,9,8,7,6,5,4,3,2]);return s===s.slice(0,9)+d1+d2;}
export function validCnpj(value:unknown){const s=documentDigits(value);if(s.length!==14||same(s))return false;const b=s.slice(0,12);const d1=digit(b,[5,4,3,2,9,8,7,6,5,4,3,2]);const d2=digit(b+d1,[6,5,4,3,2,9,8,7,6,5,4,3,2]);return s===b+d1+d2;}
export function validBrazilDocument(value:unknown,type?:'PF'|'PJ'){const s=documentDigits(value);return type==='PF'?validCpf(s):type==='PJ'?validCnpj(s):s.length===11?validCpf(s):s.length===14?validCnpj(s):false;}
