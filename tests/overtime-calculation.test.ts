import { expect, it, vi } from "vitest";
vi.mock("../apps/api/src/db/pool.js", () => ({ pool: {} }));
import { adjustWorkedMinutesForScheduledBreak, applyOvertimeOverride, pairWorkedMinutes } from "../apps/api/src/services/calculation.service";
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

it("apura corretamente intervalo de saída e retorno no mesmo horário mesmo se vierem invertidos do banco", () => {
  expect(
    pairWorkedMinutes([
      entry("CLOCK_IN", "2026-09-10 08:00:00"),
      entry("BREAK_IN", "2026-09-10 13:00:00"),
      entry("BREAK_OUT", "2026-09-10 13:00:00"),
      entry("CLOCK_OUT", "2026-09-10 19:00:00"),
    ]),
  ).toBe(660);
});

const splitDay = { exit_1: "12:00:00", entry_2: "13:00:00" };
it("desconta o intervalo previsto quando o funcionário habilitado possui apenas entrada e saída", () => {
  expect(adjustWorkedMinutesForScheduledBreak([
    entry("CLOCK_IN", "2026-11-09 06:47:00"),
    entry("CLOCK_OUT", "2026-11-09 17:23:00"),
  ], splitDay, true)).toEqual({ workedMinutes: 576, deductedMinutes: 60 });
});
it("mantém o cálculo atual quando a regra do funcionário está desativada", () => {
  expect(adjustWorkedMinutesForScheduledBreak([
    entry("CLOCK_IN", "2026-11-09 06:47:00"),
    entry("CLOCK_OUT", "2026-11-09 17:23:00"),
  ], splitDay, false)).toEqual({ workedMinutes: 636, deductedMinutes: 0 });
});
it("não desconta novamente o intervalo quando existem quatro marcações", () => {
  expect(adjustWorkedMinutesForScheduledBreak([
    entry("CLOCK_IN", "2026-11-09 08:00:00"),
    entry("BREAK_OUT", "2026-11-09 12:00:00"),
    entry("BREAK_IN", "2026-11-09 13:00:00"),
    entry("CLOCK_OUT", "2026-11-09 18:00:00"),
  ], splitDay, true)).toEqual({ workedMinutes: 540, deductedMinutes: 0 });
});
it("não inventa desconto quando a escala não possui intervalo completo", () => {
  expect(adjustWorkedMinutesForScheduledBreak([
    entry("CLOCK_IN", "2026-11-09 08:00:00"),
    entry("CLOCK_OUT", "2026-11-09 18:00:00"),
  ], { exit_1: null, entry_2: null }, true)).toEqual({ workedMinutes: 600, deductedMinutes: 0 });
});
it("calcula intervalo previsto que atravessa a meia-noite", () => {
  expect(adjustWorkedMinutesForScheduledBreak([
    entry("CLOCK_IN", "2026-11-09 22:00:00"),
    entry("CLOCK_OUT", "2026-11-10 06:00:00"),
  ], { exit_1: "23:30:00", entry_2: "00:30:00" }, true)).toEqual({ workedMinutes: 420, deductedMinutes: 60 });
});
it("zera somente a hora extra e recompõe o banco quando existe exceção diária", () => {
  expect(applyOvertimeOverride({ overtimeMinutes: 95, lateMinutes: 13, absenceMinutes: 0 }, true)).toEqual({
    overtimeMinutes: 0,
    timeBankMinutes: -13,
  });
  expect(applyOvertimeOverride({ overtimeMinutes: 95, lateMinutes: 13, absenceMinutes: 0 }, false)).toEqual({
    overtimeMinutes: 95,
    timeBankMinutes: 82,
  });
});
