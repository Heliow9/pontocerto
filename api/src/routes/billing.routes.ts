import { Router } from "express";
import QRCode from "qrcode";
import { authMiddleware } from "../middlewares/auth.js";
import { safe } from "./saas-commercial.routes.js";
import { getTenantFinancialAccess } from "../services/financial-access.service.js";
import { getCharge, getChargePdf, listCharges } from "../services/financial.service.js";

export const billingRouter=Router();
billingRouter.use(authMiddleware);

billingRouter.get("/self/status",safe(async(req,res)=>{
  const access=await getTenantFinancialAccess(req.auth!.tenantId);
  if(req.auth!.role!=="TENANT_ADMIN")return res.json({blocked:access.blocked});
  const charges=[] as any[];
  for(const c of access.blockingCharges){
    charges.push({...c,pixQrDataUrl:c.pixCopyPaste?await QRCode.toDataURL(c.pixCopyPaste,{width:260,margin:1}):null});
  }
  res.json({...access,blockingCharges:charges});
}));
billingRouter.get("/self/charges",safe(async(req,res)=>{
  if(req.auth!.role!=="TENANT_ADMIN")return res.status(403).json({message:"Somente o administrador da empresa pode visualizar cobranças."});
  const rows=await listCharges({tenantId:req.auth!.tenantId,limit:200});
  res.json(rows.map((c:any)=>({id:c.id,type:c.type,competence:c.competence,description:c.description,amount:c.amount,dueDate:c.due_date,blockAt:c.block_at,status:c.status,pixCopyPaste:c.pix_copy_paste,digitableLine:c.digitable_line,paidAt:c.paid_at,issuedAt:c.issued_at})));
}));
billingRouter.get("/self/charges/:id/pdf",safe(async(req,res)=>{
  if(req.auth!.role!=="TENANT_ADMIN")return res.status(403).json({message:"Somente o administrador da empresa pode acessar o boleto."});
  const charge=await getCharge(Number(req.params.id));
  if(charge.tenant_id!==req.auth!.tenantId)return res.status(404).json({message:"Cobrança não encontrada."});
  const pdf=await getChargePdf(charge.id);res.setHeader("Content-Type","application/pdf");res.setHeader("Content-Disposition",`inline; filename=boleto-${charge.id}.pdf`);res.send(pdf);
}));
