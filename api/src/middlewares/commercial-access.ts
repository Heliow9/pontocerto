import type {Request,Response,NextFunction} from "express";
import {entitlements} from "../services/entitlements.service.js";
import type {Features} from "../services/commercial-rules.js";
export async function requireFeature(tenantId:number,companyId:number|null|undefined,feature:keyof Features){const contract=await entitlements(tenantId,companyId);if(!contract.features[feature])throw Object.assign(new Error("Recurso não liberado no contrato desta empresa. Consulte o administrador SaaS."),{status:403});}
export function featureGate(feature:keyof Features){return (req:Request,_res:Response,next:NextFunction)=>{const id=Number(req.params.companyId||req.params.id||req.query.companyId||req.body?.companyId||req.auth?.companyId)||null;void requireFeature(req.auth!.tenantId,id,feature).then(()=>next(),next);};}
