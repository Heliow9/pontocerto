import { Router } from "express";
import PDFDocument from "pdfkit";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { minutesToHHMM } from "../utils/time.js";
import { isIsoDate, ptDate, weekdayShortPt } from "../utils/date.js";
import { processPeriod } from "../services/calculation.service.js";
import { payrollExportsRouter } from "./payroll-exports.routes.js";

export const reportsRouter = Router();
reportsRouter.use(authMiddleware, requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH", "GESTOR", "SUPERVISOR"));
reportsRouter.use("/payroll", payrollExportsRouter);

async function loadReport(tenantId: number, employeeId: number, start: string, end: string) {
  await processPeriod({ tenantId, employeeId, start, end });

  const [employees] = await pool.query<any[]>(
    `SELECT e.*, c.legal_name AS company_name, c.trade_name, c.cnpj,
            s.name AS schedule_name, ts.report_title, ts.report_footer,
            cp.address, cp.city, cp.state, cp.phone
       FROM employees e
       JOIN companies c ON c.id=e.company_id AND c.tenant_id=e.tenant_id
       LEFT JOIN work_schedules s ON s.id=e.work_schedule_id AND s.tenant_id=e.tenant_id
       LEFT JOIN tenant_settings ts ON ts.tenant_id=e.tenant_id
       LEFT JOIN company_profiles cp ON cp.company_id=c.id AND cp.tenant_id=c.tenant_id
      WHERE e.id=? AND e.tenant_id=? LIMIT 1`,
    [employeeId, tenantId]
  );
  const employee = employees[0];
  if (!employee) return null;

  const [scheduleDays] = employee.work_schedule_id
    ? await pool.query<any[]>(
        `SELECT weekday, is_day_off, entry_1, exit_1, entry_2, exit_2, expected_minutes
           FROM work_schedule_days WHERE tenant_id=? AND work_schedule_id=? ORDER BY weekday`,
        [tenantId, employee.work_schedule_id]
      )
    : [[]];

  const [days] = await pool.query<any[]>(
    `SELECT work_date, status, status_label, points_text, expected_minutes, worked_minutes,
            normal_minutes, overtime_minutes, late_minutes, absence_minutes, time_bank_minutes
       FROM daily_time_calculations
      WHERE tenant_id=? AND employee_id=? AND work_date BETWEEN ? AND ?
      ORDER BY work_date`,
    [tenantId, employeeId, start, end]
  );

  return { employee, scheduleDays, days };
}

reportsRouter.get("/monthly-data/:employeeId", async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const start = String(req.query.start || "");
  const end = String(req.query.end || "");
  if (!isIsoDate(start) || !isIsoDate(end) || end < start) {
    return res.status(400).json({ message: "Período inválido." });
  }
  const data = await loadReport(req.auth!.tenantId, employeeId, start, end);
  if (!data) return res.status(404).json({ message: "Funcionário não encontrado." });
  res.json(data);
});

reportsRouter.get("/monthly/:employeeId", async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const start = String(req.query.start || "");
  const end = String(req.query.end || "");
  if (!isIsoDate(start) || !isIsoDate(end) || end < start) {
    return res.status(400).json({ message: "Use start e end no formato YYYY-MM-DD." });
  }
  const data = await loadReport(req.auth!.tenantId, employeeId, start, end);
  if (!data) return res.status(404).json({ message: "Funcionário não encontrado." });
  const { employee, scheduleDays, days } = data;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="espelho-ponto-${employeeId}-${start}-${end}.pdf"`);

  const doc = new PDFDocument({ size: "A4", margin: 24, bufferPages: true });
  doc.pipe(res);

  const pageWidth = doc.page.width;
  const left = 24;
  const right = pageWidth - 24;

  function header() {
    doc.rect(left, 24, right - left, 34).fill("#1f3b68");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(17)
      .text(employee.report_title || "Relatório de Pontos", left + 12, 34, { align: "right", width: right - left - 24 });
    doc.fillColor("#111827");
  }

  header();
  let y = 72;
  doc.font("Helvetica-Bold").fontSize(7.8);
  const employeeLines = [
    `NOME: ${employee.name}`,
    `CPF: ${employee.cpf || "-"}`,
    `PIS: ${employee.pis || "-"}`,
    `MATRÍCULA: ${employee.registration_number || "-"}`,
    `DATA DE ADMISSÃO: ${employee.admission_date ? ptDate(employee.admission_date) : "-"}`,
    `CTPS: ${employee.ctps || "-"}`,
    `CARGO: ${employee.position_name || "-"}`,
    `EMPRESA: ${employee.company_name}`,
    `CNPJ: ${employee.cnpj || "-"}`,
    `PERÍODO: ${ptDate(start)} a ${ptDate(end)}`
  ];
  for (const line of employeeLines) { doc.text(line, left, y); y += 10; }

  const weekdayNames = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const scheduleX = 360;
  let sy = 72;
  doc.font("Helvetica-Bold").fontSize(8).text("Horários de Trabalho", scheduleX, sy, { width: 205, align: "right" });
  sy += 11;
  doc.font("Helvetica").fontSize(7.5);
  for (const wd of weekdayNames.map((name, i) => ({ name, i }))) {
    const row = scheduleDays.find((d: any) => Number(d.weekday) === wd.i);
    let text = "Folga";
    if (row && !row.is_day_off) {
      text = [row.entry_1, row.exit_1, row.entry_2, row.exit_2].filter(Boolean).map((x: string) => x.slice(0,5)).join(" ");
    }
    doc.text(`${wd.name}: ${text}`, scheduleX, sy, { width: 205, align: "right" });
    sy += 9;
  }

  y = Math.max(y + 6, sy + 6);

  const headers = ["DATA", "STATUS", "PONTOS", "CH", "HT_NORMAIS", "EX_EN", "AT", "FA"];
  const widths = [78, 88, 126, 45, 68, 52, 45, 45];
  const rowHeight = 17;

  function tableHeader() {
    let x = left;
    doc.fillColor("#e5e7eb");
    for (let i = 0; i < headers.length; i++) {
      doc.rect(x, y, widths[i], rowHeight).fillAndStroke("#e5e7eb", "#cbd5e1");
      doc.fillColor("#111827").font("Helvetica-Bold").fontSize(6.8)
        .text(headers[i], x + 2, y + 5, { width: widths[i] - 4, align: "center" });
      x += widths[i];
    }
    y += rowHeight;
  }

  function addPageIfNeeded() {
    if (y <= 755) return;
    doc.addPage();
    y = 30;
    tableHeader();
  }

  tableHeader();
  let totalExpected = 0, totalNormal = 0, totalOvertime = 0, totalLate = 0, totalAbsence = 0;

  for (const d of days) {
    addPageIfNeeded();
    totalExpected += Number(d.expected_minutes || 0);
    totalNormal += Number(d.normal_minutes || 0);
    totalOvertime += Number(d.overtime_minutes || 0);
    totalLate += Number(d.late_minutes || 0);
    totalAbsence += Number(d.absence_minutes || 0);

    const isSpecial = ["FOLGA", "FERIADO", "FALTA", "ATESTADO", "FERIAS", "AFASTAMENTO", "LICENCA", "ABONO"].includes(d.status);
    const statusText = d.status === "NORMAL" ? "" : (d.status_label || d.status);
    const values = [
      `${ptDate(d.work_date)} - ${weekdayShortPt(d.work_date)}`,
      statusText,
      d.points_text || "",
      d.expected_minutes ? minutesToHHMM(d.expected_minutes) : "",
      d.normal_minutes ? minutesToHHMM(d.normal_minutes) : "",
      d.overtime_minutes ? minutesToHHMM(d.overtime_minutes) : "",
      d.late_minutes ? minutesToHHMM(-Math.abs(d.late_minutes)) : "",
      d.absence_minutes ? minutesToHHMM(-Math.abs(d.absence_minutes)) : ""
    ];
    let x = left;
    for (let i = 0; i < values.length; i++) {
      doc.rect(x, y, widths[i], rowHeight).stroke("#d1d5db");
      if (isSpecial && i === 1) doc.fillColor(d.status === "FALTA" ? "#b91c1c" : "#a16207");
      else if ((i === 6 && d.late_minutes) || (i === 7 && d.absence_minutes)) doc.fillColor("#b91c1c");
      else doc.fillColor("#111827");
      doc.font(i === 1 && isSpecial ? "Helvetica-Bold" : "Helvetica").fontSize(6.5)
        .text(String(values[i]), x + 2, y + 5, { width: widths[i] - 4, align: "center", ellipsis: true });
      x += widths[i];
    }
    y += rowHeight;
  }

  addPageIfNeeded();
  y += 9;
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(7.4)
    .text(`AT - Atraso ${minutesToHHMM(-totalLate)}`, left, y)
    .text(`FA - Falta ${minutesToHHMM(-totalAbsence)}`, left + 120, y)
    .text(`CH - Carga Hr ${minutesToHHMM(totalExpected)}`, left + 235, y)
    .text(`HT_NORMAIS - Normais Tot ${minutesToHHMM(totalNormal)}`, left + 365, y);
  y += 12;
  doc.text(`EX_EN - Extra Tot ${minutesToHHMM(totalOvertime)}`, left, y);

  y += 48;
  doc.font("Helvetica").fontSize(7).text("______________________________", left + 70, y);
  doc.text("______________________________", right - 210, y);
  y += 10;
  doc.text("Assinatura do Funcionário", left + 76, y);
  doc.text("Assinatura do Responsável", right - 205, y);

  y += 28;
  const footer = employee.report_footer || "Ponto Certo SaaS - Sistema de gestão de jornada";
  doc.fontSize(6.5).fillColor("#4b5563").text(
    `${footer} - emitido em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
    left, y, { width: right - left, align: "center" }
  );
  doc.end();
});
