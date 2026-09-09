import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { writeAudit } from "../utils/audit.js";
import { geocodePermanent } from "../services/mapbox.service.js";

export const companiesRouter=Router();
companiesRouter.use(authMiddleware,requireRole("SUPER_ADMIN","TENANT_ADMIN","RH","GESTOR","SUPERVISOR"));

companiesRouter.get("/",async(req,res)=>{
  const [rows]=await pool.query<any[]>(`SELECT c.id,c.legal_name,c.trade_name,c.cnpj,c.active,p.phone,p.email,p.address,p.zip_code,p.street,p.address_number,p.complement,p.district,p.city,p.state,p.country,p.latitude,p.longitude,p.punch_radius_meters,p.require_location,p.block_outside_radius,p.max_gps_accuracy_meters,p.require_device_biometric,p.require_registered_device,p.max_registered_devices,p.enforce_schedule_window,p.schedule_early_margin_minutes,p.schedule_late_margin_minutes,p.mapbox_place_id FROM companies c LEFT JOIN company_profiles p ON p.company_id=c.id AND p.tenant_id=c.tenant_id WHERE c.tenant_id=? ORDER BY c.active DESC,c.legal_name`,[req.auth!.tenantId]);
  res.json(rows);
});

const addressSchema=z.object({zipCode:z.string().optional().nullable(),street:z.string().optional().nullable(),number:z.string().optional().nullable(),complement:z.string().optional().nullable(),district:z.string().optional().nullable(),city:z.string().optional().nullable(),state:z.string().max(2).optional().nullable(),country:z.string().max(2).optional().default("BR"),address:z.string().optional().nullable()});

companiesRouter.post("/geocode",requireRole("SUPER_ADMIN","TENANT_ADMIN","RH"),async(req,res)=>{const parsed=addressSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:"Endereço inválido."});try{res.json(await geocodePermanent(parsed.data));}catch(error:any){res.status(502).json({message:error?.message||"Não foi possível localizar o endereço."});}});

const schema=addressSchema.extend({
  legalName:z.string().min(2),tradeName:z.string().optional().nullable(),cnpj:z.string().optional().nullable(),phone:z.string().optional().nullable(),email:z.string().email().optional().nullable().or(z.literal("")),
  latitude:z.number().min(-90).max(90).optional().nullable(),longitude:z.number().min(-180).max(180).optional().nullable(),mapboxPlaceId:z.string().optional().nullable(),
  punchRadiusMeters:z.number().int().min(50).max(50000).default(1000),requireLocation:z.boolean().default(true),blockOutsideRadius:z.boolean().default(true),maxGpsAccuracyMeters:z.number().int().min(10).max(2000).default(100),
  requireDeviceBiometric:z.boolean().default(true),requireRegisteredDevice:z.boolean().default(true),maxRegisteredDevices:z.number().int().min(1).max(5).default(1),enforceScheduleWindow:z.boolean().default(true),scheduleEarlyMarginMinutes:z.number().int().min(0).max(720).default(120),scheduleLateMarginMinutes:z.number().int().min(0).max(720).default(240),active:z.boolean().default(true)
});

function formattedAddress(d:any){return d.address||[[d.street,d.number].filter(Boolean).join(", "),d.district,d.city,d.state,d.zipCode].filter(Boolean).join(" - ")||null;}
async function coordinates(d:any){if(d.latitude!=null&&d.longitude!=null)return {latitude:d.latitude,longitude:d.longitude,mapboxPlaceId:d.mapboxPlaceId||null,address:formattedAddress(d)};if(!d.requireLocation)return {latitude:null,longitude:null,mapboxPlaceId:d.mapboxPlaceId||null,address:formattedAddress(d)};const geo=await geocodePermanent(d);return {latitude:geo.latitude,longitude:geo.longitude,mapboxPlaceId:geo.mapboxPlaceId,address:geo.formattedAddress};}

const profileCols=`tenant_id,company_id,phone,email,address,zip_code,street,address_number,complement,district,city,state,country,latitude,longitude,punch_radius_meters,require_location,block_outside_radius,max_gps_accuracy_meters,require_device_biometric,require_registered_device,max_registered_devices,enforce_schedule_window,schedule_early_margin_minutes,schedule_late_margin_minutes,require_face_recognition,mapbox_place_id,created_at,updated_at`;

companiesRouter.post("/",requireRole("SUPER_ADMIN","TENANT_ADMIN"),async(req,res)=>{
  const parsed=schema.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:"Dados inválidos.",issues:parsed.error.flatten()});const d=parsed.data;
  let geo:any;try{geo=await coordinates(d);}catch(error:any){return res.status(400).json({message:`Não foi possível validar o endereço da empresa: ${error?.message||"erro no Mapbox"}`});}
  const conn=await pool.getConnection();try{await conn.beginTransaction();const [result]=await conn.query<any>(`INSERT INTO companies (tenant_id,legal_name,trade_name,cnpj,active,created_at,updated_at) VALUES (?,?,?,?,?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,[req.auth!.tenantId,d.legalName,d.tradeName||null,d.cnpj||null,d.active?1:0]);
    await conn.query(`INSERT INTO company_profiles (${profileCols}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,[req.auth!.tenantId,result.insertId,d.phone||null,d.email||null,geo.address,d.zipCode||null,d.street||null,d.number||null,d.complement||null,d.district||null,d.city||null,d.state||null,(d.country||"BR").toUpperCase(),geo.latitude,geo.longitude,d.punchRadiusMeters,d.requireLocation?1:0,d.blockOutsideRadius?1:0,d.maxGpsAccuracyMeters,d.requireDeviceBiometric?1:0,d.requireRegisteredDevice?1:0,d.maxRegisteredDevices,d.enforceScheduleWindow?1:0,d.scheduleEarlyMarginMinutes,d.scheduleLateMarginMinutes,geo.mapboxPlaceId]);
    await conn.commit();await writeAudit(req,"CREATE","company",Number(result.insertId),undefined,{...d,latitude:geo.latitude,longitude:geo.longitude});res.status(201).json({id:Number(result.insertId),latitude:geo.latitude,longitude:geo.longitude});
  }catch(error:any){await conn.rollback();if(error?.code==="ER_DUP_ENTRY")return res.status(409).json({message:"CNPJ já cadastrado neste tenant."});throw error;}finally{conn.release();}
});

companiesRouter.put("/:id",requireRole("SUPER_ADMIN","TENANT_ADMIN"),async(req,res)=>{
  const id=Number(req.params.id),parsed=schema.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:"Dados inválidos.",issues:parsed.error.flatten()});const d=parsed.data;
  const [before]=await pool.query<any[]>("SELECT * FROM companies WHERE id=? AND tenant_id=? LIMIT 1",[id,req.auth!.tenantId]);if(!before[0])return res.status(404).json({message:"Empresa não encontrada."});
  let geo:any;try{geo=await coordinates(d);}catch(error:any){return res.status(400).json({message:`Não foi possível validar o endereço da empresa: ${error?.message||"erro no Mapbox"}`});}
  const conn=await pool.getConnection();try{await conn.beginTransaction();await conn.query(`UPDATE companies SET legal_name=?,trade_name=?,cnpj=?,active=?,updated_at=${BRASILIA_NOW_SQL} WHERE id=? AND tenant_id=?`,[d.legalName,d.tradeName||null,d.cnpj||null,d.active?1:0,id,req.auth!.tenantId]);
    await conn.query(`INSERT INTO company_profiles (${profileCols}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL}) ON DUPLICATE KEY UPDATE phone=VALUES(phone),email=VALUES(email),address=VALUES(address),zip_code=VALUES(zip_code),street=VALUES(street),address_number=VALUES(address_number),complement=VALUES(complement),district=VALUES(district),city=VALUES(city),state=VALUES(state),country=VALUES(country),latitude=VALUES(latitude),longitude=VALUES(longitude),punch_radius_meters=VALUES(punch_radius_meters),require_location=VALUES(require_location),block_outside_radius=VALUES(block_outside_radius),max_gps_accuracy_meters=VALUES(max_gps_accuracy_meters),require_device_biometric=VALUES(require_device_biometric),require_registered_device=VALUES(require_registered_device),max_registered_devices=VALUES(max_registered_devices),enforce_schedule_window=VALUES(enforce_schedule_window),schedule_early_margin_minutes=VALUES(schedule_early_margin_minutes),schedule_late_margin_minutes=VALUES(schedule_late_margin_minutes),require_face_recognition=0,mapbox_place_id=VALUES(mapbox_place_id),updated_at=VALUES(updated_at)`,[req.auth!.tenantId,id,d.phone||null,d.email||null,geo.address,d.zipCode||null,d.street||null,d.number||null,d.complement||null,d.district||null,d.city||null,d.state||null,(d.country||"BR").toUpperCase(),geo.latitude,geo.longitude,d.punchRadiusMeters,d.requireLocation?1:0,d.blockOutsideRadius?1:0,d.maxGpsAccuracyMeters,d.requireDeviceBiometric?1:0,d.requireRegisteredDevice?1:0,d.maxRegisteredDevices,d.enforceScheduleWindow?1:0,d.scheduleEarlyMarginMinutes,d.scheduleLateMarginMinutes,geo.mapboxPlaceId]);
    await conn.commit();await writeAudit(req,"UPDATE","company",id,before[0],{...d,latitude:geo.latitude,longitude:geo.longitude});res.json({ok:true,latitude:geo.latitude,longitude:geo.longitude});
  }catch(error:any){await conn.rollback();if(error?.code==="ER_DUP_ENTRY")return res.status(409).json({message:"CNPJ já cadastrado neste tenant."});throw error;}finally{conn.release();}
});

companiesRouter.delete("/:id",requireRole("SUPER_ADMIN","TENANT_ADMIN"),async(req,res)=>{const id=Number(req.params.id);const [result]=await pool.query<any>(`UPDATE companies SET active=0,updated_at=${BRASILIA_NOW_SQL} WHERE id=? AND tenant_id=?`,[id,req.auth!.tenantId]);if(!result.affectedRows)return res.status(404).json({message:"Empresa não encontrada."});await writeAudit(req,"DEACTIVATE","company",id);res.json({ok:true})});
