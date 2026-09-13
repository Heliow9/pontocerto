import { pool } from "../db/pool.js";
import { liveOvertimeEvent } from "./live-overtime-rules.js";
import { hoursText } from "./overtime-rules.js";

type Company = {
  tenant_id: number;
  company_id: number;
  legal_name: string;
  schedule_early_margin_minutes?: number | null;
};
type EmployeeSummary = {
  id: number;
  name: string;
  group_name: string | null;
  work_schedule_id: number | null;
  reference_minutes: number | null;
  overtime_minutes: number;
};

export async function collectLiveOvertimeAlerts(
  company: Company,
  employees: EmployeeSummary[],
  recipients: { phone: string }[],
  month: string,
  now: number,
) {
  const eligible = employees.filter(
    (employee) =>
      employee.work_schedule_id &&
      Number(employee.reference_minutes) > 0 &&
      Number(employee.overtime_minutes) > Number(employee.reference_minutes),
  );
  if (!eligible.length || !recipients.length) return;
  const detectedAt = new Date(now - 3 * 3600000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const today = detectedAt.slice(0, 10);
  const dates = [-2, -1, 0].map((offset) =>
    new Date(Date.parse(`${today}T12:00:00Z`) + offset * 86400000)
      .toISOString()
      .slice(0, 10),
  );
  const [holidays] = await pool.query<any[]>(
    "SELECT holiday_date FROM holidays WHERE tenant_id=? AND (company_id IS NULL OR company_id=?) AND holiday_date BETWEEN ? AND ?",
    [company.tenant_id, company.company_id, dates[0], today],
  );
  for (const employee of eligible) {
    const [days] = await pool.query<any[]>(
      `SELECT d.weekday,d.is_day_off,d.entry_1,d.exit_1,d.entry_2,d.exit_2
         FROM work_schedule_days d JOIN work_schedules s ON s.id=d.work_schedule_id AND s.tenant_id=d.tenant_id
        WHERE d.tenant_id=? AND d.work_schedule_id=? AND s.company_id=? AND s.active=1`,
      [company.tenant_id, employee.work_schedule_id, company.company_id],
    );
    const [punches] = await pool.query<any[]>(
      `SELECT id,entry_type,registered_at,scheduled_work_date FROM time_entries
        WHERE tenant_id=? AND company_id=? AND employee_id=? AND registered_at BETWEEN ? AND ?`,
      [
        company.tenant_id,
        company.company_id,
        employee.id,
        `${dates[0]} 00:00:00`,
        detectedAt,
      ],
    );
    for (const workDate of dates) {
      // Use the allowance for the month this shift started in.
      if (
        !workDate.startsWith(month) ||
        holidays.some(
          (holiday) => holiday.holiday_date.slice(0, 10) === workDate,
        )
      )
        continue;
      const weekday = new Date(`${workDate}T12:00:00Z`).getUTCDay();
      const day = days.find(
        (candidate) => Number(candidate.weekday) === weekday,
      );
      if (!day) continue;
      const event = liveOvertimeEvent({
        day,
        workDate,
        punches,
        reference: Number(employee.reference_minutes),
        accumulated: Number(employee.overtime_minutes),
        now,
        earlyMarginMinutes: Number(
          company.schedule_early_margin_minutes ?? 120,
        ),
      });
      if (!event) continue;
      const message = `PontoCerto — Horas extras após a referência mensal\nEmpresa: ${company.legal_name}\nFuncionário: ${employee.name}\nGrupo: ${employee.group_name || "Sem grupo"}\nCompetência: ${month}\nJornada: ${workDate}\nSaída prevista: ${event.time}\nDetectado em: ${detectedAt} (Brasília)\nO horário de saída foi ultrapassado e o ponto permanece aberto.\nAcumulado mensal já apurado: ${hoursText(Number(employee.overtime_minutes))} de ${hoursText(Number(employee.reference_minutes))}. O período em aberto ainda não está incluído.\nO registro de ponto permanece liberado.`;
      for (const recipient of recipients) {
        await pool.query(
          `INSERT INTO overtime_alerts(tenant_id,company_id,employee_id,month_key,threshold_key,recipient,message_text)
           VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id`,
          [
            company.tenant_id,
            company.company_id,
            employee.id,
            month,
            event.key,
            recipient.phone,
            message,
          ],
        );
      }
    }
  }
}
