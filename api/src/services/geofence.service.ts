import { pool } from "../db/pool.js";

export type GeofenceDecision = "ALLOWED" | "WARNED" | "BLOCKED" | "NOT_REQUIRED";

type AllowedLocation = {
  id: number | null;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  mode: "WARN" | "BLOCK";
  source: "WORK_LOCATION" | "COMPANY_DEFAULT";
};

export function haversineMeters(lat1:number, lon1:number, lat2:number, lon2:number){
  const toRad=(deg:number)=>(deg*Math.PI)/180;
  const R=6371000;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

export async function getCompanySecurityPolicy(tenantId:number, companyId:number){
  const [rows]=await pool.query<any[]>(`
    SELECT p.latitude,p.longitude,p.punch_radius_meters,p.require_location,
           p.block_outside_radius,p.max_gps_accuracy_meters,
           p.require_device_biometric,p.require_registered_device,p.max_registered_devices,
           p.enforce_schedule_window,p.schedule_early_margin_minutes,p.schedule_late_margin_minutes,
           p.address,p.street,p.address_number,p.city,p.state
      FROM company_profiles p
     WHERE p.tenant_id=? AND p.company_id=? LIMIT 1`,[tenantId,companyId]);
  const p=rows[0]||{};
  return {
    latitude:p.latitude==null?null:Number(p.latitude),
    longitude:p.longitude==null?null:Number(p.longitude),
    punchRadiusMeters:Number(p.punch_radius_meters||1000),
    requireLocation:p.require_location===undefined?true:Boolean(p.require_location),
    blockOutsideRadius:p.block_outside_radius===undefined?true:Boolean(p.block_outside_radius),
    maxGpsAccuracyMeters:Number(p.max_gps_accuracy_meters||100),
    requireDeviceBiometric:p.require_device_biometric===undefined?true:Boolean(p.require_device_biometric),
    requireRegisteredDevice:p.require_registered_device===undefined?true:Boolean(p.require_registered_device),
    maxRegisteredDevices:Number(p.max_registered_devices||1),
    enforceScheduleWindow:p.enforce_schedule_window===undefined?true:Boolean(p.enforce_schedule_window),
    scheduleEarlyMarginMinutes:Number(p.schedule_early_margin_minutes??120),
    scheduleLateMarginMinutes:Number(p.schedule_late_margin_minutes??240),
    address:p.address||[p.street,p.address_number,p.city,p.state].filter(Boolean).join(", ")||null
  };
}

export async function evaluateEmployeeGeofence(args:{tenantId:number;companyId:number;employeeId:number;latitude?:number|null;longitude?:number|null;accuracy?:number|null;mocked?:boolean|null}){
  const {tenantId,companyId,employeeId,latitude,longitude,accuracy,mocked}=args;
  const policy=await getCompanySecurityPolicy(tenantId,companyId);

  if (mocked) return {decision:"BLOCKED" as GeofenceDecision,message:"Localização simulada detectada. Registro bloqueado.",withinRadius:false,distanceMeters:null,location:null,policy};
  if (policy.requireLocation && (latitude==null || longitude==null)) return {decision:"BLOCKED" as GeofenceDecision,message:"Localização obrigatória para registrar o ponto.",withinRadius:false,distanceMeters:null,location:null,policy};
  if (accuracy!=null && accuracy>policy.maxGpsAccuracyMeters) return {decision:"BLOCKED" as GeofenceDecision,message:`Precisão do GPS insuficiente (${Math.round(accuracy)} m). Tente novamente até obter precisão de ${policy.maxGpsAccuracyMeters} m ou melhor.`,withinRadius:false,distanceMeters:null,location:null,policy};

  const [rows]=await pool.query<any[]>(`
    SELECT wl.id,wl.name,wl.latitude,wl.longitude,wl.radius_meters,wl.geo_mode
      FROM employee_locations el
      JOIN work_locations wl ON wl.id=el.work_location_id AND wl.tenant_id=el.tenant_id
     WHERE el.tenant_id=? AND el.employee_id=? AND wl.active=1
       AND wl.geo_mode <> 'DISABLED' AND wl.latitude IS NOT NULL AND wl.longitude IS NOT NULL
       AND wl.radius_meters IS NOT NULL`,[tenantId,employeeId]);

  const locations:AllowedLocation[]=rows.map((r:any)=>({
    id:Number(r.id),name:r.name,latitude:Number(r.latitude),longitude:Number(r.longitude),radiusMeters:Number(r.radius_meters),mode:r.geo_mode==="BLOCK"?"BLOCK":"WARN",source:"WORK_LOCATION" as const
  }));

  if (!locations.length && policy.latitude!=null && policy.longitude!=null) locations.push({id:null,name:"Endereço padrão da empresa",latitude:policy.latitude,longitude:policy.longitude,radiusMeters:policy.punchRadiusMeters,mode:policy.blockOutsideRadius?"BLOCK":"WARN",source:"COMPANY_DEFAULT"});

  if (!locations.length) {
    if (policy.requireLocation) return {decision:"BLOCKED" as GeofenceDecision,message:"A empresa ainda não possui coordenadas configuradas para o ponto.",withinRadius:false,distanceMeters:null,location:null,policy};
    return {decision:"NOT_REQUIRED" as GeofenceDecision,message:null,withinRadius:null,distanceMeters:null,location:null,policy};
  }
  if (latitude==null || longitude==null) return {decision:policy.requireLocation?"BLOCKED":"WARNED" as GeofenceDecision,message:"Não foi possível obter a localização.",withinRadius:false,distanceMeters:null,location:null,policy};

  const evaluated=locations.map(loc=>({loc,distance:haversineMeters(latitude,longitude,loc.latitude,loc.longitude)})).sort((a,b)=>a.distance-b.distance);
  const inside=evaluated.find(x=>x.distance<=x.loc.radiusMeters);
  if (inside) return {decision:"ALLOWED" as GeofenceDecision,message:null,withinRadius:true,distanceMeters:inside.distance,location:inside.loc,policy};

  const nearest=evaluated[0];
  const mustBlock=policy.blockOutsideRadius || locations.some(x=>x.mode==="BLOCK");
  return {
    decision:mustBlock?"BLOCKED" as GeofenceDecision:"WARNED" as GeofenceDecision,
    message:`Você está fora da área permitida. Local de referência: ${nearest.loc.name}. Distância aproximada: ${Math.round(nearest.distance)} m. Raio permitido: ${nearest.loc.radiusMeters} m.`,
    withinRadius:false,
    distanceMeters:nearest.distance,
    location:nearest.loc,
    policy
  };
}
