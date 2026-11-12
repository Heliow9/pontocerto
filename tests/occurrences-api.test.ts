import "express-async-errors";
import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const m = vi.hoisted(() => ({
  role: "TENANT_ADMIN",
  permission: "write",
  query: vi.fn(),
  process: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("../apps/api/src/db/pool.js", () => ({ pool: { query: m.query } }));
vi.mock("../apps/api/src/middlewares/auth.js", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.auth = {
      tenantId: 7,
      companyId: 2,
      userId: 3,
      role: m.role,
      name: "Supervisor",
      email: "supervisor@example.com",
    };
    next();
  },
}));
vi.mock("../apps/api/src/services/calculation.service.js", () => ({
  processPeriod: m.process,
}));
vi.mock("../apps/api/src/utils/audit.js", () => ({ writeAudit: m.audit }));

import { absencesRouter } from "../apps/api/src/routes/absences.routes";

const app = express();
app.use(express.json());
app.use("/absences", absencesRouter);
app.use((err: any, _req: any, res: any, _next: any) =>
  res.status(err.status || 500).json({ message: err.message }),
);

const fullDay = {
  employeeId: 11,
  startDate: "2026-11-10",
  endDate: "2026-11-12",
  type: "ATESTADO",
  reason: "Atestado médico apresentado ao RH",
  status: "APPROVED",
};

beforeEach(() => {
  vi.clearAllMocks();
  m.role = "TENANT_ADMIN";
  m.permission = "write";
  m.process.mockResolvedValue({ processed: 3 });
  m.query.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes("FROM users u LEFT JOIN user_permissions"))
      return [[{
        active: 1,
        permissions_json: JSON.stringify({ occurrences: m.permission }),
        sensitive_permissions_json: "{}",
      }]];
    if (sql.includes("FROM absences a") && sql.includes("WHERE a.id="))
      return [[{
        id: 21,
        employee_id: 11,
        start_date: "2026-11-10",
        end_date: "2026-11-12",
        type: "ATESTADO",
        reason: "Atestado médico apresentado ao RH",
        company_id: 2,
      }]];
    if (sql.includes("FROM absences a") && sql.includes("JOIN employees"))
      return [[{
        id: 21,
        employee_id: 11,
        start_date: "2026-11-01",
        end_date: "2026-11-01",
        start_time: null,
        end_time: null,
        type: "ATESTADO",
        reason: null,
        status: "APPROVED",
        employee_name: "Ana",
        company_id: 2,
      }]];
    if (sql.includes("FROM employees")) {
      const id = Number(params[0]);
      const employee = id === 11
        ? { id: 11, company_id: 2 }
        : { id: 12, company_id: 3 };
      if (sql.includes("company_id=?") && Number(params[2]) !== employee.company_id)
        return [[]];
      return [[employee]];
    }
    if (sql.includes("INSERT INTO absences")) return [{ insertId: 21 }];
    if (sql.includes("DELETE FROM absences")) return [{ affectedRows: 1 }];
    return [[]];
  });
});

it("requires an audit observation and recalculates the exact full-day period", async () => {
  expect(
    (await request(app).post("/absences").send({ ...fullDay, reason: "" })).status,
  ).toBe(400);
  const response = await request(app).post("/absences").send(fullDay);
  expect(response.status).toBe(201);
  expect(response.body.recalculation).toEqual({ processed: 3 });
  expect(m.process).toHaveBeenCalledWith({
    tenantId: 7,
    employeeId: 11,
    start: "2026-11-10",
    end: "2026-11-12",
  });
  expect(m.audit).toHaveBeenCalledWith(
    expect.anything(),
    "OCCURRENCE_CREATE",
    "absence",
    21,
    undefined,
    expect.objectContaining({ reason: fullDay.reason }),
  );
});

it("accepts a same-day hourly declaration and persists its interval", async () => {
  const response = await request(app).post("/absences").send({
    ...fullDay,
    startDate: "2026-11-10",
    endDate: "2026-11-10",
    type: "DECLARACAO",
    startTime: "10:00",
    endTime: "12:00",
    reason: "Declaração de comparecimento",
  });
  expect(response.status).toBe(201);
  const insert = m.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO absences"));
  expect(insert?.[1]).toEqual([
    7, 11, "2026-11-10", "2026-11-10", "10:00", "12:00",
    "DECLARACAO", "Declaração de comparecimento", "APPROVED", 3,
  ]);
});

it("rejects declarations across dates or with an invalid time interval", async () => {
  const declaration = {
    ...fullDay,
    type: "DECLARACAO",
    startTime: "12:00",
    endTime: "10:00",
  };
  expect((await request(app).post("/absences").send(declaration)).status).toBe(400);
  expect((await request(app).post("/absences").send({
    ...declaration,
    startTime: "10:00",
    endTime: "12:00",
    endDate: "2026-11-11",
  })).status).toBe(400);
});

it("honors supervisor write access and blocks read-only writes and other companies", async () => {
  m.role = "SUPERVISOR";
  expect((await request(app).post("/absences").send(fullDay)).status).toBe(201);
  m.permission = "read";
  expect((await request(app).post("/absences").send(fullDay)).status).toBe(403);
  m.permission = "write";
  expect((await request(app).post("/absences").send({ ...fullDay, employeeId: 12 })).status).toBe(400);
});

it("keeps legacy occurrences readable and scopes a supervisor list to its company", async () => {
  m.role = "SUPERVISOR";
  const response = await request(app).get("/absences");
  expect(response.status).toBe(200);
  expect(response.body[0]).toMatchObject({ id: 21, reason: null });
  const list = m.query.mock.calls.find(([sql]) =>
    sql.includes("FROM absences a") && sql.includes("JOIN employees") && !sql.includes("WHERE a.id="),
  );
  expect(list?.[0]).toContain("e.company_id=?");
  expect(list?.[1]).toEqual([7, 2]);
});

it("audits deletion and recalculates the occurrence original period", async () => {
  const response = await request(app).delete("/absences/21");
  expect(response.status).toBe(200);
  expect(m.process).toHaveBeenCalledWith({
    tenantId: 7,
    employeeId: 11,
    start: "2026-11-10",
    end: "2026-11-12",
  });
  expect(m.audit).toHaveBeenCalledWith(
    expect.anything(),
    "OCCURRENCE_DELETE",
    "absence",
    21,
    expect.objectContaining({ employee_id: 11 }),
    undefined,
  );
});
