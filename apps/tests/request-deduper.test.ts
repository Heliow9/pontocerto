import { expect, it } from "vitest";
import { createRequestDeduper } from "../apps/web/src/request-deduper";

it("compartilha apenas consultas simultâneas e libera nova consulta ao terminar", async () => {
  const share = createRequestDeduper<number>();
  let finish!: (value: number) => void;
  const pending = new Promise<number>((resolve) => {
    finish = resolve;
  });
  let calls = 0;
  const work = () => {
    calls++;
    return pending;
  };
  const first = share.run("account-a:/companies", work);
  const second = share.run("account-a:/companies", work);
  expect(calls).toBe(1);
  finish(7);
  expect(await first).toBe(7);
  expect(await second).toBe(7);
  expect(await share.run("account-a:/companies", async () => 8)).toBe(8);
});
it("isola contas e filtros e deixa uma mutação invalidar consultas em andamento", async () => {
  const share = createRequestDeduper<number>();
  const pending = new Promise<number>(() => {});
  share.run("a:active", () => pending);
  expect(await share.run("b:active", async () => 2)).toBe(2);
  expect(await share.run("a:inactive", async () => 3)).toBe(3);
  share.clear();
  expect(await share.run("a:active", async () => 4)).toBe(4);
});
it("uma falha não fica memorizada e permite tentar novamente", async () => {
  const share = createRequestDeduper<number>();
  await expect(
    share.run("a", async () => {
      throw new Error("offline");
    }),
  ).rejects.toThrow("offline");
  expect(await share.run("a", async () => 1)).toBe(1);
});
