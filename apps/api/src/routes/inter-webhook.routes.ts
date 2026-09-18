import { Router } from "express";
import { processInterWebhook } from "../services/inter-webhook.service.js";

export const interWebhookRouter=Router();
interWebhookRouter.post("/billing",async(req,res,next)=>{
  try{
    const items=Array.isArray(req.body)?req.body:[req.body];
    const results=[];
    const accountHeader=Array.isArray(req.headers["x-conta-corrente"])?req.headers["x-conta-corrente"][0]:req.headers["x-conta-corrente"];
    for(const payload of items)results.push(await processInterWebhook(payload,accountHeader||null));
    const failed=results.filter((r:any)=>r.status==="FAILED").length;
    res.status(failed?202:200).json({ok:failed===0,received:results.length,failed,results});
  }catch(e){next(e);}
});
