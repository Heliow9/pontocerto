import { beforeEach, describe, expect, it, vi } from "vitest";
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
  env: { JWT_SECRET: "groups-test-only", SELFIE_STORAGE_DIR: "test-results/selfies", SELFIE_MAX_IMAGE_MB: 5 },
}));
vi.mock("../apps/api/src/utils/audit.js", () => ({ writeAudit: mocks.audit }));
import { groupsRouter } from "../apps/api/src/routes/groups.routes";
import { timeEntriesRouter } from "../apps/api/src/routes/time-entries.routes";
const app = express();
app.use(express.json());
app.use("/groups", groupsRouter);
app.use("/time-entries", timeEntriesRouter);
app.use((_err: any, _req: any, res: any, _next: any) =>
  res.status(500).json({ message: "Erro interno" }),
);
const token = (role = "TENANT_ADMIN", companyId: number | null = 2) =>
  jwt.sign(
    { tenantId: 7, companyId, employeeId: 11, userId: 3, role },
    "groups-test-only",
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM employee_groups"))
      return [[{ id: 4, company_id: 2, name: "Equipe A" }]];
    if (sql.includes("FROM companies")) return [[{ id: 2 }]];
    if (sql.includes("SELECT id FROM employees"))
      return [[{ id: 11 }, { id: 12 }]];
    return [{ affectedRows: 1, insertId: 4 }];
  });
});
describe("employee groups", () => {
  it("requires authentication and denies employee access", async () => {
    expect((await request(app).get("/groups")).status).toBe(401);
    expect(
      (
        await request(app)
          .get("/groups")
          .auth(token("FUNCIONARIO"), { type: "bearer" })
      ).status,
    ).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("scopes the list by tenant and authenticated company", async () => {
    expect(
      (await request(app).get("/groups").auth(token(), { type: "bearer" }))
        .status,
    ).toBe(200);
    expect(mocks.query.mock.calls[0][1]).toEqual([7, 2]);
  });
  it("rejects creating a group in another company before a query", async () => {
    expect(
      (
        await request(app)
          .post("/groups")
          .auth(token(), { type: "bearer" })
          .send({ companyId: 9, name: "Equipe A" })
      ).status,
    ).toBe(404);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("denies supervisor mutations", async () => {
    expect(
      (
        await request(app)
          .put("/groups/4/members")
          .auth(token("SUPERVISOR"), { type: "bearer" })
          .send({ employeeIds: [11] })
      ).status,
    ).toBe(403);
    expect(mocks.beginTransaction).not.toHaveBeenCalled();
  });
  it("validates every member before replacing the group transactionally", async () => {
    const result = await request(app)
      .put("/groups/4/members")
      .auth(token(), { type: "bearer" })
      .send({ employeeIds: [11, 12] });
    expect(result.status).toBe(200);
    expect(mocks.query.mock.calls[1][1]).toEqual([7, 2, 11, 12]);
    expect(mocks.query.mock.calls[3][1]).toEqual([4, 7, 2, 11, 12]);
    expect(mocks.commit).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.audit.mock.calls[0][1]).toBe("GROUP_MEMBERS_UPDATED");
  });
  it("rolls back without changing membership if any employee is outside the company", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ id: 4, company_id: 2 }]])
      .mockResolvedValueOnce([[{ id: 11 }]]);
    expect(
      (
        await request(app)
          .put("/groups/4/members")
          .auth(token(), { type: "bearer" })
          .send({ employeeIds: [11, 99] })
      ).status,
    ).toBe(400);
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.rollback).toHaveBeenCalledOnce();
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it("rejects duplicate membership and allows empty groups", async () => {
    expect(
      (
        await request(app)
          .put("/groups/4/members")
          .auth(token(), { type: "bearer" })
          .send({ employeeIds: [11, 11] })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .put("/groups/4/members")
          .auth(token(), { type: "bearer" })
          .send({ employeeIds: [] })
      ).status,
    ).toBe(200);
    expect(
      mocks.query.mock.calls.some(([sql]) => sql.includes("group_id=NULL")),
    ).toBe(true);
  });
  it("protects populated groups from deletion", async () => {
    mocks.query.mockRejectedValueOnce({ code: "ER_ROW_IS_REFERENCED_2" });
    expect(
      (await request(app).delete("/groups/4").auth(token(), { type: "bearer" }))
        .status,
    ).toBe(409);
  });
});
describe("employee daily summaries", () => {
  it("does not allow selecting another employee and uses the authenticated employee", async () => {
    mocks.query.mockResolvedValueOnce([[]]);
    const result = await request(app)
      .get("/time-entries/my/summary?days=30&employeeId=99")
      .auth(token("FUNCIONARIO"), { type: "bearer" });
    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(mocks.query.mock.calls[0][1]).toEqual([7, 11, 29]);
  });
  it("rejects invalid periods and non-employee roles", async () => {
    expect(
      (
        await request(app)
          .get("/time-entries/my/summary?days=NaN")
          .auth(token("FUNCIONARIO"), { type: "bearer" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .get("/time-entries/my/summary")
          .auth(token(), { type: "bearer" })
      ).status,
    ).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
