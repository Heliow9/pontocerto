import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { writeAudit } from "../utils/audit.js";

export const locationsRouter = Router();
locationsRouter.use(authMiddleware, requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH", "GESTOR", "SUPERVISOR"));

locationsRouter.get("/", async (req, res) => {
  const companyId = req.query.companyId ? Number(req.query.companyId) : null;
  const params:any[]=[req.auth!.tenantId];
  let filter="";
  if(companyId){filter=" AND wl.company_id=?";params.push(companyId)}
  const [rows] = await pool.query<any[]>(
    `SELECT wl.id, wl.company_id, wl.name, wl.address, wl.latitude, wl.longitude,
            wl.radius_meters, wl.geo_mode, wl.active, c.legal_name AS company_name,
            (SELECT COUNT(*) FROM employee_locations el WHERE el.work_location_id=wl.id AND el.tenant_id=wl.tenant_id) AS employee_count
       FROM work_locations wl
       JOIN companies c ON c.id=wl.company_id AND c.tenant_id=wl.tenant_id
      WHERE wl.tenant_id=? ${filter}
      ORDER BY wl.active DESC, wl.name`,
    params
  );
  res.json(rows);
});

const schema = z.object({
  companyId: z.number().int().positive(),
  name: z.string().min(2),
  address: z.string().optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  radiusMeters: z.number().int().min(10).max(50000).optional().nullable(),
  geoMode: z.enum(["DISABLED","WARN","BLOCK"]).default("DISABLED"),
  active: z.boolean().default(true)
});

locationsRouter.post("/", requireRole("SUPER_ADMIN","TENANT_ADMIN","RH"), async (req,res)=>{
  const parsed=schema.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:"Dados inválidos."});const d=parsed.data;
  const [companies]=await pool.query<any[]>("SELECT id FROM companies WHERE id=? AND tenant_id=? AND active=1 LIMIT 1",[d.companyId,req.auth!.tenantId]);
  if(!companies[0])return res.status(400).json({message:"Empresa inválida."});
  if(d.geoMode!=="DISABLED"&&(d.latitude==null||d.longitude==null||!d.radiusMeters))return res.status(400).json({message:"Informe latitude, longitude e raio para usar geolocalização."});
  const [result]=await pool.query<any>(`INSERT INTO work_locations (tenant_id,company_id,name,address,latitude,longitude,radius_meters,geo_mode,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,[req.auth!.tenantId,d.companyId,d.name,d.address||null,d.latitude??null,d.longitude??null,d.radiusMeters??null,d.geoMode,d.active?1:0]);
  await writeAudit(req,"CREATE","work_location",Number(result.insertId),undefined,d);res.status(201).json({id:Number(result.insertId)});
});

locationsRouter.put("/:id", requireRole("SUPER_ADMIN","TENANT_ADMIN","RH"), async (req,res)=>{
  const id=Number(req.params.id);const parsed=schema.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:"Dados inválidos."});const d=parsed.data;
  const [before]=await pool.query<any[]>("SELECT * FROM work_locations WHERE id=? AND tenant_id=? LIMIT 1",[id,req.auth!.tenantId]);if(!before[0])return res.status(404).json({message:"Local não encontrado."});
  if(d.geoMode!=="DISABLED"&&(d.latitude==null||d.longitude==null||!d.radiusMeters))return res.status(400).json({message:"Informe latitude, longitude e raio para usar geolocalização."});
  await pool.query(`UPDATE work_locations SET company_id=?,name=?,address=?,latitude=?,longitude=?,radius_meters=?,geo_mode=?,active=?,updated_at=${BRASILIA_NOW_SQL} WHERE id=? AND tenant_id=?`,[d.companyId,d.name,d.address||null,d.latitude??null,d.longitude??null,d.radiusMeters??null,d.geoMode,d.active?1:0,id,req.auth!.tenantId]);
  await writeAudit(req,"UPDATE","work_location",id,before[0],d);res.json({ok:true});
});

locationsRouter.delete("/:id", requireRole("SUPER_ADMIN","TENANT_ADMIN","RH"), async (req,res)=>{
  const id=Number(req.params.id);const [result]=await pool.query<any>(`UPDATE work_locations SET active=0,updated_at=${BRASILIA_NOW_SQL} WHERE id=? AND tenant_id=?`,[id,req.auth!.tenantId]);if(!result.affectedRows)return res.status(404).json({message:"Local não encontrado."});await writeAudit(req,"DEACTIVATE","work_location",id);res.json({ok:true});
});

locationsRouter.get("/employee/:employeeId", async (req,res)=>{
  const employeeId=Number(req.params.employeeId);const [rows]=await pool.query<any[]>(`SELECT wl.id,wl.name,wl.company_id,wl.address,wl.geo_mode,wl.radius_meters FROM employee_locations el JOIN work_locations wl ON wl.id=el.work_location_id AND wl.tenant_id=el.tenant_id WHERE el.tenant_id=? AND el.employee_id=? AND wl.active=1 ORDER BY wl.name`,[req.auth!.tenantId,employeeId]);res.json(rows);
});
