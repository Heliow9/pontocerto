import {Router} from 'express';
import {z} from 'zod';
import {safe} from './saas-commercial.routes.js';
import {writeAudit} from '../utils/audit.js';
import {cutoverMovyoCustomer,getMovyoIntegrationStatus,importMovyoCustomer,listMovyoIntegrationCustomers,reconcileMovyoCustomer,resolveMovyoCustomer,rollbackMovyoCustomer,syncMovyoDirectory} from '../services/movyo-import.service.js';
import {assertMovyoBulkCutoverEnabled} from '../services/movyo-rollout-core.js';
import {bulkCutoverMovyoCustomers,getMovyoRolloutSettings,updateMovyoRolloutSettings} from '../services/movyo-rollout.service.js';

export const movyoIntegrationRouter=Router();
const externalId=(value:unknown)=>z.string().trim().min(1).max(190).parse(String(value??''));
const confirmSchema=z.object({confirm:z.literal(true)});

const rolloutSchema=z.object({movyoPilotApproved:z.boolean().optional(),bulkCutoverEnabled:z.boolean().optional()}).refine(v=>Object.keys(v).length>0,'Informe ao menos uma configuração de rollout.');
const bulkCutoverSchema=z.object({externalIds:z.array(z.string().trim().min(1).max(190)).min(1).max(50)});

movyoIntegrationRouter.get('/rollout',safe(async(_req,res)=>res.json(await getMovyoRolloutSettings())));
movyoIntegrationRouter.put('/rollout',safe(async(req,res)=>{
  const input=rolloutSchema.parse(req.body||{}),previous=await getMovyoRolloutSettings(),settings=await updateMovyoRolloutSettings(input);
  await writeAudit(req,'UPDATE','movyo_rollout',null,previous,settings);
  res.json(settings);
}));
movyoIntegrationRouter.post('/bulk-cutover',safe(async(req,res)=>{
  const input=bulkCutoverSchema.parse(req.body||{}),settings=await getMovyoRolloutSettings();
  assertMovyoBulkCutoverEnabled(settings);
  const externalIds=[...new Set(input.externalIds)];
  const result=await bulkCutoverMovyoCustomers(externalIds);
  await writeAudit(req,'BULK_CUTOVER','movyo_customer',null,undefined,{externalIds,...result});
  res.status(result.failed?207:200).json(result);
}));


movyoIntegrationRouter.get('/status',safe(async(_req,res)=>res.json(await getMovyoIntegrationStatus())));
movyoIntegrationRouter.get('/customers',safe(async(req,res)=>res.json(await listMovyoIntegrationCustomers({status:String(req.query.status||'').trim()||undefined,q:String(req.query.q||'').trim()||undefined}))));
movyoIntegrationRouter.post('/sync',safe(async(req,res)=>{
  const result=await syncMovyoDirectory();
  await writeAudit(req,'SYNC','movyo_integration',null,undefined,{found:result.found,processed:result.processed});
  res.json(result);
}));
movyoIntegrationRouter.post('/customers/:externalId/import',safe(async(req,res)=>{
  const id=externalId(req.params.externalId),commercialCustomerId=req.body?.commercialCustomerId==null?undefined:z.coerce.number().int().positive().parse(req.body.commercialCustomerId);
  const result=await importMovyoCustomer(id,{commercialCustomerId});
  await writeAudit(req,'IMPORT','movyo_customer',null,undefined,result);
  res.status(result.imported?201:200).json(result);
}));
movyoIntegrationRouter.put('/customers/:externalId/resolve',safe(async(req,res)=>{
  const id=externalId(req.params.externalId),commercialCustomerId=z.coerce.number().int().positive().parse(req.body?.commercialCustomerId);
  const result=await resolveMovyoCustomer(id,commercialCustomerId);
  await writeAudit(req,'RESOLVE','movyo_customer',null,undefined,result);
  res.json(result);
}));
movyoIntegrationRouter.post('/customers/:externalId/cutover',safe(async(req,res)=>{
  confirmSchema.parse(req.body||{});
  const id=externalId(req.params.externalId),result=await cutoverMovyoCustomer(id);
  await writeAudit(req,'CUTOVER','movyo_customer',null,undefined,result);
  res.json(result);
}));
movyoIntegrationRouter.post('/customers/:externalId/rollback',safe(async(req,res)=>{
  confirmSchema.parse(req.body||{});
  const id=externalId(req.params.externalId),result=await rollbackMovyoCustomer(id);
  await writeAudit(req,'ROLLBACK','movyo_customer',null,undefined,result);
  res.json(result);
}));
movyoIntegrationRouter.post('/customers/:externalId/reconcile',safe(async(req,res)=>{
  const id=externalId(req.params.externalId),result=await reconcileMovyoCustomer(id);
  await writeAudit(req,'RECONCILE','movyo_customer',null,undefined,result);
  res.json(result);
}));
