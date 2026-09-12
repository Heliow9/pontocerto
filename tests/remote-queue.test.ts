import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => m.values.get(k) || null,
    setItem: async (k: string, v: string) => {
      m.values.set(k, v);
    },
  },
}));
import {
  addToQueue,
  readQueue,
  updateQueue,
  type RemotePunch,
} from "../apps/mobile/src/remote-queue";
const item: RemotePunch = {
  requestKey: "remote-request-123456",
  type: "CLOCK_IN",
  capturedAt: "2026-09-12T10:00:00.000Z",
  offline: true,
  source: "WEB",
  selfie: "photo",
  deviceUid: null,
};
beforeEach(() => m.values.clear());
it("mantém a fila por funcionário, preserva o horário e não duplica uma tentativa", async () => {
  await updateQueue(11,current=>addToQueue(addToQueue(current, item), item));
  expect(await readQueue(11)).toEqual([item]);
  expect(await readQueue(12)).toEqual([]);
});
it("não descarta registros existentes quando o limite de armazenamento é atingido", () => {
  let list: RemotePunch[] = [];
  for (let n = 0; n < 10; n++)
    list = addToQueue(list, { ...item, requestKey: `key${n}` });
  expect(() => addToQueue(list, { ...item, requestKey: "new" })).toThrow();
  expect(list).toHaveLength(10);
});
