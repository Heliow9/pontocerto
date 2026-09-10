import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  process: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("../apps/api/src/db/pool.js", () => ({ pool: { query: mocks.query } }));
vi.mock("../apps/api/src/config/env.js", () => ({
  env: { JWT_SECRET: "payroll-test-only" },
}));
vi.mock("../apps/api/src/services/calculation.service.js", () => ({
  processPeriod: mocks.process,
}));
vi.mock("../apps/api/src/utils/audit.js", () => ({ writeAudit: mocks.audit }));
import { reportsRouter } from "../apps/api/src/routes/reports.routes";
const app = express();
app.use(express.json());
app.use("/reports", reportsRouter);
app.use((_err: any, _req: any, res: any, _next: any) =>
  res.status(500).json({ message: "Erro interno" }),
);
const body = {
  companyId: 2,
  format: "DOMINIO",
  start: "2025-08-01",
  end: "2025-08-31",
  competence: "2025-08",
  employeeIds: [11, 12],
  profile: {
    companyCode: "91",
    processCode: "11",
    events: { normal: "1", overtime: "2", late: "3", absence: "4" },
    employeeCodes: {},
  },
};
const employees = [11, 12].map((id) => ({
  id,
  name: `Funcionário ${id}`,
  active: 1,
  company_id: 2,
  registration_number: String(id),
  admission_date: null,
  work_schedule_id: 1,
}));
function token(role = "TENANT_ADMIN", companyId: number | null = 2) {
  return jwt.sign(
    { tenantId: 7, companyId, userId: 3, role },
    "payroll-test-only",
  );
}
function send(
  data: any = body,
  role = "TENANT_ADMIN",
  companyId: number | null = 2,
) {
  return request(app)
    .post("/reports/payroll/generate")
    .auth(token(role, companyId), { type: "bearer" })
    .send(data);
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM companies"))
      return [[{ id: 2, legal_name: "Empresa teste" }]];
    if (sql.includes("FROM employees")) return [employees];
    if (sql.includes("FROM daily_time_calculations"))
      return [
        employees.map((e) => ({
          employee_id: e.id,
          work_date: "2025-08-04",
          normal_minutes: 480,
          overtime_minutes: 30,
          late_minutes: 0,
          absence_minutes: 0,
        })),
      ];
    return [[]];
  });
});
describe("payroll export API", () => {
  it("requires authentication", async () => {
    expect(
      (await request(app).post("/reports/payroll/generate").send(body)).status,
    ).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each(["FUNCIONARIO", "SUPERVISOR", "GESTOR"])(
    "denies payroll access to %s",
    async (role) => {
      expect((await send(body, role)).status).toBe(403);
      expect(
        (
          await request(app)
            .get("/reports/payroll/options")
            .auth(token(role), { type: "bearer" })
        ).status,
      ).toBe(403);
      expect(mocks.query).not.toHaveBeenCalled();
    },
  );
  it("rejects a company outside the authenticated company scope before querying", async () => {
    expect((await send(body, "TENANT_ADMIN", 9)).status).toBe(404);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("fails the entire export when one selected employee is not accessible", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ id: 2 }]])
      .mockResolvedValueOnce([[employees[0]]]);
    expect((await send()).status).toBe(400);
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it("binds tenant and company in selection and calculation queries, and audits file generation", async () => {
    const response = await send();
    expect(response.status).toBe(200);
    expect(response.body.exportedCount).toBe(2);
    expect(response.body.rows).toHaveLength(4);
    expect(response.body.content.split("\r\n").filter(Boolean)).toHaveLength(4);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(mocks.process).toHaveBeenCalledWith({
      tenantId: 7,
      employeeIds: [11, 12],
      start: body.start,
      end: body.end,
    });
    expect(
      mocks.query.mock.calls.find(([sql]) =>
        sql.includes("FROM employees"),
      )?.[1],
    ).toEqual([7, 2, 11, 12]);
    expect(
      mocks.query.mock.calls.find(([sql]) =>
        sql.includes("FROM daily_time_calculations"),
      )?.[1],
    ).toEqual([7, 2, 11, 12, body.start, body.end]);
    expect(mocks.audit.mock.calls[0][1]).toBe("PAYROLL_EXPORT_GENERATED");
    expect(response.body.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it.each(["pending", "incomplete"])(
    "blocks export with %s attendance",
    async (kind) => {
      mocks.query
        .mockResolvedValueOnce([[{ id: 2 }]])
        .mockResolvedValueOnce([employees])
        .mockResolvedValueOnce(kind === "pending" ? [[{ id: 1 }]] : [[]]);
      if (kind === "incomplete")
        mocks.query.mockResolvedValueOnce([
          [{ employee_id: 11, work_date: "2025-08-04" }],
        ]);
      expect((await send()).status).toBe(422);
      expect(mocks.process).not.toHaveBeenCalled();
    },
  );
  it("rejects duplicate selections and future periods", async () => {
    expect((await send({ ...body, employeeIds: [11, 11] })).status).toBe(400);
    expect(
      (await send({ ...body, start: "2099-01-01", end: "2099-01-02" })).status,
    ).toBe(400);
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it("fails clearly for missing mappings and empty results", async () => {
    expect(
      (await send({ ...body, profile: { ...body.profile, events: {} } }))
        .status,
    ).toBe(422);
    mocks.query
      .mockResolvedValueOnce([[{ id: 2 }]])
      .mockResolvedValueOnce([employees])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);
    expect((await send()).status).toBe(422);
  });
  it("returns database failures through Express error middleware", async () => {
    mocks.query.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await send()).status).toBe(500);
  });
  it("scopes saved profiles by tenant, company and format", async () => {
    const response = await request(app)
      .put("/reports/payroll/profiles/2/DOMINIO")
      .auth(token(), { type: "bearer" })
      .send(body.profile);
    expect(response.status).toBe(200);
    const saved = mocks.query.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO payroll_export_profiles"),
    );
    expect(saved?.[1].slice(0, 3)).toEqual([7, 2, "DOMINIO"]);
  });
  it("rejects profile codes referencing employees from another company", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ id: 2 }]])
      .mockResolvedValueOnce([[]]);
    const response = await request(app)
      .put("/reports/payroll/profiles/2/SAGE")
      .auth(token(), { type: "bearer" })
      .send({ ...body.profile, employeeCodes: { 999: "1" } });
    expect(response.status).toBe(400);
  });
});
