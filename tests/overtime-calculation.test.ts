import { expect, it, vi } from "vitest";
vi.mock("../apps/api/src/db/pool.js", () => ({ pool: {} }));
import { pairWorkedMinutes } from "../apps/api/src/services/calculation.service";
const entry = (type: string, time: string) => ({
  id: 1,
  employee_id: 1,
  entry_type: type,
  registered_at: time,
  manually_adjusted: 0,
});
it("apura entrada e saída atravessando a meia-noite", () => {
  expect(
    pairWorkedMinutes([
      entry("CLOCK_IN", "2026-09-11 22:00:00"),
      entry("CLOCK_OUT", "2026-09-12 06:00:00"),
    ]),
  ).toBe(480);
});
it("exclui intervalo e não transforma duas entradas em horas trabalhadas", () => {
  expect(
    pairWorkedMinutes([
      entry("CLOCK_IN", "2026-09-12 07:00:00"),
      entry("CLOCK_IN", "2026-09-12 07:01:00"),
      entry("BREAK_OUT", "2026-09-12 12:00:00"),
      entry("BREAK_IN", "2026-09-12 13:00:00"),
      entry("CLOCK_OUT", "2026-09-12 17:00:00"),
    ]),
  ).toBe(540);
});
it("aguarda o fechamento do par sem inventar horas para marcação incompleta", () => {
  expect(pairWorkedMinutes([entry("CLOCK_IN", "2026-09-12 07:00:00")])).toBe(0);
  expect(pairWorkedMinutes([entry("CLOCK_OUT", "2026-09-12 17:00:00")])).toBe(
    0,
  );
});
