export function localIsoDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function monthRange(date = new Date()) {
  const [year, month] = localIsoDate(date).split("-").map(Number);
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: localIsoDate(new Date(Date.UTC(year, month, 0, 12))),
  };
}

export function brDate(value?: string | null) {
  if (!value) return "-";
  const raw = value.slice(0, 10);
  const [y, m, d] = raw.split("-");
  return `${d}/${m}/${y}`;
}

export function brDateTime(value?: string | null) {
  if (!value) return "-";
  const [date, time = ""] = value.replace("T", " ").split(" ");
  return `${brDate(date)} ${time.slice(0, 5)}`.trim();
}

export function minutesToHHMM(value?: number | null) {
  const n = Number(value || 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

export function apiMessage(
  error: any,
  fallback = "Não foi possível concluir a operação.",
) {
  return (
    error?.response?.data?.message ||
    (error instanceof Error && !error.message.startsWith("Network")
      ? error.message
      : fallback)
  );
}

export const entryTypeLabel: Record<string, string> = {
  CLOCK_IN: "Entrada",
  BREAK_OUT: "Saída intervalo",
  BREAK_IN: "Retorno intervalo",
  CLOCK_OUT: "Saída",
  OTHER: "Registro",
};
