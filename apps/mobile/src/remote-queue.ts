import AsyncStorage from "@react-native-async-storage/async-storage";
export type RemotePunch = {
  requestKey: string;
  type: "CLOCK_IN" | "BREAK_OUT" | "BREAK_IN" | "CLOCK_OUT";
  capturedAt: string;
  offline: boolean;
  source: "WEB" | "MOBILE";
  selfie: string;
  deviceUid: string | null;
  error?: string;
  rejected?: boolean;
};
export const queueKey = (employee: number) => `pc_remote_queue_${employee}`;
export async function readQueue(employee: number): Promise<RemotePunch[]> {
  const raw = await AsyncStorage.getItem(queueKey(employee));
  return raw ? JSON.parse(raw) : [];
}
const locks = new Map<number, Promise<unknown>>();
export async function updateQueue(
  employee: number,
  change: (items: RemotePunch[]) => RemotePunch[],
) {
  const mutate = async () => {
    const items = change(await readQueue(employee));
    await AsyncStorage.setItem(queueKey(employee), JSON.stringify(items));
    return items;
  };
  const operation = (locks.get(employee) || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      if (typeof window !== "undefined" && typeof document !== "undefined") {
        if (!navigator.locks)
          throw new Error(
            "Atualize o navegador para salvar marcações neste aparelho com segurança.",
          );
        return navigator.locks.request(queueKey(employee), mutate);
      }
      return mutate();
    });
  locks.set(employee, operation);
  try {
    return await operation;
  } finally {
    if (locks.get(employee) === operation) locks.delete(employee);
  }
}
const punchLabels: Record<RemotePunch["type"], string> = {
  CLOCK_IN: "Entrada",
  BREAK_OUT: "Saída para intervalo",
  BREAK_IN: "Retorno do intervalo",
  CLOCK_OUT: "Saída",
};
function localDayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
export function addToQueue(items: RemotePunch[], punch: RemotePunch) {
  if (items.some((i) => i.requestKey === punch.requestKey)) return items;
  const day = localDayKey(punch.capturedAt);
  if (
    items.some(
      (i) => i.type === punch.type && localDayKey(i.capturedAt) === day,
    )
  )
    throw new Error(
      `${punchLabels[punch.type]} já foi registrada offline neste dia. Sincronize as marcações pendentes antes de tentar novamente.`,
    );
  const next = [...items, punch];
  if (next.length > 10 || JSON.stringify(next).length > 3500000)
    throw new Error(
      "A fila está cheia. Envie os registros pendentes antes de capturar outra foto.",
    );
  return next;
}
