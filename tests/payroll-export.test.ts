import { describe, expect, it } from "vitest";
import {
  aggregatePayroll,
  exportSchema,
  profileSchema,
  renderPayroll,
  validDate,
  validateProfile,
  type ExportEmployee,
  type PayrollRow,
} from "../apps/api/src/services/payroll-export.service";

const profile = profileSchema.parse({
  companyCode: "11",
  processCode: "11",
  events: { normal: "1", overtime: "37", late: "40", absence: "8111" },
});
const employee: ExportEmployee = {
  id: 1,
  name: "Ana",
  registration_number: "88",
  admission_date: null,
  work_schedule_id: 1,
  active: 1,
};
const row: PayrollRow = {
  employeeId: 1,
  employeeName: "Ana",
  employeeCode: "88",
  event: "overtime",
  label: "Horas extras",
  eventCode: "37",
  minutes: 150,
};
describe("payroll file layouts", () => {
  it("writes Domínio's 43-position detail with decimal hours, CRLF and no BOM", () => {
    const file = renderPayroll("DOMINIO", [row], profile, "2026-08");
    expect(file).toBe("1000000000882026080037110000002500000000011\r\n");
    const line = file.trimEnd();
    expect(line).toHaveLength(43);
    expect(line.slice(24, 33)).toBe("000000250");
    expect(line.slice(33, 43)).toBe("0000000011");
    expect(file.charCodeAt(0)).not.toBe(0xfeff);
  });
  it("rounds decimal conversion after summation, and never writes negative deductions", () => {
    const file = renderPayroll(
      "DOMINIO",
      [{ ...row, event: "late", minutes: 1 }],
      profile,
      "2026-08",
    );
    expect(file.slice(24, 33)).toBe("000000002");
    expect(() =>
      renderPayroll("DOMINIO", [{ ...row, minutes: -30 }], profile, "2026-08"),
    ).toThrow();
  });
  it("writes Sage's 55-position detail with sexagesimal hours", () => {
    const file = renderPayroll("SAGE", [row], profile, "2026-08");
    expect(file).toBe(
      `00088|037|00230|00000000000|${" ".repeat(20)}|00000|\r\n`,
    );
    expect(file.slice(0, -2)).toHaveLength(55);
  });
  it("uses Sage's extended event field and zeroes the short event", () => {
    const file = renderPayroll(
      "SAGE",
      [{ ...row, eventCode: "99164" }],
      profile,
      "2026-08",
    );
    expect(file.slice(6, 9)).toBe("000");
    expect(file.slice(49, 54)).toBe("99164");
  });
  it("rejects widths exceeding the ERP layout, without truncating data", () => {
    expect(() =>
      renderPayroll(
        "SAGE",
        [{ ...row, employeeCode: "123456" }],
        profile,
        "2026-08",
      ),
    ).toThrow();
    expect(() =>
      renderPayroll("SAGE", [{ ...row, minutes: 60000 }], profile, "2026-08"),
    ).toThrow("999:59");
    expect(() =>
      renderPayroll(
        "DOMINIO",
        [{ ...row, eventCode: "12345" }],
        profile,
        "2026-08",
      ),
    ).toThrow();
  });
  it("creates Questor variable event columns with one row per selected employee", () => {
    const p = {
      ...profile,
      events: { normal: "", overtime: "37", late: "40", absence: "" },
    };
    expect(
      renderPayroll(
        "QUESTOR",
        [row, { ...row, event: "late", eventCode: "40", minutes: 15 }],
        p,
        "2026-08",
      ),
    ).toBe("Funcionario;37;40\r\n88;02:30;00:15\r\n");
    expect(
      renderPayroll(
        "QUESTOR",
        [row],
        { ...p, hourFormat: "DECIMAL" },
        "2026-08",
      ),
    ).toBe("Funcionario;37;40\r\n88;2,50;\r\n");
  });
  it("escapes delimited text and spreadsheet formulas in generic CSV", () => {
    const file = renderPayroll(
      "CSV",
      [{ ...row, employeeName: '=HYPERLINK("x");João' }],
      profile,
      "2026-08",
    );
    expect(file).toContain('"\'=HYPERLINK(""x"");João"');
    expect(file).toContain(";02:30;150\r\n");
  });
});
describe("export validation and aggregation", () => {
  it("rejects missing, invalid, duplicate or zero codes", () => {
    expect(() =>
      validateProfile("SAGE", profile, [
        { ...employee, registration_number: "" },
      ]),
    ).toThrow();
    expect(() =>
      validateProfile("SAGE", profile, [
        { ...employee, registration_number: "=1+1" },
      ]),
    ).toThrow();
    expect(() =>
      validateProfile("SAGE", profile, [
        employee,
        { ...employee, id: 2, registration_number: "00088" },
      ]),
    ).toThrow("mesma matrícula");
    expect(() =>
      validateProfile("DOMINIO", { ...profile, companyCode: "0" }),
    ).toThrow();
    expect(() =>
      validateProfile("DOMINIO", {
        ...profile,
        events: { ...profile.events, late: "037" },
      }),
    ).toThrow("diferente");
  });
  it("honors ERP overrides without falling back to the internal ID or an explicitly cleared override", () => {
    expect(() =>
      validateProfile("SAGE", { ...profile, employeeCodes: { "1": "42" } }, [
        { ...employee, registration_number: null },
      ]),
    ).not.toThrow();
    expect(() =>
      validateProfile("SAGE", { ...profile, employeeCodes: { "1": "" } }, [
        employee,
      ]),
    ).toThrow();
  });
  it("sums only selected employees after admission and reports unmapped time", () => {
    const day = {
      employee_id: 1,
      work_date: "2026-08-04",
      normal_minutes: 480,
      overtime_minutes: 30,
      late_minutes: 0,
      absence_minutes: 0,
    };
    const result = aggregatePayroll(
      [{ ...employee, admission_date: "2026-08-03" }],
      [
        day,
        { ...day, work_date: "2026-08-05" },
        { ...day, work_date: "2026-08-01", absence_minutes: 480 },
        { ...day, employee_id: 2 },
      ],
      { ...profile, events: { ...profile.events, normal: "" } },
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].minutes).toBe(60);
    expect(result.warnings[0]).toContain("16:00");
  });
  it.each(["2026-02-30", "2025-02-29", "2026-13-01", "nonsense"])(
    "rejects invalid calendar date %s",
    (value) => expect(validDate(value)).toBe(false),
  );
  it("accepts leap days and rejects invalid ranges, duplicates and unsupported formats", () => {
    expect(validDate("2024-02-29")).toBe(true);
    const body = {
      companyId: 1,
      format: "DOMINIO",
      start: "2026-08-01",
      end: "2026-08-31",
      competence: "2026-08",
      employeeIds: [1, 2],
      profile,
    };
    expect(exportSchema.safeParse(body).success).toBe(true);
    for (const change of [
      { end: "2026-07-01" },
      { end: "2026-12-01" },
      { employeeIds: [1, 1] },
      { employeeIds: [] },
      { format: "SENIOR" },
      { competence: "2026-13" },
    ])
      expect(exportSchema.safeParse({ ...body, ...change }).success).toBe(
        false,
      );
  });
});
