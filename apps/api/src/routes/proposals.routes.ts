import {Router} from "express";
import {z} from "zod";
import {createHash} from "node:crypto";
import {pool} from "../db/pool.js";
import {proposalSchema,proposalStatus,readJson} from "../services/commercial-rules.js";
import {proposalDocx,proposalPdf} from "../services/proposal-documents.service.js";
import {ensureProposalRendered} from "../services/commercial-product-document.service.js";
import {createTenantInTransaction} from "../services/tenant-provisioning.service.js";
import {writeAudit} from "../utils/audit.js";
import {safe} from "./saas-commercial.routes.js";
import {assertSmtpReady,buildPublicBaseUrl,createTrackingToken,sendCommercialEmail,trackingHash} from "../services/commercial-email.service.js";

export const proposalsRouter=Router();
const idOf=(v:unknown)=>z.coerce.number().int().positive().parse(v);
const emailSchema=z.object({to:z.string().email().max(190),subject:z.string().trim().min(1).max(255),message:z.string().trim().min(1).max(10000)});
const productProposalSchema=z.object({
  commercialCustomerId:z.coerce.number().int().positive(),
  productId:z.coerce.number().int().positive(),
  productPlanId:z.coerce.number().int().positive(),
  companyName:z.string().trim().min(2).max(200),
  cnpj:z.string().trim().max(30),
  responsibleName:z.string().trim().min(2).max(160),
  email:z.string().email().max(190),
  phone:z.string().trim().max(30),
  priceMonthly:z.coerce.number().min(0),
  discountPercent:z.coerce.number().min(0).max(100).default(0),
  dueDay:z.coerce.number().int().min(1).max(31).optional().nullable(),
  implementationDays:z.coerce.number().int().min(0).default(0),
  implementationFee:z.coerce.number().min(0).default(0),
  validUntil:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes:z.string().max(6000).default(""),
  maxEmployees:z.coerce.number().int().positive().optional().nullable(),
  maxBranches:z.coerce.number().int().min(0).optional().nullable(),
  features:z.record(z.any()).optional().default({})
});

const select=`SELECT p.*,COALESCE(p.plan_name_snapshot,cpp.name,pl.name) AS plan_name,
 cp.code AS product_code,cp.name AS product_name,cp.description AS product_description,
 cp.default_provider,cp.default_payment_method,cp.default_grace_days,cp.default_auto_block,
 cpp.code AS product_plan_code,cpp.name AS product_plan_name
 FROM commercial_proposals p
 LEFT JOIN plans pl ON pl.id=p.plan_id
 LEFT JOIN commercial_products cp ON cp.id=p.product_id
 LEFT JOIN commercial_product_plans cpp ON cpp.id=p.product_plan_id`;

async function get(id:number){
  const [rows]=await pool.query<any[]>(`${select} WHERE p.id=?`,[id]);
  if(!rows[0])throw Object.assign(new Error("Proposta não encontrada."),{status:404});
  return rows[0];
}
const dto=(p:any)=>({...p,status:proposalStatus(p.status,p.valid_until),features:readJson(p.features_json,{}),commercialSnapshot:readJson(p.commercial_snapshot_json,{}),converted:Boolean(p.converted_tenant_id||p.converted_subscription_id)});

async function validatePlan(d:z.infer<typeof proposalSchema>){
  const [rows]=await pool.query<any[]>("SELECT p.*,s.is_custom FROM plans p LEFT JOIN saas_plan_settings s ON s.plan_id=p.id WHERE p.id=? AND p.active=1",[d.planId]);
  if(!rows[0])throw Object.assign(new Error("Selecione um plano ativo."),{status:400});
  if(rows[0].is_custom&&d.maxEmployees<=150)throw Object.assign(new Error("O plano Personalizado deve ter mais de 150 funcionários."),{status:400});
  return rows[0];
}
async function validateProductPlan(productId:number,productPlanId:number){
  const [rows]=await pool.query<any[]>(`SELECT cp.id AS product_id,cp.code AS product_code,cp.name AS product_name,cp.active AS product_active,
    cp.default_provider,cp.default_payment_method,cp.default_grace_days,
    cpp.id AS product_plan_id,cpp.code AS plan_code,cpp.name AS plan_name,cpp.price_monthly,cpp.active AS plan_active
    FROM commercial_products cp JOIN commercial_product_plans cpp ON cpp.product_id=cp.id
    WHERE cp.id=? AND cpp.id=? LIMIT 1`,[productId,productPlanId]);
  const row=rows[0];
  if(!row||!Number(row.product_active)||!Number(row.plan_active))throw Object.assign(new Error("Selecione um produto e plano ativos."),{status:400,code:"PRODUCT_PLAN_INVALID"});
  return row;
}

proposalsRouter.get("/",safe(async(req,res)=>{
  const where:string[]=[],args:any[]=[];
  const q=String(req.query.q||"").trim(),status=String(req.query.status||"").trim(),
    planId=req.query.planId?idOf(req.query.planId):null,productId=req.query.productId?idOf(req.query.productId):null,
    productCode=String(req.query.productCode||"").trim(),from=String(req.query.from||"").trim(),to=String(req.query.to||"").trim(),
    expired=String(req.query.expired||"")==="1",converted=String(req.query.converted||"")==="1";
  if(q){where.push("(p.proposal_number LIKE ? OR p.company_name LIKE ? OR p.cnpj LIKE ?)");args.push(`%${q}%`,`%${q}%`,`%${q}%`);}
  if(status){where.push("p.status=?");args.push(z.enum(["DRAFT","SENT","APPROVED","REJECTED","EXPIRED","CONVERTED"]).parse(status));}
  if(planId){where.push("p.plan_id=?");args.push(planId);}
  if(productId){where.push("p.product_id=?");args.push(productId);}
  if(productCode){where.push("cp.code=?");args.push(productCode);}
  if(from){where.push("DATE(p.created_at)>=?");args.push(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(from));}
  if(to){where.push("DATE(p.created_at)<=?");args.push(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(to));}
  if(expired)where.push("(p.status='EXPIRED' OR (p.status IN ('DRAFT','SENT') AND p.valid_until<CURDATE()))");
  if(converted)where.push("(p.status='CONVERTED' OR p.converted_tenant_id IS NOT NULL OR p.converted_subscription_id IS NOT NULL)");
  const [rows]=await pool.query<any[]>(`${select} ${where.length?"WHERE "+where.join(" AND "):""} ORDER BY p.id DESC LIMIT 500`,args);
  res.json(rows.map(dto));
}));

proposalsRouter.get("/:id(\\d+)",safe(async(req,res)=>{
  const p=await get(idOf(req.params.id));
  const [documents]=await pool.query<any[]>("SELECT id,revision,format,filename,sha256,created_at FROM proposal_documents WHERE proposal_id=? ORDER BY id DESC",[p.id]);
  const [deliveries]=await pool.query<any[]>("SELECT id,document_id,revision,recipient_email,subject,read_receipt_requested,sent_at,first_opened_at,last_opened_at,open_count FROM commercial_email_deliveries WHERE entity_type='proposal' AND entity_id=? AND sent_at IS NOT NULL ORDER BY id DESC",[p.id]);
  const [history]=await pool.query<any[]>("SELECT a.id,a.action,a.created_at,u.name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id WHERE a.entity_type='proposal' AND a.entity_id=? ORDER BY a.id DESC LIMIT 200",[p.id]);
  res.json({...dto(p),documents,deliveries,history});
}));

proposalsRouter.post("/",safe(async(req,res)=>{
  if(req.body?.productId){
    const d=productProposalSchema.parse(req.body),selection=await validateProductPlan(d.productId,d.productPlanId);
    if(selection.product_code==="PONTO_CERTO")throw Object.assign(new Error("Para propostas Ponto Certo use o fluxo de planos atual."),{status:409,code:"USE_LEGACY_PONTO_PROPOSAL"});
    const snapshot={productCode:selection.product_code,planName:selection.plan_name,priceMonthly:d.priceMonthly,discountPercent:d.discountPercent,dueDay:d.dueDay,implementationDays:d.implementationDays,implementationFee:d.implementationFee};
    const sql=`INSERT INTO commercial_proposals(commercial_customer_id,product_id,product_plan_id,proposal_number,company_name,cnpj,responsible_name,email,phone,plan_id,plan_name_snapshot,max_employees,price_monthly,max_branches,features_json,commercial_snapshot_json,implementation_days,implementation_fee,valid_until,notes,created_by,updated_by,created_at,updated_at)
      VALUES(?,?,?,NULL,?,?,?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`;
    const args=[d.commercialCustomerId,d.productId,d.productPlanId,d.companyName,d.cnpj,d.responsibleName,d.email,d.phone,selection.plan_name,d.maxEmployees||null,d.priceMonthly,d.maxBranches??null,JSON.stringify(d.features||{}),JSON.stringify(snapshot),d.implementationDays,d.implementationFee,d.validUntil,d.notes,req.auth!.userId,req.auth!.userId];
    const [r]=await pool.query<any>(sql,args);
    const prefix=selection.product_code==="MOVYO"?"MV":String(selection.product_code).slice(0,4),number=`${prefix}-${new Date().getFullYear()}-${String(r.insertId).padStart(5,"0")}`;
    await pool.query("UPDATE commercial_proposals SET proposal_number=? WHERE id=?",[number,r.insertId]);
    await writeAudit(req,"CREATE","proposal",r.insertId,undefined,{...d,proposalNumber:number,productCode:selection.product_code,snapshot});
    return res.status(201).json({id:r.insertId,proposalNumber:number,productCode:selection.product_code});
  }
  const d=proposalSchema.parse(req.body),plan=await validatePlan(d);
  const snapshot={planName:plan.name,maxEmployees:d.maxEmployees,priceMonthly:d.priceMonthly,maxBranches:d.maxBranches,features:d.features,implementationDays:d.implementationDays,implementationFee:d.implementationFee};
  const [r]=await pool.query<any>("INSERT INTO commercial_proposals(proposal_number,company_name,cnpj,responsible_name,email,phone,plan_id,plan_name_snapshot,max_employees,price_monthly,max_branches,features_json,commercial_snapshot_json,implementation_days,implementation_fee,valid_until,notes,created_by,updated_by,created_at,updated_at) VALUES(NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())",[d.companyName,d.cnpj,d.responsibleName,d.email,d.phone,d.planId,plan.name,d.maxEmployees,d.priceMonthly,d.maxBranches,JSON.stringify(d.features),JSON.stringify(snapshot),d.implementationDays,d.implementationFee,d.validUntil,d.notes,req.auth!.userId,req.auth!.userId]);
  const number=`PC-${new Date().getFullYear()}-${String(r.insertId).padStart(5,"0")}`;
  const [productRows]=await pool.query<any[]>("SELECT cp.id AS product_id,cpp.id AS product_plan_id FROM commercial_products cp LEFT JOIN commercial_product_plans cpp ON cpp.product_id=cp.id AND cpp.code=LOWER(?) WHERE cp.code='PONTO_CERTO' LIMIT 1",[plan.code]);
  await pool.query("UPDATE commercial_proposals SET proposal_number=?,product_id=?,product_plan_id=? WHERE id=?",[number,productRows[0]?.product_id||null,productRows[0]?.product_plan_id||null,r.insertId]);
  await writeAudit(req,"CREATE","proposal",r.insertId,undefined,{...d,proposalNumber:number,snapshot});
  res.status(201).json({id:r.insertId,proposalNumber:number});
}));

proposalsRouter.put("/:id(\\d+)",safe(async(req,res)=>{
  const id=idOf(req.params.id),current=await get(id);
  if((current.product_code||"PONTO_CERTO")!=="PONTO_CERTO"){
    const d=productProposalSchema.extend({revision:z.number().int().positive()}).parse(req.body);
    if(Number(d.productId)!==Number(current.product_id))throw Object.assign(new Error("O produto da proposta não pode ser trocado após a criação."),{status:409});
    const plan=await validateProductPlan(Number(current.product_id),d.productPlanId),snapshot={productCode:current.product_code,planName:plan.plan_name,priceMonthly:d.priceMonthly,discountPercent:d.discountPercent,dueDay:d.dueDay,implementationDays:d.implementationDays,implementationFee:d.implementationFee};
    const [r]=await pool.query<any>(`UPDATE commercial_proposals SET commercial_customer_id=?,product_plan_id=?,company_name=?,cnpj=?,responsible_name=?,email=?,phone=?,plan_name_snapshot=?,max_employees=?,price_monthly=?,max_branches=?,features_json=?,commercial_snapshot_json=?,implementation_days=?,implementation_fee=?,valid_until=?,notes=?,template_id=NULL,template_version=NULL,seller_snapshot_json=NULL,customer_snapshot_json=NULL,product_snapshot_json=NULL,plan_snapshot_json=NULL,pricing_snapshot_json=NULL,billing_snapshot_json=NULL,rendered_content=NULL,updated_by=?,revision=revision+1,status='DRAFT',updated_at=NOW() WHERE id=? AND revision=? AND status IN ('DRAFT','REJECTED','EXPIRED') AND converted_tenant_id IS NULL AND converted_subscription_id IS NULL`,[d.commercialCustomerId,d.productPlanId,d.companyName,d.cnpj,d.responsibleName,d.email,d.phone,plan.plan_name,d.maxEmployees||null,d.priceMonthly,d.maxBranches??null,JSON.stringify(d.features||{}),JSON.stringify(snapshot),d.implementationDays,d.implementationFee,d.validUntil,d.notes,req.auth!.userId,id,d.revision]);
    if(!r.affectedRows)return res.status(409).json({message:"Proposta alterada ou aprovada. Atualize a tela."});
    await writeAudit(req,"UPDATE","proposal",id,undefined,{...d,snapshot});return res.json({id});
  }
  const d=proposalSchema.parse(req.body),plan=await validatePlan(d),revision=z.number().int().positive().parse(req.body.revision);
  const snapshot={planName:plan.name,maxEmployees:d.maxEmployees,priceMonthly:d.priceMonthly,maxBranches:d.maxBranches,features:d.features,implementationDays:d.implementationDays,implementationFee:d.implementationFee};
  const [r]=await pool.query<any>("UPDATE commercial_proposals SET company_name=?,cnpj=?,responsible_name=?,email=?,phone=?,plan_id=?,plan_name_snapshot=?,max_employees=?,price_monthly=?,max_branches=?,features_json=?,commercial_snapshot_json=?,implementation_days=?,implementation_fee=?,valid_until=?,notes=?,updated_by=?,revision=revision+1,status='DRAFT',updated_at=NOW() WHERE id=? AND revision=? AND status IN ('DRAFT','REJECTED','EXPIRED') AND converted_tenant_id IS NULL",[d.companyName,d.cnpj,d.responsibleName,d.email,d.phone,d.planId,plan.name,d.maxEmployees,d.priceMonthly,d.maxBranches,JSON.stringify(d.features),JSON.stringify(snapshot),d.implementationDays,d.implementationFee,d.validUntil,d.notes,req.auth!.userId,id,revision]);
  if(!r.affectedRows)return res.status(409).json({message:"Proposta alterada ou aprovada. Reabra como rascunho antes de editar."});
  await writeAudit(req,"UPDATE","proposal",id,undefined,{...d,snapshot});res.json({id});
}));

proposalsRouter.patch("/:id(\\d+)/status",safe(async(req,res)=>{
  const id=idOf(req.params.id),d=z.object({status:z.enum(["DRAFT","SENT","APPROVED","REJECTED","EXPIRED"]),revision:z.number().int().positive()}).parse(req.body),p=await get(id);
  if(proposalStatus(p.status,p.valid_until)==="EXPIRED"&&["SENT","APPROVED"].includes(d.status))return res.status(409).json({message:"Proposta expirada. Atualize a validade em um rascunho."});
  const [r]=await pool.query<any>("UPDATE commercial_proposals SET status=?,updated_by=?,updated_at=NOW(),revision=revision+1 WHERE id=? AND revision=? AND converted_tenant_id IS NULL AND converted_subscription_id IS NULL",[d.status,req.auth!.userId,id,d.revision]);
  if(!r.affectedRows)return res.status(409).json({message:"A proposta foi alterada ou já convertida. Atualize a tela."});
  await writeAudit(req,d.status,"proposal",id,{status:p.status},{status:d.status});res.json({ok:true});
}));

proposalsRouter.post("/:id(\\d+)/documents/:format",safe(async(req,res)=>{
  const id=idOf(req.params.id),format=z.enum(["docx","pdf"]).parse(req.params.format);let p=await get(id);p=await ensureProposalRendered(p,req.auth!.userId);
  const docx=await proposalDocx(p),buffer=format==="pdf"?await proposalPdf(docx):docx,filename=`proposta-${id}-v${p.revision}.${format}`;
  const conn=await pool.getConnection();let documentId:number;
  try{await conn.beginTransaction();const [current]=await conn.query<any[]>("SELECT revision FROM commercial_proposals WHERE id=? FOR UPDATE",[id]);if(Number(current[0]?.revision)!==Number(p.revision))throw Object.assign(new Error("A proposta mudou durante a geração. Gere novamente."),{status:409});const [r]=await conn.query<any>("INSERT INTO proposal_documents(proposal_id,revision,format,filename,sha256,content,created_by,created_at) VALUES(?,?,?,?,?,?,?,NOW())",[id,p.revision,format,filename,createHash("sha256").update(buffer).digest("hex"),buffer,req.auth!.userId]);documentId=r.insertId;await conn.commit();}catch(e){await conn.rollback();throw e;}finally{conn.release();}
  await writeAudit(req,`GENERATE_${format.toUpperCase()}`,"proposal",id,undefined,{revision:p.revision,documentId});res.status(201).json({id:documentId,filename});
}));

proposalsRouter.get("/documents/:documentId(\\d+)/download",safe(async(req,res)=>{const [rows]=await pool.query<any[]>("SELECT * FROM proposal_documents WHERE id=?",[idOf(req.params.documentId)]);const d=rows[0];if(!d)return res.sendStatus(404);await writeAudit(req,"DOWNLOAD","proposal",d.proposal_id,undefined,{documentId:d.id});res.setHeader("Cache-Control","no-store");res.setHeader("Content-Disposition",`attachment; filename="${d.filename}"`);res.type(d.format==="pdf"?"application/pdf":"application/vnd.openxmlformats-officedocument.wordprocessingml.document").send(d.content);}));

proposalsRouter.post("/:id(\\d+)/send-email",safe(async(req,res)=>{
  const id=idOf(req.params.id),d=emailSchema.parse(req.body);let p=await get(id);const effective=proposalStatus(p.status,p.valid_until);
  if(p.converted_tenant_id||p.converted_subscription_id)throw Object.assign(new Error("Proposta convertida não pode ser reenviada como negociação."),{status:409});
  if(!["DRAFT","SENT","APPROVED"].includes(effective))throw Object.assign(new Error("Esta proposta não está em um status permitido para envio por e-mail."),{status:409});
  p=await ensureProposalRendered(p,req.auth!.userId);await assertSmtpReady();
  const docx=await proposalDocx(p),pdf=await proposalPdf(docx),filename=`proposta-${p.proposal_number||id}-v${p.revision}.pdf`;
  const [doc]=await pool.query<any>("INSERT INTO proposal_documents(proposal_id,revision,format,filename,sha256,content,created_by,created_at) VALUES(?,?,?,?,?,?,?,NOW())",[id,p.revision,"pdf",filename,createHash("sha256").update(pdf).digest("hex"),pdf,req.auth!.userId]);
  const token=createTrackingToken(),tokenHash=trackingHash(token),trackingUrl=`${buildPublicBaseUrl(req)}/mail/open/${token}.gif`;
  const [delivery]=await pool.query<any>("INSERT INTO commercial_email_deliveries(entity_type,entity_id,document_id,revision,recipient_email,subject,message_text,tracking_token_hash,read_receipt_requested,sent_by,created_at) VALUES('proposal',?,?,?,?,?,?,?,?,?,NOW())",[id,doc.insertId,p.revision,d.to,d.subject,d.message,tokenHash,1,req.auth!.userId]);
  let sent;try{sent=await sendCommercialEmail({to:d.to,subject:d.subject,message:d.message,filename,pdf,trackingUrl,recipientName:p.responsible_name,documentLabel:`Proposta ${p.proposal_number||`#${id}`}`});}catch(error){await pool.query("DELETE FROM commercial_email_deliveries WHERE id=? AND sent_at IS NULL",[delivery.insertId]);await writeAudit(req,"EMAIL_PROPOSAL_FAILED","proposal",id,undefined,undefined,"ERROR",{recipient:d.to,revision:p.revision,message:error instanceof Error?error.message:"Falha no envio"});throw error;}
  await pool.query("UPDATE commercial_email_deliveries SET smtp_message_id=?,sent_at=NOW() WHERE id=?",[sent.messageId,delivery.insertId]);if(p.status==="DRAFT")await pool.query("UPDATE commercial_proposals SET status='SENT',updated_by=?,updated_at=NOW() WHERE id=? AND revision=? AND status='DRAFT'",[req.auth!.userId,id,p.revision]);
  await writeAudit(req,"EMAIL_PROPOSAL_SENT","proposal",id,undefined,{deliveryId:delivery.insertId,documentId:doc.insertId,revision:p.revision,recipient:d.to,readReceiptRequested:true});res.status(201).json({ok:true,deliveryId:delivery.insertId,documentId:doc.insertId,filename,messageId:sent.messageId});
}));

proposalsRouter.post("/:id(\\d+)/convert",safe(async(req,res)=>{
  const id=idOf(req.params.id),d=z.object({slug:z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),adminName:z.string().min(2).max(160),adminEmail:z.string().email().max(190),adminPassword:z.string().min(8).max(128)}).parse(req.body),conn=await pool.getConnection();let result:any;
  try{await conn.beginTransaction();const [rows]=await conn.query<any[]>("SELECT p.*,cp.code AS product_code,c.id AS contract_id,c.status AS contract_status,c.tenant_id AS contract_tenant_id FROM commercial_proposals p LEFT JOIN commercial_products cp ON cp.id=p.product_id LEFT JOIN commercial_contracts c ON c.proposal_id=p.id WHERE p.id=? FOR UPDATE",[id]);const p=rows[0];if(!p)throw Object.assign(new Error("Proposta não encontrada."),{status:404});if((p.product_code||"PONTO_CERTO")!=="PONTO_CERTO")throw Object.assign(new Error("A ativação deste produto deve usar o provisionamento específico do produto."),{status:409,code:"PRODUCT_PROVISIONING_REQUIRED"});if(p.converted_tenant_id||p.contract_tenant_id){await conn.commit();return res.json({tenantId:p.converted_tenant_id||p.contract_tenant_id,alreadyConverted:true});}if(p.contract_status!=="SIGNED")throw Object.assign(new Error("A ativação do cliente exige contrato assinado."),{status:409});result=await createTenantInTransaction(conn,{...d,tenantName:p.company_name,companyName:p.company_name,cnpj:p.cnpj,planId:p.plan_id,trialDays:0});await conn.query("INSERT INTO tenant_contracts(tenant_id,max_employees,price_monthly,max_branches,features_json,updated_at) VALUES(?,?,?,?,?,NOW())",[result.tenantId,p.max_employees,p.price_monthly,p.max_branches,p.features_json]);await conn.query("UPDATE commercial_contracts SET tenant_id=?,updated_at=NOW() WHERE id=?",[result.tenantId,p.contract_id]);await conn.query("UPDATE commercial_proposals SET converted_tenant_id=?,status='CONVERTED',updated_by=?,updated_at=NOW() WHERE id=?",[result.tenantId,req.auth!.userId,id]);await conn.commit();}catch(e){await conn.rollback();throw e;}finally{conn.release();}
  await writeAudit(req,"CONVERT","proposal",id,undefined,result);res.status(201).json(result);
}));
