import { Router } from "express";
import { processCoraWebhook, processEfiWebhook, processMercadoPagoWebhook } from "../services/payment-webhook.service.js";

export const paymentWebhookRouter=Router();
paymentWebhookRouter.post("/cora",async(req,res,next)=>{try{const result=await processCoraWebhook(req.body,req.headers as any);res.status(result.status==="FAILED"?202:200).json({ok:result.status!=="FAILED",result});}catch(e){next(e);}});
paymentWebhookRouter.post("/efi",async(req,res,next)=>{try{const result=await processEfiWebhook(req.body);res.status(result.status==="FAILED"?202:200).json({ok:result.status!=="FAILED",result});}catch(e){next(e);}});
paymentWebhookRouter.post("/mercadopago",async(req,res,next)=>{try{const result=await processMercadoPagoWebhook(req.body,req.headers as any,req.query as any);res.status(result.status==="FAILED"?503:200).json({ok:result.status!=="FAILED",result});}catch(e){next(e);}});
