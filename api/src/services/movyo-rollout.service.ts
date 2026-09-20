import {pool} from '../db/pool.js';
import {BRASILIA_NOW_SQL} from '../utils/db-time.js';
import {assertMovyoBulkCutoverEnabled,DEFAULT_MOVYO_ROLLOUT_SETTINGS,nextMovyoRolloutSettings,normalizeMovyoRolloutSettings,type MovyoRolloutSettings} from './movyo-rollout-core.js';
import {cutoverMovyoCustomer} from './movyo-import.service.js';

const SETTING_KEY='movyo_rollout';
function readJson(value:unknown){try{return JSON.parse(String(value||'{}'));}catch{return{};}}

export async function getMovyoRolloutSettings():Promise<MovyoRolloutSettings>{
  const [rows]=await pool.query<any[]>('SELECT setting_value FROM saas_settings WHERE setting_key=? LIMIT 1',[SETTING_KEY]);
  return rows[0]?normalizeMovyoRolloutSettings(readJson(rows[0].setting_value)):DEFAULT_MOVYO_ROLLOUT_SETTINGS;
}

export async function updateMovyoRolloutSettings(input:Partial<MovyoRolloutSettings>){
  const current=await getMovyoRolloutSettings();
  const next=nextMovyoRolloutSettings(current,input);
  await pool.query(`INSERT INTO saas_settings(setting_key,setting_value,updated_at) VALUES(?,?,${BRASILIA_NOW_SQL}) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_at=${BRASILIA_NOW_SQL}`,[SETTING_KEY,JSON.stringify(next)]);
  return next;
}

export async function bulkCutoverMovyoCustomers(externalIds:string[]){
  const settings=await getMovyoRolloutSettings();
  assertMovyoBulkCutoverEnabled(settings);
  const results:Array<{externalId:string;ok:boolean;result?:unknown;error?:{message:string;code?:string}}>=[];
  for(const externalId of externalIds){
    try{results.push({externalId,ok:true,result:await cutoverMovyoCustomer(externalId)});}
    catch(error:any){results.push({externalId,ok:false,error:{message:String(error?.message||error),code:error?.code}});}
  }
  return{requested:externalIds.length,succeeded:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,results};
}
