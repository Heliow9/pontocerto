export type OccurrenceFormMode = "full-day" | "hourly";

export type OccurrenceFormValue = {
  employeeId?: number;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  type?: string;
  reason?: string;
};

export function occurrenceFormMode(type: string): OccurrenceFormMode {
  return type === "DECLARACAO" ? "hourly" : "full-day";
}

export function occurrenceFormError(form: OccurrenceFormValue): string | null {
  if (!Number(form.employeeId || 0)) return "Selecione um funcionário.";
  if (!form.startDate) return "Informe a data inicial.";
  if ((form.reason || "").trim().length < 3)
    return "Informe uma observação para auditoria com pelo menos 3 caracteres.";
  if (occurrenceFormMode(form.type || "") === "hourly") {
    if (form.endDate !== form.startDate)
      return "A declaração deve usar uma única data.";
    if (!form.startTime || !form.endTime || form.endTime <= form.startTime)
      return "Informe um intervalo de horas válido para a declaração.";
    return null;
  }
  if (!form.endDate || form.endDate < form.startDate)
    return "A data final deve ser igual ou posterior à inicial.";
  return null;
}
