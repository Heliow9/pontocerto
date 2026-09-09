export function localIsoDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: localIsoDate(start), end: localIsoDate(end) };
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

export function apiMessage(error: any, fallback = "Não foi possível concluir a operação.") {
  return error?.response?.data?.message || fallback;
}

export const entryTypeLabel: Record<string, string> = {
  CLOCK_IN: "Entrada",
  BREAK_OUT: "Saída intervalo",
  BREAK_IN: "Retorno intervalo",
  CLOCK_OUT: "Saída",
  OTHER: "Registro"
};
