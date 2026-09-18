import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { safe } from "./saas-commercial.routes.js";
import {
  cancelCharge,
  createAdHocCharge,
  createImplementationCharge,
  createMonthlyCharge,
  getBillingProfile,
  getCharge,
  getChargePdf,
  getFinancialDashboard,
  getImplementationSuggestion,
  issueCharge,
  listCharges,
  listFinancialEvents,
  listReceipts,
  reconcileCharge,
  recordManualPayment,
  updateBillingProfile,
} from "../services/financial.service.js";
import {
  getTenantFinancialAccess,
  grantFinancialException,
  listFinancialExceptions,
  revokeFinancialException,
} from "../services/financial-access.service.js";
import {
  configureInterWebhook,
  getInterConnectionStatus,
  getInterWebhook,
  testInterConnection,
} from "../services/inter-billing.service.js";
import { exceptionEndFromPreset } from "../services/financial-access-core.js";
import { writeAudit } from "../utils/audit.js";

export const saasFinanceRouter = Router();
const id = (v: unknown) => z.coerce.number().int().positive().parse(v);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const chargeCommon = z.object({ tenantId: z.coerce.number().int().positive(), issue: z.boolean().optional().default(true) });

saasFinanceRouter.get("/dashboard", safe(async (_req, res) => res.json(await getFinancialDashboard())));
saasFinanceRouter.get("/charges", safe(async (req, res) => {
  const q = z.object({ tenantId:z.coerce.number().int().positive().optional(), status:z.enum(["DRAFT","ISSUING","OPEN","OVERDUE","PAID","CANCELED","FAILED"]).optional(), type:z.enum(["MONTHLY","IMPLEMENTATION","AD_HOC"]).optional(), from:date.optional(), to:date.optional(), limit:z.coerce.number().int().min(1).max(500).optional() }).parse(req.query);
  res.json(await listCharges(q));
}));
saasFinanceRouter.post("/charges/monthly", safe(async (req, res) => {
  const d = chargeCommon.extend({ competence:z.string().regex(/^\d{4}-\d{2}$/) }).parse(req.body);
  const charge = await createMonthlyCharge(d.tenantId,d.competence,req.auth!.userId,{issue:d.issue});
  await writeAudit(req,"CREATE","financial_charge",charge.id,undefined,{type:"MONTHLY",tenantId:d.tenantId,competence:d.competence});
  res.status(charge.alreadyExists?200:201).json(charge);
}));
saasFinanceRouter.post("/charges/implementation", safe(async (req, res) => {
  const d=chargeCommon.extend({amount:z.coerce.number().positive(),dueDate:date,description:z.string().trim().max(255).optional()}).parse(req.body);
  const charge=await createImplementationCharge({...d,actorUserId:req.auth!.userId});
  await writeAudit(req,"CREATE","financial_charge",charge.id,undefined,{type:"IMPLEMENTATION",tenantId:d.tenantId,amount:d.amount,dueDate:d.dueDate});
  res.status(201).json(charge);
}));
saasFinanceRouter.post("/charges/ad-hoc", safe(async (req,res)=>{
  const d=chargeCommon.extend({amount:z.coerce.number().positive(),dueDate:date,description:z.string().trim().min(2).max(255)}).parse(req.body);
  const charge=await createAdHocCharge({...d,actorUserId:req.auth!.userId});
  await writeAudit(req,"CREATE","financial_charge",charge.id,undefined,{type:"AD_HOC",tenantId:d.tenantId,amount:d.amount,dueDate:d.dueDate});
  res.status(201).json(charge);
}));
saasFinanceRouter.get("/charges/:id",safe(async(req,res)=>res.json(await getCharge(id(req.params.id)))));
saasFinanceRouter.get("/charges/:id/pdf",safe(async(req,res)=>{const chargeId=id(req.params.id);const pdf=await getChargePdf(chargeId);res.setHeader("Content-Type","application/pdf");res.setHeader("Content-Disposition",`inline; filename=boleto-${chargeId}.pdf`);res.send(pdf);}));
saasFinanceRouter.post("/charges/:id/issue",safe(async(req,res)=>res.json(await issueCharge(id(req.params.id),req.auth!.userId))));
saasFinanceRouter.post("/charges/:id/cancel",safe(async(req,res)=>{const chargeId=id(req.params.id);const d=z.object({reason:z.string().trim().min(2).max(100).optional()}).parse(req.body||{});const charge=await cancelCharge(chargeId,req.auth!.userId,d.reason||"APEDIDODOCLIENTE");await writeAudit(req,"CANCEL","financial_charge",chargeId);res.json(charge);}));
saasFinanceRouter.post("/charges/:id/reconcile",safe(async(req,res)=>res.json(await reconcileCharge(id(req.params.id),req.auth!.userId))));
saasFinanceRouter.post("/charges/:id/manual-payment",safe(async(req,res)=>{const chargeId=id(req.params.id);const d=z.object({paidAt:z.string().datetime().optional()}).parse(req.body||{});const charge=await recordManualPayment(chargeId,req.auth!.userId,d.paidAt);await writeAudit(req,"MANUAL_PAYMENT","financial_charge",chargeId);res.json(charge);}));

saasFinanceRouter.get("/tenants/:id/profile",safe(async(req,res)=>{const tenantId=id(req.params.id);res.json({profile:await getBillingProfile(tenantId),access:await getTenantFinancialAccess(tenantId),implementation:await getImplementationSuggestion(tenantId),exceptions:await listFinancialExceptions(tenantId)});}));
saasFinanceRouter.put("/tenants/:id/profile",safe(async(req,res)=>{const tenantId=id(req.params.id);const d=z.object({dueDay:z.union([z.literal(5),z.literal(10),z.literal(15)]),autoBlockEnabled:z.boolean(),autoMonthlyEnabled:z.boolean(),interCancelDays:z.coerce.number().int().min(0).max(60)}).parse(req.body);const profile=await updateBillingProfile(tenantId,d,req.auth!.userId);await writeAudit(req,"UPDATE","saas_billing_profile",tenantId,undefined,d);res.json(profile);}));
saasFinanceRouter.post("/tenants/:id/access-exceptions",safe(async(req,res)=>{const tenantId=id(req.params.id);const d=z.object({chargeId:z.coerce.number().int().positive().nullable().optional(),presetDays:z.union([z.literal(5),z.literal(10),z.literal(30)]).optional(),customEndDate:date.optional(),reason:z.string().trim().min(3).max(500)}).refine(v=>Boolean(v.presetDays)!==Boolean(v.customEndDate),"Informe presetDays ou customEndDate.").parse(req.body);const endsAt=d.customEndDate?`${d.customEndDate}T23:59:59-03:00`:exceptionEndFromPreset(new Date().toISOString(),d.presetDays!);const created=await grantFinancialException({tenantId,chargeId:d.chargeId||null,endsAt,reason:d.reason,actorUserId:req.auth!.userId});await writeAudit(req,"CREATE","financial_access_exception",created.id,undefined,{tenantId,chargeId:d.chargeId||null,endsAt,reason:d.reason});res.status(201).json(created);}));
saasFinanceRouter.delete("/access-exceptions/:id",safe(async(req,res)=>{const exceptionId=id(req.params.id);await revokeFinancialException(exceptionId,req.auth!.userId);await writeAudit(req,"REVOKE","financial_access_exception",exceptionId);res.json({ok:true});}));
saasFinanceRouter.get("/access-exceptions",safe(async(req,res)=>{const tenantId=req.query.tenantId?id(req.query.tenantId):undefined;res.json(await listFinancialExceptions(tenantId));}));
saasFinanceRouter.get("/receipts",safe(async(req,res)=>{const q=z.object({tenantId:z.coerce.number().int().positive().optional(),from:date.optional(),to:date.optional(),limit:z.coerce.number().int().min(1).max(500).optional()}).parse(req.query);res.json(await listReceipts(q));}));
saasFinanceRouter.get("/events",safe(async(req,res)=>{const q=z.object({tenantId:z.coerce.number().int().positive().optional(),chargeId:z.coerce.number().int().positive().optional(),limit:z.coerce.number().int().min(1).max(500).optional()}).parse(req.query);res.json(await listFinancialEvents(q));}));

saasFinanceRouter.get("/inter/status",safe(async(_req,res)=>{const status=getInterConnectionStatus();let webhook=null;if(status.enabled&&status.certExists&&status.keyExists){try{webhook=await getInterWebhook();}catch{webhook=null;}}res.json({...status,configuredWebhook:webhook,defaultWebhookUrl:env.INTER_WEBHOOK_URL||null});}));
saasFinanceRouter.post("/inter/test",safe(async(req,res)=>{const result=await testInterConnection();await writeAudit(req,"INTER_CONNECTION_TEST","saas_finance",null,undefined,{ok:true,environment:result.environment});res.json(result);}));
saasFinanceRouter.put("/inter/webhook",safe(async(req,res)=>{const d=z.object({url:z.string().url().optional()}).parse(req.body||{});const url=d.url||env.INTER_WEBHOOK_URL;if(!url)throw Object.assign(new Error("Configure INTER_WEBHOOK_URL ou informe uma URL HTTPS."),{status:400,code:"WEBHOOK_URL_MISSING"});const result=await configureInterWebhook(url);await writeAudit(req,"INTER_WEBHOOK_CONFIGURED","saas_finance",null,undefined,{url});res.json(result);}));
