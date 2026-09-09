import { Router } from "express";
import multer from "multer";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { env } from "../config/env.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { enrollFace, revokeFace } from "../services/face.service.js";
import { writeAudit } from "../utils/audit.js";

export const faceRouter=Router();
faceRouter.use(authMiddleware);

const upload=multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:env.FACE_MAX_IMAGE_MB*1024*1024},
  fileFilter(_req,file,cb){
    if(["image/jpeg","image/png"].includes(file.mimetype)) return cb(null,true);
    cb(new Error("Envie uma imagem JPG ou PNG."));
  }
});

async function myEmployee(req:any){
  if(!req.auth?.employeeId) return null;
  const [rows]=await pool.query<any[]>("SELECT id,company_id,name FROM employees WHERE id=? AND tenant_id=? AND active=1 LIMIT 1",[req.auth.employeeId,req.auth.tenantId]);
  return rows[0]||null;
}

faceRouter.get("/my/status",async(req,res)=>{
  const employee=await myEmployee(req);
  if(!employee)return res.status(400).json({message:"Usuário não vinculado a funcionário."});
  const [profiles]=await pool.query<any[]>(`SELECT provider,status,enrolled_at,last_verified_at FROM employee_face_profiles WHERE tenant_id=? AND employee_id=? LIMIT 1`,[req.auth!.tenantId,employee.id]);
  res.json({
    required:false,
    provider:"DISABLED",
    configured:false,
    enrolled:false,
    profile:profiles[0]||null,
    message:"Reconhecimento facial em nuvem está desativado. O ponto usa selfie obrigatória e biometria do dispositivo."
  });
});

faceRouter.post("/my/enroll",upload.single("faceImage"),async(req,res)=>{
  const employee=await myEmployee(req);
  if(!employee)return res.status(400).json({message:"Usuário não vinculado a funcionário."});
  if(!req.file)return res.status(400).json({message:"Capture uma foto frontal para cadastrar a biometria."});
  const [old]=await pool.query<any[]>(`SELECT provider_face_id FROM employee_face_profiles WHERE tenant_id=? AND employee_id=? LIMIT 1`,[req.auth!.tenantId,employee.id]);
  try{
    const enrolled=await enrollFace({tenantId:req.auth!.tenantId,employeeId:employee.id,image:req.file.buffer,oldFaceId:old[0]?.provider_face_id});
    await pool.query(`INSERT INTO employee_face_profiles (tenant_id,company_id,employee_id,provider,collection_id,provider_face_id,external_image_id,status,enrolled_at,last_verified_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'ENROLLED',${BRASILIA_NOW_SQL},NULL,${BRASILIA_NOW_SQL})
      ON DUPLICATE KEY UPDATE company_id=VALUES(company_id),provider=VALUES(provider),collection_id=VALUES(collection_id),provider_face_id=VALUES(provider_face_id),external_image_id=VALUES(external_image_id),status='ENROLLED',enrolled_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL}`,
      [req.auth!.tenantId,employee.company_id,employee.id,enrolled.provider,enrolled.collectionId,enrolled.faceId,enrolled.externalImageId]);
    await writeAudit(req,"FACE_ENROLL","employee",employee.id,undefined,{provider:enrolled.provider});
    res.json({ok:true,message:"Biometria facial cadastrada com sucesso.",provider:enrolled.provider});
  }catch(error:any){
    res.status(503).json({message:error?.message||"Não foi possível cadastrar a biometria facial."});
  }
});

faceRouter.get("/employee/:id/status",requireRole("SUPER_ADMIN","TENANT_ADMIN","RH","GESTOR"),async(req,res)=>{
  const id=Number(req.params.id);
  const [rows]=await pool.query<any[]>(`SELECT f.provider,f.status,f.enrolled_at,f.last_verified_at FROM employees e LEFT JOIN employee_face_profiles f ON f.employee_id=e.id AND f.tenant_id=e.tenant_id WHERE e.id=? AND e.tenant_id=? LIMIT 1`,[id,req.auth!.tenantId]);
  if(!rows[0])return res.status(404).json({message:"Funcionário não encontrado."});
  res.json({enrolled:rows[0].status==="ENROLLED",...rows[0]});
});

faceRouter.delete("/employee/:id",requireRole("SUPER_ADMIN","TENANT_ADMIN","RH"),async(req,res)=>{
  const id=Number(req.params.id);
  const [profiles]=await pool.query<any[]>(`SELECT provider_face_id,status FROM employee_face_profiles WHERE tenant_id=? AND employee_id=? LIMIT 1`,[req.auth!.tenantId,id]);
  if(!profiles[0])return res.status(404).json({message:"Biometria não cadastrada."});
  await revokeFace(req.auth!.tenantId,profiles[0].provider_face_id);
  await pool.query(`UPDATE employee_face_profiles SET status='REVOKED',updated_at=${BRASILIA_NOW_SQL} WHERE tenant_id=? AND employee_id=?`,[req.auth!.tenantId,id]);
  await writeAudit(req,"FACE_REVOKE","employee",id,profiles[0],{status:"REVOKED"});
  res.json({ok:true});
});
