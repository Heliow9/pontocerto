import { beforeEach, describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("../apps/api/src/db/pool.js", () => ({
  pool: { query: mocks.query, getConnection: async () => mocks },
}));
vi.mock("../apps/api/src/config/env.js", () => ({
  env: { JWT_SECRET: "employee-import-test-secret" },
}));
vi.mock("../apps/api/src/utils/audit.js", () => ({ writeAudit: mocks.audit }));
import { employeesRouter } from "../apps/api/src/routes/employees.routes";
const app = express();
app.use(express.json());
app.use("/employees", employeesRouter);
app.use((_err: any, _req: any, res: any, _next: any) =>
  res.status(500).json({ message: "Erro" }),
);
const token = (role = "TENANT_ADMIN", companyId: number | null = 2) =>
  jwt.sign(
    { tenantId: 7, companyId, userId: 3, role },
    "employee-import-test-secret",
  );
const auth = { type: "bearer" as const };
const preview = (
  csv = "nome;matricula;grupo;jornada;local\nAna Silva;0001;Equipe A;Comercial;Sede",
  company = "2",
) =>
  request(app)
    .post("/employees/import/preview")
    .auth(token(), auth)
    .field("companyId", company)
    .attach("file", Buffer.from(csv), "equipe.csv");
const confirm = (body: any) =>
  request(app).post("/employees/import/confirm").auth(token(), auth).send(body);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM companies")) return [[{ id: 2 }]];
    if (sql.includes("COUNT(*)")) return [[{ total: 0 }]];
    if (sql.includes("FROM employees")) return [[]];
    if (sql.includes("FROM employee_groups"))
      return [[{ id: 4, name: "Equipe A" }]];
    if (sql.includes("FROM work_schedules"))
      return [[{ id: 5, name: "Comercial" }]];
    if (sql.includes("FROM work_locations")) return [[{ id: 6, name: "Sede" }]];
    if (sql.includes("FROM subscriptions")) return [[{ max_employees: 100 }]];
    if (sql.includes("FROM employee_imports")) return [[]];
    return [{ insertId: 11, affectedRows: 1 }];
  });
});
describe("employee import API", () => {
  it("rejects non-managers and another company", async () => {
    expect(
      (
        await request(app)
          .get("/employees/import/template")
          .auth(token("SUPERVISOR"), auth)
      ).status,
    ).toBe(403);
    expect((await preview(undefined, "9")).status).toBe(422);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("previews without mutation then inserts all rows and associations atomically", async () => {
    const draft = await preview();
    expect(draft.status).toBe(200);
    expect(draft.body.canImport).toBe(true);
    expect(mocks.commit).not.toHaveBeenCalled();
    const done = await confirm({
      rows: draft.body.rows,
      confirmation: draft.body.confirmation,
    });
    expect(done.status).toBe(200);
    expect(done.body.imported).toBe(1);
    const insert = mocks.query.mock.calls.find(([sql]) =>
      sql.startsWith("INSERT INTO employees"),
    );
    expect(insert?.[1]).toEqual([
      7,
      2,
      "Ana Silva",
      null,
      "0001",
      null,
      null,
      null,
      null,
      null,
      4,
      5,
    ]);
    expect(
      mocks.query.mock.calls.find(([sql]) =>
        sql.includes("INSERT INTO employee_locations"),
      )?.[1],
    ).toEqual([7, 11, 6]);
    expect(mocks.commit).toHaveBeenCalledOnce();
  });
  it("invalidates tampered previews and never inserts", async () => {
    const draft = await preview();
    draft.body.rows[0].nome = "Alterada";
    expect(
      (
        await confirm({
          rows: draft.body.rows,
          confirmation: draft.body.confirmation,
        })
      ).status,
    ).toBe(422);
    expect(mocks.beginTransaction).not.toHaveBeenCalled();
  });
  it("blocks duplicate registration, bad relationships and plan limits", async () => {
    expect(
      (await preview("nome;matricula\nAna Silva;001\nBruno Silva;001")).body
        .canImport,
    ).toBe(false);
    expect(
      (await preview("nome;matricula;grupo\nAna Silva;001;Outra empresa")).body
        .canImport,
    ).toBe(false);
    const original = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string, ...args: any[]) =>
      sql.includes("FROM subscriptions")
        ? [[{ max_employees: 0 }]]
        : original(sql, ...args),
    );
    expect((await preview()).body.canImport).toBe(false);
  });
  it("rechecks database duplicates at confirmation and rolls back the entire batch", async () => {
    const draft = await preview();
    const original = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string, ...args: any[]) =>
      sql.includes("SELECT cpf,registration_number")
        ? [[{ registration_number: "0001" }]]
        : original(sql, ...args),
    );
    expect(
      (
        await confirm({
          rows: draft.body.rows,
          confirmation: draft.body.confirmation,
        })
      ).status,
    ).toBe(409);
    expect(mocks.rollback).toHaveBeenCalledOnce();
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it("returns the stored result on retry instead of importing twice", async () => {
    const draft = await preview();
    const original = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string, ...args: any[]) =>
      sql.includes("FROM employee_imports")
        ? [[{ imported_count: 1 }]]
        : original(sql, ...args),
    );
    const result = await confirm({
      rows: draft.body.rows,
      confirmation: draft.body.confirmation,
    });
    expect(result.body).toEqual({ imported: 1, alreadyImported: true });
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        sql.startsWith("INSERT INTO employees"),
      ),
    ).toBe(false);
  });
});
