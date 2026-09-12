import { pool } from "../db/pool.js";
import { processPeriod } from "./calculation.service.js";
import { hoursText, reachedThresholds } from "./overtime-rules.js";

export async function overtimeSummary(
  tenantId: number,
  companyId: number,
  month: string,
) {
  const start = `${month}-01`;
  const end = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  )
    .toISOString()
    .slice(0, 10);
  const [employees] = await pool.query<any[]>(
    "SELECT id FROM employees WHERE tenant_id=? AND company_id=? AND active=1",
    [tenantId, companyId],
  );
  await processPeriod({
    tenantId,
    start,
    end,
    employeeIds: employees.map((e) => Number(e.id)),
  });
  const [rows] = await pool.query<any[]>(
    `SELECT e.id,e.name,g.name AS group_name,
 COALESCE(i.monthly_minutes,r.monthly_minutes) AS reference_minutes,
 CASE WHEN i.monthly_minutes IS NOT NULL THEN 'INDIVIDUAL' ELSE 'GROUP' END AS reference_source,
 COALESCE(SUM(d.overtime_minutes),0) AS overtime_minutes
 FROM employees e
 LEFT JOIN employee_groups g ON g.id=e.group_id AND g.tenant_id=e.tenant_id AND g.company_id=e.company_id
 LEFT JOIN overtime_references i ON i.tenant_id=e.tenant_id AND i.company_id=e.company_id AND i.entity_kind='employee' AND i.entity_id=e.id
 LEFT JOIN overtime_references r ON r.tenant_id=e.tenant_id AND r.company_id=e.company_id AND r.entity_kind='group' AND r.entity_id=g.id
 LEFT JOIN daily_time_calculations d ON d.employee_id=e.id AND d.tenant_id=e.tenant_id AND d.company_id=e.company_id AND d.work_date BETWEEN ? AND ?
 WHERE e.tenant_id=? AND e.company_id=? AND e.active=1
 GROUP BY e.id,e.name,g.name,i.monthly_minutes,r.monthly_minutes ORDER BY e.name`,
    [start, end, tenantId, companyId],
  );
  return rows;
}

export async function collectOvertimeAlerts() {
  const month = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 7);
  await pool.query(
    "UPDATE overtime_alerts SET status='EXPIRED' WHERE status='PENDING' AND month_key<?",
    [month],
  );
  const [companies] = await pool.query<any[]>(
    `SELECT a.*,c.legal_name FROM company_automation a JOIN companies c ON c.id=a.company_id AND c.tenant_id=a.tenant_id AND c.active=1 JOIN tenants t ON t.id=a.tenant_id AND t.status='ACTIVE' WHERE a.overtime_enabled=1`,
  );
  for (const company of companies) {
    await pool.query(
      `UPDATE overtime_alerts a LEFT JOIN employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id AND e.company_id=a.company_id SET a.status='CANCELED' WHERE a.tenant_id=? AND a.company_id=? AND a.status='PENDING' AND (e.id IS NULL OR e.active=0)`,
      [company.tenant_id, company.company_id],
    );
    const rows = await overtimeSummary(
      company.tenant_id,
      company.company_id,
      month,
    );
    const recipients: { name: string; phone: string }[] = JSON.parse(
      company.recipients || "[]",
    );
    for (const row of rows) {
      const minutes = Number(row.overtime_minutes),
        reference =
          row.reference_minutes == null ? null : Number(row.reference_minutes);
      const thresholds = reachedThresholds(minutes, reference);
      await pool.query(
        `UPDATE overtime_alerts SET status='CANCELED' WHERE tenant_id=? AND company_id=? AND employee_id=? AND month_key=? AND status='PENDING'${thresholds.length ? ` AND threshold_key NOT IN (${thresholds.map(() => "?").join(",")})` : ""}`,
        [company.tenant_id, company.company_id, row.id, month, ...thresholds],
      );
      for (const threshold of thresholds) {
        const message = `PontoCerto — Horas extras\nEmpresa: ${company.legal_name}\nFuncionário: ${row.name}\nGrupo: ${row.group_name || "Sem grupo"}\nCompetência: ${month}\nAcumulado: ${hoursText(minutes)} de ${hoursText(reference!)} (${Math.floor((minutes / reference!) * 100)}%)\n${threshold === "OVER" ? "Referência ultrapassada" : `Marco de ${threshold}% atingido`}. O registro de ponto permanece liberado.`;
        for (const recipient of recipients)
          await pool.query(
            `INSERT INTO overtime_alerts(tenant_id,company_id,employee_id,month_key,threshold_key,recipient,message_text) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE message_text=IF(status IN ('PENDING','CANCELED'),VALUES(message_text),message_text),status=IF(status='CANCELED','PENDING',status)`,
            [
              company.tenant_id,
              company.company_id,
              row.id,
              month,
              threshold,
              recipient.phone,
              message,
            ],
          );
      }
    }
  }
}
