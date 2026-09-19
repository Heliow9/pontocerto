import https from "node:https";
import fs from "node:fs";

export class ProviderHttpError extends Error {
  status:number; code:string; body:any; provider:string;
  constructor(provider:string,message:string,status=502,code="PROVIDER_HTTP_ERROR",body:any=null){super(message);this.name="ProviderHttpError";this.provider=provider;this.status=status;this.code=code;this.body=body;}
}

type TlsOptions={certPath?:string;keyPath?:string;pfxPath?:string;passphrase?:string};
type RequestOptions={method?:string;headers?:Record<string,string>;body?:string|Buffer|null;tls?:TlsOptions;timeoutMs?:number;binary?:boolean};

export function fileExists(path?:string){return Boolean(path&&fs.existsSync(path));}
export function digits(value:unknown){return String(value??"").replace(/\D/g,"");}
export function moneyFromCents(value:unknown){const n=Number(value);return Number.isFinite(n)?Math.round(n)/100:null;}
export function centsFromMoney(value:number){return Math.round(Number(value)*100);}
export function cleanObject<T extends Record<string,any>>(obj:T):T{return Object.fromEntries(Object.entries(obj).filter(([,v])=>v!==undefined&&v!==null&&v!=="")) as T;}

export async function httpsRequest(urlString:string, options:RequestOptions={}){
  const url=new URL(urlString);const body=options.body??null;
  const requestOptions:https.RequestOptions={
    protocol:url.protocol,hostname:url.hostname,port:url.port||443,path:`${url.pathname}${url.search}`,
    method:options.method||"GET",headers:{...(options.headers||{})},timeout:options.timeoutMs||25000,
  };
  if(options.tls?.certPath)requestOptions.cert=fs.readFileSync(options.tls.certPath);
  if(options.tls?.keyPath)requestOptions.key=fs.readFileSync(options.tls.keyPath);
  if(options.tls?.pfxPath)requestOptions.pfx=fs.readFileSync(options.tls.pfxPath);
  if(options.tls?.passphrase)requestOptions.passphrase=options.tls.passphrase;
  if(body!=null&&!requestOptions.headers?.["Content-Length"])(requestOptions.headers as any)["Content-Length"]=Buffer.byteLength(body);
  return new Promise<{status:number;headers:https.IncomingHttpHeaders;body:Buffer;text:string;json:any}>((resolve,reject)=>{
    const req=https.request(requestOptions,res=>{const chunks:Buffer[]=[];res.on("data",c=>chunks.push(Buffer.isBuffer(c)?c:Buffer.from(c)));res.on("end",()=>{const raw=Buffer.concat(chunks);const text=raw.toString("utf8");let json:any=null;try{json=text?JSON.parse(text):null;}catch{}resolve({status:Number(res.statusCode||0),headers:res.headers,body:raw,text,json});});});
    req.on("timeout",()=>req.destroy(new Error("Tempo esgotado ao comunicar com o provedor.")));
    req.on("error",reject);if(body!=null)req.write(body);req.end();
  });
}

export function errorMessageFromResponse(json:any,text:string,fallback:string){
  return String(json?.message||json?.error_description||json?.error?.message||json?.error||json?.details?.[0]?.description||text||fallback).slice(0,500);
}
