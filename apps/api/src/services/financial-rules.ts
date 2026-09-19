export type ChargeType = "MONTHLY" | "IMPLEMENTATION" | "AD_HOC";
export type ChargeStatus = "DRAFT" | "ISSUING" | "OPEN" | "OVERDUE" | "PAID" | "CANCELED" | "FAILED";

export type BillingProfile = {
  tenantId: number;
  dueDay: 5 | 10 | 15;
  graceDays: number;
  autoBlockEnabled: boolean;
  autoMonthlyEnabled: boolean;
};

export function validateDueDay(value: number): 5 | 10 | 15 {
  if (value === 5 || value === 10 || value === 15) return value;
  throw new Error("O vencimento mensal deve ser dia 5, 10 ou 15.");
}

function dateOnly(value: string | Date): { year: number; month: number; day: number } {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("Data inválida.");
    return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) throw new Error("Data deve estar no formato AAAA-MM-DD.");
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function formatDateOnly(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function calculateBlockAt(dueDate: string, graceDays: number): string {
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 365)
    throw new Error("Dias de tolerância inválidos.");
  const { year, month, day } = dateOnly(dueDate);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + graceDays);
  return formatDateOnly(date);
}

export function monthCompetence(value: string | Date): string {
  const { year, month } = dateOnly(value);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function dueDateForCompetence(competence: string, dueDay: number): string {
  const day = validateDueDay(dueDay);
  if (!/^\d{4}-\d{2}$/.test(competence)) throw new Error("Competência deve estar no formato AAAA-MM.");
  return `${competence}-${String(day).padStart(2, "0")}`;
}

export function isBlockingStatus(status: ChargeStatus | string): boolean {
  return status === "OPEN" || status === "OVERDUE";
}

export function normalizedMoney(value: number | string): number {
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) throw new Error("Valor financeiro inválido.");
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function todayInBrasilia(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function brasiliaCompetence(now = new Date()): string {
  return monthCompetence(todayInBrasilia(now));
}
