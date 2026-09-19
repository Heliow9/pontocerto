import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ query: vi.fn(), process: vi.fn() }));
vi.mock("../apps/api/src/db/pool.js", () => ({ pool: { query: m.query } }));
vi.mock("../apps/api/src/services/calculation.service.js", () => ({
  processPeriod: m.process,
}));
import { collectOvertimeAlerts } from "../apps/api/src/services/overtime.service";

const company = {
  tenant_id: 7,
  company_id: 2,
  legal_name: "Empresa",
  recipients: JSON.stringify([{ name: "RH", phone: "5511999999999" }]),
};
const employee = {
  id: 9,
  name: "Ana",
  group_name: "Equipe",
  work_schedule_id: 3,
  overtime_minutes: 1260,
  reference_minutes: 1200,
};
let holidays: any[];
let punches: any[];
let days: any[];
beforeEach(() => {
  vi.resetAllMocks();
  holidays = [];
  days = [
    {
      weekday: 1,
      is_day_off: 0,
      entry_1: "08:00:00",
      exit_1: "17:00:00",
      entry_2: null,
      exit_2: null,
    },
  ];
  punches = [
    {
      id: 1,
      entry_type: "CLOCK_IN",
      registered_at: "2026-09-14 08:00:00",
      scheduled_work_date: "2026-09-14",
    },
  ];
  m.query.mockImplementation(async (sql: string) => {
    if (sql.includes("SELECT a.*,c.legal_name")) return [[company]];
    if (sql.includes("SELECT id FROM employees")) return [[{ id: 9 }]];
    if (sql.includes("SUM(d.overtime_minutes)")) return [[employee]];
    if (sql.includes("FROM work_schedule_days")) return [days];
    if (sql.includes("FROM holidays")) return [holidays];
    if (sql.includes("FROM time_entries")) return [punches];
    return [{ affectedRows: 1 }];
  });
});

it("usa a competência original na jornada noturna que atravessa o fim do mês", async () => {
  days = [
    {
      weekday: 3,
      is_day_off: 0,
      entry_1: "22:00:00",
      exit_1: "06:00:00",
      entry_2: null,
      exit_2: null,
    },
  ];
  punches = [
    {
      id: 1,
      entry_type: "CLOCK_IN",
      registered_at: "2026-09-30 22:00:00",
      scheduled_work_date: "2026-09-30",
    },
  ];
  const base = m.query.getMockImplementation()!;
  m.query.mockImplementation(async (sql: string, args: any[]) => {
    if (sql.includes("SUM(d.overtime_minutes)"))
      return [
        [
          {
            ...employee,
            overtime_minutes: args[0] === "2026-09-01" ? 1260 : 0,
          },
        ],
      ];
    return base(sql, args);
  });
  await collectOvertimeAlerts(Date.parse("2026-10-01T06:01:00-03:00"));
  const live = m.query.mock.calls.find(
    ([sql, args]) => sql.includes("INSERT") && args?.includes("D:20260930"),
  );
  expect(live).toBeDefined();
  expect(live![1].slice(0, 6)).toEqual([
    7,
    2,
    9,
    "2026-09",
    "D:20260930",
    "5511999999999",
  ]);
});

it("enfileira aviso da jornada com destinatário, empresa e horário detectado", async () => {
  await collectOvertimeAlerts(Date.parse("2026-09-14T17:01:00-03:00"));
  const live = m.query.mock.calls.find(
    ([sql, args]) => sql.includes("INSERT") && args?.includes("D:20260914"),
  );
  expect(live).toBeDefined();
  expect(live![1].slice(0, 6)).toEqual([
    7,
    2,
    9,
    "2026-09",
    "D:20260914",
    "5511999999999",
  ]);
  expect(live![1][6]).toContain("17:00");
  expect(live![1][6]).toContain("21h00");
  // The database unique key must preserve already delivered daily alerts.
  expect(live![0]).toContain("ON DUPLICATE KEY UPDATE id=id");
});
it("preserva avisos de jornada ao cancelar marcos mensais pendentes", async () => {
  await collectOvertimeAlerts(Date.parse("2026-09-14T17:01:00-03:00"));
  const cancel = m.query.mock.calls.find(([sql]) =>
    sql.includes("threshold_key NOT IN"),
  );
  expect(cancel![0]).toContain("threshold_key IN ('50','100','OVER')");
});
it("não cria aviso de início em feriado ou depois de registrar a saída", async () => {
  holidays = [{ holiday_date: "2026-09-14" }];
  await collectOvertimeAlerts(Date.parse("2026-09-14T17:01:00-03:00"));
  expect(
    m.query.mock.calls.some(([, args]) => args?.includes("D:20260914")),
  ).toBe(false);
  holidays = [];
  punches.push({
    id: 2,
    entry_type: "CLOCK_OUT",
    registered_at: "2026-09-14 17:00:00",
    scheduled_work_date: "2026-09-14",
  });
  await collectOvertimeAlerts(Date.parse("2026-09-14T17:01:00-03:00"));
  expect(
    m.query.mock.calls.some(([, args]) => args?.includes("D:20260914")),
  ).toBe(false);
});
