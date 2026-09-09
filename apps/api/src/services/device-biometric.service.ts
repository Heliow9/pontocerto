import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { pool } from "../db/pool.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { getCompanySecurityPolicy } from "./geofence.service.js";

function hashSecret(secret:string){ return createHash("sha256").update(secret,"utf8").digest("hex"); }
function sameHash(a:string,b:string){
  const A=Buffer.from(a,"hex"), B=Buffer.from(b,"hex");
  return A.length===B.length && timingSafeEqual(A,B);
}

export async function getEmployeeDevicePolicy(tenantId:number, companyId:number, employeeId:number){
  const companyPolicy=await getCompanySecurityPolicy(tenantId,companyId);
  const [rows]=await pool.query<any[]>(
    "SELECT biometric_exempt FROM employees WHERE id=? AND tenant_id=? AND company_id=? LIMIT 1",
    [employeeId,tenantId,companyId]
  );
  const employeeBiometricExempt=Boolean(rows[0]?.biometric_exempt);

  return {
    ...companyPolicy,
    companyRequireDeviceBiometric:companyPolicy.requireDeviceBiometric,
    employeeBiometricExempt,
    requireDeviceBiometric:companyPolicy.requireDeviceBiometric && !employeeBiometricExempt
  };
}

export async function registerEmployeeDevice(args:{
  tenantId:number;
  companyId:number;
  employeeId:number;
  platform?:string|null;
  model?:string|null;
  manufacturer?:string|null;
  osVersion?:string|null;
  biometricCapable:boolean;
  biometricTypes?:string[];
}){
  const policy=await getEmployeeDevicePolicy(args.tenantId,args.companyId,args.employeeId);

  if(policy.requireDeviceBiometric && !args.biometricCapable) {
    throw Object.assign(
      new Error("Este aparelho não possui biometria compatível cadastrada."),
      {code:"BIOMETRIC_NOT_AVAILABLE",status:403}
    );
  }

  const [countRows]=await pool.query<any[]>(
    "SELECT COUNT(*) AS total FROM devices WHERE tenant_id=? AND employee_id=? AND active=1",
    [args.tenantId,args.employeeId]
  );
  const total=Number(countRows[0]?.total||0);
  if(total>=policy.maxRegisteredDevices) {
    throw Object.assign(
      new Error(`Limite de ${policy.maxRegisteredDevices} dispositivo(s) ativo(s) atingido. Solicite ao RH a revogação do aparelho anterior.`),
      {code:"DEVICE_LIMIT_REACHED",status:409}
    );
  }

  const deviceUid=randomUUID();
  const deviceSecret=randomBytes(32).toString("hex");
  const secretHash=hashSecret(deviceSecret);

  const [result]=await pool.query<any>(
    `INSERT INTO devices
     (tenant_id,company_id,employee_id,device_uid,platform,model,manufacturer,os_version,
      secret_hash,biometric_capable,biometric_types,active,last_seen_at,bound_at,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,1,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,
    [
      args.tenantId,args.companyId,args.employeeId,deviceUid,args.platform||null,args.model||null,
      args.manufacturer||null,args.osVersion||null,secretHash,args.biometricCapable?1:0,
      (args.biometricTypes||[]).join(",")||null
    ]
  );

  return {id:Number(result.insertId),deviceUid,deviceSecret,policy};
}

export async function validateEmployeeDevice(args:{
  tenantId:number;
  companyId:number;
  employeeId:number;
  deviceUid?:string|null;
  deviceSecret?:string|null;
}){
  const policy=await getEmployeeDevicePolicy(args.tenantId,args.companyId,args.employeeId);

  if(!policy.requireRegisteredDevice && !policy.requireDeviceBiometric) {
    return {verified:true,required:false,device:null,policy};
  }

  if(!args.deviceUid || !args.deviceSecret) {
    return {
      verified:false,required:true,device:null,policy,
      code:"DEVICE_CREDENTIAL_REQUIRED",
      message:policy.requireDeviceBiometric
        ? "Dispositivo não vinculado ou biometria não confirmada."
        : "Dispositivo não vinculado."
    };
  }

  const [rows]=await pool.query<any[]>(
    `SELECT id,device_uid,secret_hash,platform,model,manufacturer,os_version,
            biometric_capable,biometric_types,active
       FROM devices
      WHERE tenant_id=? AND company_id=? AND employee_id=? AND device_uid=? AND active=1
      LIMIT 1`,
    [args.tenantId,args.companyId,args.employeeId,args.deviceUid]
  );
  const d=rows[0];

  if(!d || !d.secret_hash) {
    return {
      verified:false,required:true,device:null,policy,
      code:"DEVICE_NOT_REGISTERED",
      message:"Este aparelho não está autorizado para o funcionário."
    };
  }

  const supplied=hashSecret(args.deviceSecret);
  if(!sameHash(supplied,String(d.secret_hash))) {
    return {
      verified:false,required:true,device:null,policy,
      code:"DEVICE_SECRET_INVALID",
      message:"Credencial segura do dispositivo inválida. Solicite ao RH a revogação e faça um novo vínculo."
    };
  }

  if(policy.requireDeviceBiometric && !Boolean(d.biometric_capable)) {
    return {
      verified:false,required:true,device:d,policy,
      code:"BIOMETRIC_NOT_AVAILABLE",
      message:"Este dispositivo não possui biometria aprovada para o registro de ponto."
    };
  }

  await pool.query(
    `UPDATE devices SET last_seen_at=${BRASILIA_NOW_SQL} WHERE id=? AND tenant_id=?`,
    [d.id,args.tenantId]
  );

  return {verified:true,required:true,device:{...d,id:Number(d.id)},policy};
}
