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
it("mantém a fila por funcionário, preserva o horário e não duplica a mesma tentativa", async () => {
  await updateQueue(11, (current) =>
    addToQueue(addToQueue(current, item), item),
  );
  expect(await readQueue(11)).toEqual([item]);
  expect(await readQueue(12)).toEqual([]);
});
it("rejeita uma segunda marcação do mesmo tipo no mesmo dia local", () => {
  const first = addToQueue([], item);
  expect(() =>
    addToQueue(first, {
      ...item,
      requestKey: "remote-request-654321",
      capturedAt: "2026-09-12T11:15:00.000Z",
    }),
  ).toThrow(/Entrada.*já foi registrada/i);
});
it("permite tipos diferentes no mesmo dia", () => {
  const first = addToQueue([], item);
  const next = addToQueue(first, {
    ...item,
    requestKey: "remote-request-break01",
    type: "BREAK_OUT",
    capturedAt: "2026-09-12T15:00:00.000Z",
  });
  expect(next).toHaveLength(2);
});
it("permite o mesmo tipo em outro dia", () => {
  const first = addToQueue([], item);
  const next = addToQueue(first, {
    ...item,
    requestKey: "remote-request-nextday",
    capturedAt: "2026-09-13T10:00:00.000Z",
  });
  expect(next).toHaveLength(2);
});
it("não descarta registros existentes quando o limite de armazenamento é atingido", () => {
  let list: RemotePunch[] = [];
  const types: RemotePunch["type"][] = [
    "CLOCK_IN",
    "BREAK_OUT",
    "BREAK_IN",
    "CLOCK_OUT",
  ];
  for (let n = 0; n < 10; n++)
    list = addToQueue(list, {
      ...item,
      type: types[n % types.length],
      capturedAt: new Date(
        Date.parse(item.capturedAt) + Math.floor(n / 4) * 86400000,
      ).toISOString(),
      requestKey: `key${n}----------------`,
    });
  expect(() =>
    addToQueue(list, {
      ...item,
      type: "BREAK_IN",
      capturedAt: "2026-09-15T10:00:00.000Z",
      requestKey: "new-----------------",
    }),
  ).toThrow();
  expect(list).toHaveLength(10);
});
