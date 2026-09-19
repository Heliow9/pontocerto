import "express-async-errors";
import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
const m = vi.hoisted(() => ({
  query: vi.fn(),
  poolQuery: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  cap: 2,
  total: 2,
  active: 0,
  taken: [] as string[],
}));
vi.mock("../apps/api/src/db/pool.js", () => ({
  pool: { query: m.poolQuery, getConnection: async () => m },
}));
vi.mock("../apps/api/src/middlewares/auth.js", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.auth = { tenantId: 7, userId: 3, role: "TENANT_ADMIN" };
    next();
  },
}));
vi.mock("../apps/api/src/config/env.js", () => ({
  env: { JWT_SECRET: "test-secret-123456" },
}));
vi.mock("../apps/api/src/utils/audit.js", () => ({ writeAudit: vi.fn() }));
import { employeesRouter } from "../apps/api/src/routes/employees.routes";
const app = express();
app.use(express.json());
app.use("/employees", employeesRouter);
app.use((err: any, _req: any, res: any, _next: any) =>
  res.status(err.status || 500).json({ message: err.message }),
);
beforeEach(() => {
  vi.resetAllMocks();
  m.cap = 2;
  m.total = 2;
  m.active = 0;
  m.taken = [];
  m.poolQuery.mockImplementation((...args: any[]) => m.query(...args));
  m.query.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes("FROM companies"))
      return [[{ id: 2, legal_name: "Árvore Serviços Ltda" }]];
    if (sql.includes("COUNT(*)")) return [[{ total: m.total }]];
    if (
      sql.includes("FROM subscriptions") ||
      (sql.includes("FROM tenants") && !sql.includes("FOR UPDATE"))
    )
      return [
        [
          {
            max_employees: m.cap,
            contract_employees: m.cap,
            status: "PAST_DUE",
          },
        ],
      ];
    if (sql.includes("FROM employees"))
      return [[{ id: 11, company_id: 2, active: m.active }]];
    if (sql.includes("FROM users") && sql.includes("email"))
      return [
        m.taken
          .filter((email) => params.flat().includes(email))
          .map((email) => ({ id: 99, email })),
      ];
    if (sql.includes("FROM users")) return [[]];
    return [{ insertId: 11, affectedRows: 1 }];
  });
});
const payload = { companyId: 2, name: "João da Silva" };
it("enforces the contracted cap even when the latest subscription is past due", async () => {
  expect((await request(app).post("/employees").send(payload)).status).toBe(
    403,
  );
});
it("allows inactive registration at the cap but refuses reactivation", async () => {
  expect(
    (
      await request(app)
        .post("/employees")
        .send({ ...payload, active: false })
    ).status,
  ).toBe(201);
  expect((await request(app).put("/employees/11").send(payload)).status).toBe(
    403,
  );
});
it("suggests normalized names and skips globally occupied addresses", async () => {
  m.taken = ["joao.silva@arvore.com.br", "joao.silva2@arvore.com.br"];
  const response = await request(app)
    .get("/employees/email-suggestions")
    .query({ companyId: 2, name: payload.name });
  expect(response.status).toBe(200);
  expect(response.body.suggestions).toEqual([
    "joao.silva3@arvore.com.br",
    "joao.silva4@arvore.com.br",
    "joao.silva5@arvore.com.br",
  ]);
});
it("rejects an occupied email on save with alternative suggestions", async () => {
  m.total = 0;
  m.taken = ["joao.silva@arvore.com.br"];
  const response = await request(app)
    .post("/employees")
    .send({
      ...payload,
      accessEmail: " JOAO.SILVA@arvore.com.br ",
      accessPassword: "123456",
    });
  expect(response.status).toBe(409);
  expect(response.body.suggestions).toContain("joao.silva2@arvore.com.br");
});
it("rejects duplicate emails when editing and rolls back employee changes", async () => {
  m.active = 1;
  m.taken = ["joao.silva@arvore.com.br"];
  const response = await request(app)
    .put("/employees/11")
    .send({ ...payload, accessEmail: m.taken[0] });
  expect(response.status).toBe(409);
  expect(response.body.suggestions).toHaveLength(3);
  expect(m.rollback).toHaveBeenCalled();
  expect(m.commit).not.toHaveBeenCalled();
});
it("allows editing an active employee at the cap without allocating another seat", async () => {
  m.active = 1;
  expect((await request(app).put("/employees/11").send(payload)).status).toBe(
    200,
  );
});
it("rereads employee activity after acquiring the tenant lock", async () => {
  const original = m.query.getMockImplementation()!;
  m.query.mockImplementation(async (sql: string, ...args: any[]) =>
    sql.includes("FROM employees") && !sql.includes("COUNT(*)")
      ? [
          [
            {
              id: 11,
              company_id: 2,
              active: sql.includes("FOR UPDATE") ? 0 : 1,
            },
          ],
        ]
      : original(sql, ...args),
  );
  expect((await request(app).put("/employees/11").send(payload)).status).toBe(
    403,
  );
});
it("returns fresh suggestions if a competing insert takes the email during save", async () => {
  m.total = 0;
  const original = m.query.getMockImplementation()!;
  m.query.mockImplementation(async (sql: string, ...args: any[]) => {
    if (sql.includes("INSERT INTO users")) {
      m.taken = ["joao.silva@arvore.com.br"];
      throw Object.assign(new Error("Duplicate"), { code: "ER_DUP_ENTRY" });
    }
    return original(sql, ...args);
  });
  const response = await request(app)
    .post("/employees")
    .send({
      ...payload,
      accessEmail: "joao.silva@arvore.com.br",
      accessPassword: "123456",
    });
  expect(response.status).toBe(409);
  expect(response.body.suggestions[0]).toBe("joao.silva2@arvore.com.br");
  expect(m.commit).not.toHaveBeenCalled();
});
it("can return a conflict without borrowing another pool connection", async () => {
  m.total = 0;
  m.taken = ["joao.silva@arvore.com.br"];
  let held = false;
  m.beginTransaction.mockImplementation(async () => {
    held = true;
  });
  m.release.mockImplementation(() => {
    held = false;
  });
  m.poolQuery.mockImplementation((...args: any[]) => {
    if (held) throw new Error("No additional pool connection available");
    return m.query(...args);
  });
  const response = await request(app)
    .post("/employees")
    .send({ ...payload, accessEmail: m.taken[0], accessPassword: "123456" });
  expect(response.status).toBe(409);
  expect(response.body.suggestions[0]).toBe("joao.silva2@arvore.com.br");
});
