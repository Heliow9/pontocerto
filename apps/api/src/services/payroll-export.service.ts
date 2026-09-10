import { z } from "zod";

export const payrollFormats = [
  {
    id: "DOMINIO",
    name: "Domínio Sistemas — TXT",
    extension: "txt",
    instructions:
      "Importe como lançamentos do relógio ponto. Selecione horas decimais (2:30 = 2,50) e confira empresa, competência, processo e rubricas.",
    source:
      "https://suporte.dominioatendimento.com/ctsfiles/leiaute_importao_lanamentos_do_relgio_ponto_eletrnico.pdf?id=8207268",
  },
  {
    id: "SAGE",
    name: "Sage / IOB Gestão Contábil — TXT",
    extension: "txt",
    instructions:
      "Em Pagamento Mensal > Importação > Horas/Valores, selecione a empresa e o mês/ano informados aqui. Localize funcionários pelo código, sem vinculação. Horas em HHHMM. Eventos de falta configurados na Digitação Diária de Falta podem ser desconsiderados pelo ERP; confira essa rotina separadamente.",
    source: "https://ajudaonline.iob.com.br/SGC/crhmodpagimphvlay.htm",
  },
  {
    id: "QUESTOR",
    name: "Questor — CSV configurável (validar no ERP)",
    extension: "csv",
    instructions:
      "CSV para conferência com o modelo de Cálculo > Eventos Variáveis > Importação Planilha (versão 23.3.0.0 ou superior). A primeira coluna contém o funcionário e as demais usam os códigos de eventos como cabeçalho; separador ponto e vírgula. A compatibilidade deste modelo ainda precisa ser validada na sua instalação do Questor. Confira as colunas e o formato de horas com a contabilidade antes de importar.",
    source:
      "https://docs-consulta.questor.com.br/docs/folha-de-pagamento/eventos--variaveis-importacao-de-dados-por-arquivo",
  },
  {
    id: "CSV",
    name: "Outros ERPs — CSV de eventos",
    extension: "csv",
    instructions:
      "CSV com cabeçalho e separador ponto e vírgula. Relacione as colunas no importador do ERP. Este é um formato de intercâmbio e depende de configuração no sistema de destino.",
    source: null,
  },
] as const;

export const payrollEvents = [
  { key: "normal", label: "Horas normais", field: "normal_minutes" },
  { key: "overtime", label: "Horas extras (total)", field: "overtime_minutes" },
  { key: "late", label: "Atrasos", field: "late_minutes" },
  { key: "absence", label: "Faltas em horas", field: "absence_minutes" },
] as const;
export type EventKey = (typeof payrollEvents)[number]["key"];
export const formatSchema = z.enum(["DOMINIO", "SAGE", "QUESTOR", "CSV"]);
const code = z.string().trim().max(20);
export const profileSchema = z
  .object({
    companyCode: code.default(""),
    processCode: z.string().trim().max(2).default("11"),
    hourFormat: z.enum(["HHMM", "DECIMAL"]).default("HHMM"),
    events: z
      .object({
        normal: code.default(""),
        overtime: code.default(""),
        late: code.default(""),
        absence: code.default(""),
      })
      .strict(),
    employeeCodes: z.record(z.string().regex(/^\d+$/), code).default({}),
  })
  .strict();
export type PayrollProfile = z.infer<typeof profileSchema>;
export type PayrollFormat = z.infer<typeof formatSchema>;
export type ExportEmployee = {
  id: number;
  name: string;
  registration_number: string | null;
  admission_date: string | null;
  work_schedule_id: number | null;
  active: number;
};
export type PayrollDay = {
  employee_id: number;
  work_date: string;
  normal_minutes: number;
  overtime_minutes: number;
  late_minutes: number;
  absence_minutes: number;
};
export type PayrollRow = {
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  event: EventKey;
  label: string;
  eventCode: string;
  minutes: number;
};
export class PayrollValidationError extends Error {}

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export const exportSchema = z
  .object({
    companyId: z.number().int().positive(),
    format: formatSchema,
    start: z.string().refine(validDate),
    end: z.string().refine(validDate),
    competence: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    employeeIds: z
      .array(z.number().int().positive())
      .min(1)
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length),
    profile: profileSchema,
  })
  .strict()
  .refine(
    (v) =>
      v.start <= v.end &&
      (Date.parse(v.end) - Date.parse(v.start)) / 86400000 < 62,
    { message: "Selecione um período de até 62 dias." },
  );

function numeric(
  value: string,
  width: number,
  label: string,
  allowZero = false,
) {
  if (
    !/^\d+$/.test(value) ||
    value.length > width ||
    (!allowZero && Number(value) === 0)
  )
    throw new PayrollValidationError(
      `${label}: informe um código numérico de até ${width} dígitos${allowZero ? "" : ", maior que zero"}.`,
    );
  return value.padStart(width, "0");
}

export function validateProfile(
  format: PayrollFormat,
  profile: PayrollProfile,
  employees?: ExportEmployee[],
) {
  numeric(profile.companyCode, 10, "Código da empresa no ERP");
  if (format === "DOMINIO")
    numeric(profile.processCode, 2, "Tipo de processo", true);
  const used = new Set<string>();
  for (const event of payrollEvents) {
    const value = profile.events[event.key];
    if (!value) continue;
    const normalized = numeric(
      value,
      format === "SAGE" ? 5 : format === "DOMINIO" ? 4 : 10,
      `Rubrica de ${event.label}`,
    ).replace(/^0+/, "");
    if (used.has(normalized))
      throw new PayrollValidationError(
        "Use uma rubrica diferente para cada tipo de hora, evitando lançamentos duplicados.",
      );
    used.add(normalized);
  }
  if (!used.size)
    throw new PayrollValidationError(
      "Informe pelo menos uma rubrica para exportação.",
    );
  const employeeCodes = new Set<string>();
  for (const employee of employees || []) {
    const value =
      profile.employeeCodes[String(employee.id)] ??
      employee.registration_number ??
      "";
    const normalized = numeric(
      value,
      format === "SAGE" ? 5 : 10,
      `Matrícula no ERP de ${employee.name}`,
    ).replace(/^0+/, "");
    if (employeeCodes.has(normalized))
      throw new PayrollValidationError(
        "Há funcionários selecionados com a mesma matrícula no ERP. Corrija os códigos antes de exportar.",
      );
    employeeCodes.add(normalized);
  }
}

export function aggregatePayroll(
  employees: ExportEmployee[],
  days: PayrollDay[],
  profile: PayrollProfile,
) {
  const totals = new Map<number, Record<EventKey, number>>();
  const employeeById = new Map(employees.map((e) => [Number(e.id), e]));
  for (const day of days) {
    const employee = employeeById.get(Number(day.employee_id));
    if (
      !employee ||
      (employee.admission_date &&
        day.work_date.slice(0, 10) < employee.admission_date.slice(0, 10))
    )
      continue;
    const total = totals.get(employee.id) || {
      normal: 0,
      overtime: 0,
      late: 0,
      absence: 0,
    };
    for (const event of payrollEvents) {
      const value = Number(day[event.field]);
      if (!Number.isSafeInteger(value) || value < 0)
        throw new PayrollValidationError(
          `Apuração inválida para ${employee.name}. Reprocesse o período.`,
        );
      total[event.key] += value;
    }
    totals.set(employee.id, total);
  }
  const rows: PayrollRow[] = [];
  const warnings: string[] = [];
  for (const employee of employees) {
    const total = totals.get(employee.id);
    for (const event of payrollEvents) {
      const minutes = total?.[event.key] || 0;
      if (!minutes) continue;
      if (!profile.events[event.key]) {
        warnings.push(
          `${employee.name}: ${hours(minutes)} de ${event.label.toLowerCase()} não serão exportados (sem rubrica).`,
        );
        continue;
      }
      rows.push({
        employeeId: employee.id,
        employeeName: employee.name,
        employeeCode:
          profile.employeeCodes[String(employee.id)] ??
          employee.registration_number ??
          "",
        event: event.key,
        label: event.label,
        eventCode: profile.events[event.key],
        minutes,
      });
    }
    if (!rows.some((r) => r.employeeId === employee.id))
      warnings.push(
        `${employee.name}: nenhum evento com quantidade positiva para exportar.`,
      );
  }
  rows.sort(
    (a, b) =>
      Number(a.employeeCode) - Number(b.employeeCode) ||
      Number(a.eventCode) - Number(b.eventCode),
  );
  return { rows, warnings };
}

export function hours(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
function decimalHours(minutes: number) {
  return (Math.round((minutes * 100) / 60) / 100).toFixed(2).replace(".", ",");
}
function csvCell(value: string) {
  const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
export function renderPayroll(
  format: PayrollFormat,
  rows: PayrollRow[],
  profile: PayrollProfile,
  competence: string,
) {
  validateProfile(format, profile);
  for (const row of rows) {
    if (!Number.isSafeInteger(row.minutes) || row.minutes <= 0)
      throw new PayrollValidationError("Quantidade de horas inválida.");
  }
  const lines: string[] = [];
  const reference = (minutes: number) =>
    profile.hourFormat === "DECIMAL" ? decimalHours(minutes) : hours(minutes);
  if (format === "QUESTOR") {
    const mapped = payrollEvents.filter((e) => profile.events[e.key]);
    lines.push(
      ["Funcionario", ...mapped.map((e) => profile.events[e.key])].join(";"),
    );
    for (const id of [...new Set(rows.map((r) => r.employeeId))]) {
      const employeeRows = rows.filter((r) => r.employeeId === id);
      lines.push(
        [
          employeeRows[0].employeeCode,
          ...mapped.map((e) => {
            const row = employeeRows.find((r) => r.event === e.key);
            return row ? reference(row.minutes) : "";
          }),
        ]
          .map(csvCell)
          .join(";"),
      );
    }
  } else {
    if (format === "CSV")
      lines.push(
        "Empresa;Competencia;Funcionario;Nome;Rubrica;Evento;Horas;Minutos",
      );
    for (const row of rows) {
      if (format === "DOMINIO") {
        lines.push(
          "10" +
            numeric(row.employeeCode, 10, "Funcionário") +
            competence.replace("-", "") +
            numeric(row.eventCode, 4, "Rubrica") +
            numeric(profile.processCode, 2, "Processo", true) +
            numeric(
              String(Math.round((row.minutes * 100) / 60)),
              9,
              "Quantidade de horas",
              true,
            ) +
            numeric(profile.companyCode, 10, "Empresa"),
        );
      } else if (format === "SAGE") {
        const extended = Number(row.eventCode) > 999;
        const quantity =
          String(Math.floor(row.minutes / 60)).padStart(3, "0") +
          String(row.minutes % 60).padStart(2, "0");
        if (quantity.length !== 5)
          throw new PayrollValidationError(
            "Sage/IOB permite até 999:59 horas por evento.",
          );
        lines.push(
          [
            numeric(row.employeeCode, 5, "Funcionário"),
            extended ? "000" : numeric(row.eventCode, 3, "Evento"),
            quantity,
            "00000000000",
            " ".repeat(20),
            extended ? numeric(row.eventCode, 5, "Evento 2") : "00000",
            "",
          ].join("|"),
        );
      } else
        lines.push(
          [
            profile.companyCode,
            competence,
            row.employeeCode,
            row.employeeName,
            row.eventCode,
            row.label,
            reference(row.minutes),
            String(row.minutes),
          ]
            .map(csvCell)
            .join(";"),
        );
    }
  }
  return lines.join("\r\n") + "\r\n";
}
