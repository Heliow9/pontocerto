import "express-async-errors";
import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), audit: vi.fn(), process: vi.fn() }));
vi.mock("../apps/api/src/db/pool.js", () => ({ pool: { query: mocks.query } }));
vi.mock("../apps/api/src/middlewares/auth.js", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.auth = { tenantId: 7, companyId: 2, userId: 3, role: "TENANT_ADMIN", name: "Master" };
    next();
  },
}));
vi.mock("../apps/api/src/utils/audit.js", () => ({ writeAudit: mocks.audit }));
vi.mock("../apps/api/src/services/calculation.service.js", () => ({ processPeriod: mocks.process }));
import { reportsRouter } from "../apps/api/src/routes/reports.routes";

const app = express();
app.use(express.json());
app.use("/reports", reportsRouter);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status || 500).json({ message: err.message }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.process.mockResolvedValue({ processed: 1 });
  mocks.query.mockImplementation(async (sql: string, params: any[]) => {
    if (sql.includes("FROM employees") && sql.includes("LIMIT 1"))
      return [Number(params[0]) === 999 ? [] : [{ id: Number(params[0]), company_id: 2 }]];
    if (sql.includes("FROM employee_overtime_overrides")) return [[]];
    return [{ affectedRows: 1, insertId: 1 }];
  });
});

it("requires a meaningful reason before ignoring daily overtime", async () => {
  const response = await request(app)
    .put("/reports/overtime-override/27/2026-11-09")
    .send({ reason: "" });
  expect(response.status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
});

it("creates a tenant-scoped override, recalculates the day and audits the reason", async () => {
  const response = await request(app)
    .put("/reports/overtime-override/27/2026-11-09")
    .send({ reason: "Intervalo não registrado; saldo autorizado pelo gestor." });
  expect(response.status).toBe(200);
  expect(mocks.query.mock.calls.some(([sql, params]) =>
    String(sql).includes("INSERT INTO employee_overtime_overrides") &&
    params[0] === 7 && params[1] === 2 && params[2] === 27 && params[3] === "2026-11-09"
  )).toBe(true);
  expect(mocks.process).toHaveBeenCalledWith({ tenantId: 7, employeeId: 27, start: "2026-11-09", end: "2026-11-09" });
  expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), "OVERTIME_IGNORE", "employee_overtime", 27, undefined, expect.objectContaining({ workDate: "2026-11-09" }));
});

it("does not create an override for an employee outside the scoped company", async () => {
  const response = await request(app)
    .put("/reports/overtime-override/999/2026-11-09")
    .send({ reason: "Correção excepcional autorizada." });
  expect(response.status).toBe(404);
  expect(mocks.process).not.toHaveBeenCalled();
});

it("soft-removes the override and recalculates the original overtime", async () => {
  mocks.query.mockImplementation(async (sql: string, params: any[]) => {
    if (sql.includes("FROM employees") && sql.includes("LIMIT 1")) return [[{ id: 27, company_id: 2 }]];
    if (sql.includes("FROM employee_overtime_overrides")) return [[{ id: 8, reason: "Ajuste anterior", active: 1 }]];
    return [{ affectedRows: 1 }];
  });
  const response = await request(app).delete("/reports/overtime-override/27/2026-11-09");
  expect(response.status).toBe(200);
  expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("SET active=0"))).toBe(true);
  expect(mocks.process).toHaveBeenCalledWith({ tenantId: 7, employeeId: 27, start: "2026-11-09", end: "2026-11-09" });
  expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), "OVERTIME_RESTORE", "employee_overtime", 27, expect.objectContaining({ id: 8 }), expect.objectContaining({ active: false }));
});
