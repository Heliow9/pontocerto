import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { getEmployeeDevicePolicy, registerEmployeeDevice } from "../services/device-biometric.service.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { writeAudit } from "../utils/audit.js";

export const devicesRouter=Router();
devicesRouter.use(authMiddleware);

async function myEmployee(req:any){
  if(req.auth.role!=="FUNCIONARIO" || !req.auth.employeeId) return null;
  const [rows]=await pool.query<any[]>("SELECT id,company_id FROM employees WHERE id=? AND tenant_id=? AND active=1 LIMIT 1",[req.auth.employeeId,req.auth.tenantId]);
  return rows[0]||null;
}

devicesRouter.get("/my/status",async(req,res)=>{
  const employee=await myEmployee(req);if(!employee)return res.status(403).json({message:"Usuário funcionário necessário."});
  const deviceUid=String(req.query.deviceUid||"");
  const policy=await getEmployeeDevicePolicy(req.auth!.tenantId,employee.company_id,employee.id);
  const [devices]=await pool.query<any[]>(`SELECT id,device_uid,platform,model,manufacturer,os_version,biometric_capable,biometric_types,active,last_seen_at,bound_at,created_at FROM devices WHERE tenant_id=? AND employee_id=? AND active=1 ORDER BY id DESC`,[req.auth!.tenantId,employee.id]);
  const current=deviceUid?devices.find((d:any)=>d.device_uid===deviceUid)||null:null;
  res.json({policy,registeredDevices:devices.length,currentDevice:current,devices});
});

const registerSchema=z.object({platform:z.string().max(50).optional().nullable(),model:z.string().max(120).optional().nullable(),manufacturer:z.string().max(120).optional().nullable(),osVersion:z.string().max(80).optional().nullable(),biometricCapable:z.boolean(),biometricTypes:z.array(z.string().max(40)).max(5).default([])});
devicesRouter.post("/my/register",async(req,res)=>{
  const employee=await myEmployee(req);if(!employee)return res.status(403).json({message:"Usuário funcionário necessário."});
  const parsed=registerSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:"Dados do dispositivo inválidos."});
  try{
    const result=await registerEmployeeDevice({tenantId:req.auth!.tenantId,companyId:employee.company_id,employeeId:employee.id,...parsed.data});
    await writeAudit(req,"DEVICE_BIND","device",result.id,undefined,{deviceUid:result.deviceUid,platform:parsed.data.platform,model:parsed.data.model,biometricTypes:parsed.data.biometricTypes});
    res.status(201).json({deviceUid:result.deviceUid,deviceSecret:result.deviceSecret,message:"Dispositivo vinculado com sucesso."});
  }catch(error:any){res.status(error?.status||400).json({message:error?.message||"Não foi possível vincular o dispositivo.",code:error?.code});}
});

devicesRouter.get("/employee/:employeeId",requireRole("SUPER_ADMIN","TENANT_ADMIN","RH","GESTOR"),async(req,res)=>{
  const employeeId=Number(req.params.employeeId);
  const [rows]=await pool.query<any[]>(`SELECT d.id,d.device_uid,d.platform,d.model,d.manufacturer,d.os_version,d.biometric_capable,d.biometric_types,d.active,d.last_seen_at,d.bound_at,d.revoked_at FROM devices d JOIN employees e ON e.id=d.employee_id AND e.tenant_id=d.tenant_id WHERE d.tenant_id=? AND d.employee_id=? ORDER BY d.active DESC,d.id DESC`,[req.auth!.tenantId,employeeId]);
  res.json(rows);
});

devicesRouter.delete("/employee/:employeeId",requireRole("SUPER_ADMIN","TENANT_ADMIN","RH"),async(req,res)=>{
  const employeeId=Number(req.params.employeeId);
  const [emp]=await pool.query<any[]>("SELECT id FROM employees WHERE id=? AND tenant_id=? LIMIT 1",[employeeId,req.auth!.tenantId]);if(!emp[0])return res.status(404).json({message:"Funcionário não encontrado."});
  const [result]=await pool.query<any>(`UPDATE devices SET active=0,revoked_at=${BRASILIA_NOW_SQL} WHERE tenant_id=? AND employee_id=? AND active=1`,[req.auth!.tenantId,employeeId]);
  await writeAudit(req,"DEVICE_REVOKE_ALL","employee",employeeId,undefined,{revokedDevices:Number(result.affectedRows||0)});
  res.json({ok:true,revoked:Number(result.affectedRows||0)});
});

devicesRouter.delete("/:id",requireRole("SUPER_ADMIN","TENANT_ADMIN","RH"),async(req,res)=>{
  const id=Number(req.params.id);
  const [rows]=await pool.query<any[]>("SELECT * FROM devices WHERE id=? AND tenant_id=? LIMIT 1",[id,req.auth!.tenantId]);if(!rows[0])return res.status(404).json({message:"Dispositivo não encontrado."});
  await pool.query(`UPDATE devices SET active=0,revoked_at=${BRASILIA_NOW_SQL} WHERE id=? AND tenant_id=?`,[id,req.auth!.tenantId]);
  await writeAudit(req,"DEVICE_REVOKE","device",id,rows[0]);res.json({ok:true});
});
