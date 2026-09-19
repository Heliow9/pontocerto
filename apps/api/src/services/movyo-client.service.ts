import {randomUUID} from 'node:crypto';
import {env} from '../config/env.js';
import {signMovyoRequest} from './movyo-client-core.js';

const bridgeError=(message:string,status=502,code='MOVYO_BRIDGE_ERROR',details?:unknown)=>Object.assign(new Error(message),{status,code,details});

function config(){
  if(env.MOVYO_BRIDGE_ENABLED!=='1')throw bridgeError('Integração Movyo está desabilitada.',409,'MOVYO_BRIDGE_DISABLED');
  if(!env.MOVYO_BRIDGE_BASE_URL||!env.MOVYO_BRIDGE_SECRET)throw bridgeError('Integração Movyo não está configurada no servidor.',503,'MOVYO_BRIDGE_NOT_CONFIGURED');
  return{baseUrl:env.MOVYO_BRIDGE_BASE_URL.replace(/\/$/,''),clientId:env.MOVYO_BRIDGE_CLIENT_ID,secret:env.MOVYO_BRIDGE_SECRET,timeoutMs:env.MOVYO_BRIDGE_TIMEOUT_MS};
}

export async function movyoRequest<T=any>(input:{method?:string;path:string;body?:unknown;idempotencyKey?:string}){
  const cfg=config(),method=String(input.method||'GET').toUpperCase(),body=input.body??{};
  const path=input.path.startsWith('/')?input.path:`/${input.path}`;
  const signaturePath=path.split('?')[0];
  const timestamp=String(Date.now()),nonce=randomUUID();
  const signature=signMovyoRequest({method,path:signaturePath,timestamp,nonce,body},cfg.secret);
  const headers:Record<string,string>={
    'Accept':'application/json','Content-Type':'application/json',
    'X-PC-Client':cfg.clientId,'X-PC-Timestamp':timestamp,'X-PC-Nonce':nonce,'X-PC-Signature':signature,
  };
  if(!['GET','HEAD','OPTIONS'].includes(method))headers['X-PC-Idempotency-Key']=input.idempotencyKey||randomUUID();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),cfg.timeoutMs);
  try{
    const response=await fetch(`${cfg.baseUrl}${path}`,{method,headers,body:['GET','HEAD'].includes(method)?undefined:JSON.stringify(body),signal:controller.signal});
    const raw=await response.text();let payload:any={};try{payload=raw?JSON.parse(raw):{};}catch{payload={message:raw};}
    if(!response.ok)throw bridgeError(String(payload?.mensagem||payload?.message||`Movyo respondeu HTTP ${response.status}.`),response.status,String(payload?.code||'MOVYO_BRIDGE_HTTP_ERROR'),payload);
    return payload as T;
  }catch(error:any){
    if(error?.name==='AbortError')throw bridgeError('Tempo esgotado ao comunicar com a Movyo.',504,'MOVYO_BRIDGE_TIMEOUT');
    if(error?.code&&String(error.code).startsWith('MOVYO_'))throw error;
    throw bridgeError(String(error?.message||'Falha ao comunicar com a Movyo.'),502,'MOVYO_BRIDGE_NETWORK_ERROR');
  }finally{clearTimeout(timer);}
}

export const listMovyoCustomers=()=>movyoRequest<{customers:any[];total:number}>({path:'/api/internal/ponto-certo/customers'});
export const getMovyoCustomer=(id:string|number)=>movyoRequest<any>({path:`/api/internal/ponto-certo/customers/${encodeURIComponent(String(id))}`});
export const getMovyoLicense=(id:string|number)=>movyoRequest<any>({path:`/api/internal/ponto-certo/customers/${encodeURIComponent(String(id))}/license`});
export const provisionMovyoCustomer=(body:unknown,idempotencyKey:string)=>movyoRequest<any>({method:'POST',path:'/api/internal/ponto-certo/customers',body,idempotencyKey});
export const syncMovyoSubscription=(id:string|number,body:unknown,idempotencyKey:string)=>movyoRequest<any>({method:'PUT',path:`/api/internal/ponto-certo/customers/${encodeURIComponent(String(id))}/subscription`,body,idempotencyKey});
export const blockMovyoCustomer=(id:string|number,body:unknown,idempotencyKey:string)=>movyoRequest<any>({method:'POST',path:`/api/internal/ponto-certo/customers/${encodeURIComponent(String(id))}/block`,body,idempotencyKey});
export const unblockMovyoCustomer=(id:string|number,body:unknown,idempotencyKey:string)=>movyoRequest<any>({method:'POST',path:`/api/internal/ponto-certo/customers/${encodeURIComponent(String(id))}/unblock`,body,idempotencyKey});
