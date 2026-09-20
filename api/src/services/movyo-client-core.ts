import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

export type MovyoSignInput={method:string;path:string;timestamp:string;nonce:string;body?:unknown};

function stable(value:unknown):unknown{
  if(value===undefined)return null;
  if(value===null)return null;
  if(Array.isArray(value))return value.map(stable);
  if(typeof value==='object'){
    const source=value as Record<string,unknown>;
    return Object.fromEntries(Object.keys(source).sort().map(key=>[key,stable(source[key])]));
  }
  return value;
}

export function stableJson(value:unknown){return JSON.stringify(stable(value??{}));}
export function bodyHash(body:unknown){return createHash('sha256').update(stableJson(body)).digest('hex');}
export function canonicalMovyoRequest(input:MovyoSignInput){return `${String(input.method||'GET').toUpperCase()}\n${input.path}\n${input.timestamp}\n${input.nonce}\n${bodyHash(input.body??{})}`;}
export function signMovyoRequest(input:MovyoSignInput,secret:string){return createHmac('sha256',String(secret||'')).update(canonicalMovyoRequest(input)).digest('hex');}
export function verifyMovyoSignatureFixture(input:MovyoSignInput,secret:string,received:string){
  const expected=Buffer.from(signMovyoRequest(input,secret),'hex');
  const actual=Buffer.from(String(received||''),'hex');
  return expected.length>0&&expected.length===actual.length&&timingSafeEqual(expected,actual);
}
