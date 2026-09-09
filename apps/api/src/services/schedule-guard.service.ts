import { pool } from "../db/pool.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";

export type ScheduleDecision = "ALLOWED" | "BLOCKED" | "NOT_REQUIRED";

function timeToMinutes(value?: string | null) {
  if (!value) return null;
  const [h,m] = String(value).slice(0,5).split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}
function hhmm(value?: string | null) { return value ? String(value).slice(0,5) : null; }

function expectedSequence(day:any): string[] {
  const hasFirst = Boolean(day?.entry_1 && day?.exit_1);
  const hasSecond = Boolean(day?.entry_2 && day?.exit_2);
  if (hasFirst && hasSecond) return ["CLOCK_IN","BREAK_OUT","BREAK_IN","CLOCK_OUT"];
  if (hasFirst) return ["CLOCK_IN","CLOCK_OUT"];
  return [];
}

function scheduleText(day:any) {
  if (!day || day.is_day_off) return "Folga";
  const parts:string[]=[];
  if(day.entry_1 && day.exit_1) parts.push(`${hhmm(day.entry_1)}–${hhmm(day.exit_1)}`);
  if(day.entry_2 && day.exit_2) parts.push(`${hhmm(day.entry_2)}–${hhmm(day.exit_2)}`);
  return parts.join(" / ") || "Sem horários";
}

function dateMinusOne(iso:string){
  const d=new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate()-1);
  return d.toISOString().slice(0,10);
}

export async function evaluateEmployeeSchedule(args:{tenantId:number;employeeId:number;companyId:number}) {
  const [policyRows]=await pool.query<any[]>(`
    SELECT enforce_schedule_window,schedule_early_margin_minutes,schedule_late_margin_minutes
      FROM company_profiles WHERE tenant_id=? AND company_id=? LIMIT 1`,
    [args.tenantId,args.companyId]
  );
  const p=policyRows[0]||{};
  const policy={
    enforceScheduleWindow:p.enforce_schedule_window===undefined?true:Boolean(p.enforce_schedule_window),
    earlyMarginMinutes:Number(p.schedule_early_margin_minutes??120),
    lateMarginMinutes:Number(p.schedule_late_margin_minutes??240)
  };

  const [nowRows]=await pool.query<any[]>(`
    SELECT DATE_FORMAT(${BRASILIA_NOW_SQL}, '%Y-%m-%d') AS work_date,
           TIME_FORMAT(${BRASILIA_NOW_SQL}, '%H:%i:%s') AS now_time,
           DAYOFWEEK(${BRASILIA_NOW_SQL})-1 AS weekday`);
  const now=nowRows[0];
  const workDate=String(now.work_date).slice(0,10);
  const nowMinutes=timeToMinutes(now.now_time) ?? 0;
  const weekday=Number(now.weekday);
  const previousWeekday=(weekday+6)%7;

  const [rows]=await pool.query<any[]>(`
    SELECT e.work_schedule_id,ws.name AS schedule_name,ws.active,
           d.weekday,d.is_day_off,d.entry_1,d.exit_1,d.entry_2,d.exit_2,d.expected_minutes
      FROM employees e
      LEFT JOIN work_schedules ws ON ws.id=e.work_schedule_id AND ws.tenant_id=e.tenant_id
      LEFT JOIN work_schedule_days d ON d.work_schedule_id=ws.id AND d.tenant_id=ws.tenant_id
        AND d.weekday IN (?,?)
     WHERE e.id=? AND e.tenant_id=?`,
    [weekday,previousWeekday,args.employeeId,args.tenantId]
  );

  const scheduleId=rows[0]?.work_schedule_id?Number(rows[0].work_schedule_id):null;
  if(!scheduleId || !rows[0]?.active){
    return {
      decision:policy.enforceScheduleWindow?"BLOCKED" as ScheduleDecision:"NOT_REQUIRED" as ScheduleDecision,
      message:policy.enforceScheduleWindow?"Funcionário sem jornada ativa vinculada. Solicite ao RH a configuração da jornada.":null,
      policy,workDate,weekday,scheduleId:null,scheduleName:null,day:null,scheduleText:null,
      expectedSequence:[] as string[],nextType:"OTHER" as string|null,complete:false,entriesCount:0
    };
  }

  const today=rows.find((r:any)=>Number(r.weekday)===weekday)||null;
  const prev=rows.find((r:any)=>Number(r.weekday)===previousWeekday)||null;

  type Candidate={day:any;relativeNow:number;date:string;weekday:number};
  const candidates:Candidate[]=[];
  if(today && !today.is_day_off) candidates.push({day:today,relativeNow:nowMinutes,date:workDate,weekday});
  if(prev && !prev.is_day_off){
    const start=timeToMinutes(prev.entry_1), end=timeToMinutes(prev.exit_2||prev.exit_1);
    if(start!=null && end!=null && end<=start) candidates.push({day:prev,relativeNow:nowMinutes+1440,date:dateMinusOne(workDate),weekday:previousWeekday});
  }

  let chosen:Candidate|null=null;
  for(const c of candidates){
    const start=timeToMinutes(c.day.entry_1);
    let end=timeToMinutes(c.day.exit_2||c.day.exit_1);
    if(start==null || end==null) continue;
    if(end<=start) end+=1440;
    if(c.relativeNow >= start-policy.earlyMarginMinutes && c.relativeNow <= end+policy.lateMarginMinutes){
      chosen=c; break;
    }
  }

  if(!chosen){
    const day=today;
    const text=scheduleText(day);
    const reason=day?.is_day_off
      ? `Hoje é folga na jornada ${rows[0]?.schedule_name||""}.`
      : `Horário fora da janela permitida da jornada (${text}).`;
    return {
      decision:policy.enforceScheduleWindow?"BLOCKED" as ScheduleDecision:"NOT_REQUIRED" as ScheduleDecision,
      message:policy.enforceScheduleWindow?reason:null,
      policy,workDate,weekday,scheduleId,scheduleName:rows[0]?.schedule_name||null,day,
      scheduleText:text,expectedSequence:expectedSequence(day),nextType:"OTHER" as string|null,complete:false,entriesCount:0
    };
  }

  const seq=expectedSequence(chosen.day);
  const startDateTime=`${chosen.date} ${String(chosen.day.entry_1).slice(0,8)}`;
  const [entryRows]=await pool.query<any[]>(`
    SELECT id,entry_type,registered_at
      FROM time_entries
     WHERE tenant_id=? AND employee_id=?
       AND registered_at >= DATE_SUB(?, INTERVAL ? MINUTE)
       AND registered_at <= ${BRASILIA_NOW_SQL}
     ORDER BY registered_at`,
    [args.tenantId,args.employeeId,startDateTime,policy.earlyMarginMinutes]
  );
  const count=entryRows.length;
  const complete=seq.length>0 && count>=seq.length;
  const nextType:string|null=seq.length ? (seq[count] || null) : "OTHER";

  return {
    decision:"ALLOWED" as ScheduleDecision,
    message:null,policy,workDate:chosen.date,weekday:chosen.weekday,scheduleId,
    scheduleName:rows[0]?.schedule_name||null,day:chosen.day,
    scheduleText:scheduleText(chosen.day),expectedSequence:seq,nextType,complete,entriesCount:count
  };
}
