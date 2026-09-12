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
export function addToQueue(items: RemotePunch[], punch: RemotePunch) {
  if (items.some((i) => i.requestKey === punch.requestKey)) return items;
  const next = [...items, punch];
  if (next.length > 10 || JSON.stringify(next).length > 3500000)
    throw new Error(
      "A fila está cheia. Envie os registros pendentes antes de capturar outra foto.",
    );
  return next;
}
