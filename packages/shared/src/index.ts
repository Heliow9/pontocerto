export type UserRole =
  | "SUPER_ADMIN"
  | "TENANT_ADMIN"
  | "RH"
  | "GESTOR"
  | "SUPERVISOR"
  | "FUNCIONARIO";

export type TimeEntryType =
  | "CLOCK_IN"
  | "BREAK_OUT"
  | "BREAK_IN"
  | "CLOCK_OUT"
  | "OTHER";

export type DayStatus =
  | "NORMAL"
  | "FOLGA"
  | "FERIADO"
  | "FALTA"
  | "ATESTADO"
  | "FERIAS"
  | "AFASTAMENTO"
  | "LICENCA"
  | "ABONO";

export interface AuthUser {
  id: number;
  tenantId: number;
  companyId: number | null;
  employeeId: number | null;
  role: UserRole;
  name: string;
  email: string;
}
