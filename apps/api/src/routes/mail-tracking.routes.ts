import { Router } from "express";
import { pool } from "../db/pool.js";
import { trackingHash } from "../services/commercial-email.service.js";

export const mailTrackingRouter=Router();
const pixel=Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==","base64");

mailTrackingRouter.get("/open/:token.gif",async(req,res)=>{
  res.setHeader("Content-Type","image/gif");
  res.setHeader("Cache-Control","private, no-cache, no-store, must-revalidate, max-age=0");
  res.setHeader("Pragma","no-cache");
  try{
    const token=String(req.params.token||"");
    if(/^[a-f0-9]{64}$/i.test(token))await pool.query("UPDATE commercial_email_deliveries SET first_opened_at=COALESCE(first_opened_at,NOW()),last_opened_at=NOW(),open_count=open_count+1 WHERE tracking_token_hash=? AND sent_at IS NOT NULL",[trackingHash(token)]);
  }catch(error){console.warn("Falha ao registrar abertura de e-mail",error instanceof Error?error.message:"erro desconhecido");}
  res.status(200).send(pixel);
});
