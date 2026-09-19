import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../apps/api/src/db/pool.js", () => ({ pool: mocks }));
vi.mock("../apps/api/src/config/env.js", () => ({
  env: { JWT_SECRET: "session-test-secret", JWT_EXPIRES_IN: "8h" },
}));
import { authRouter } from "../apps/api/src/routes/auth.routes";
import { authMiddleware } from "../apps/api/src/middlewares/auth";
import { sessionHash } from "../apps/api/src/services/session.service";
const app = express();
app.use(express.json());
app.use("/auth", authRouter);
app.get("/protected", authMiddleware, (req, res) => res.json(req.auth));
app.use((_error: any, _req: any, res: any, _next: any) => res.sendStatus(503));
let user: any;
let stored: any;
beforeEach(async () => {
  stored = null;
  user = {
    id: 3,
    tenant_id: 7,
    company_id: 2,
    employee_id: 11,
    active: 1,
    tenant_status: "ACTIVE",
    role: "FUNCIONARIO",
    name: "Ana",
    email: "ana@example.test",
    password_hash: await bcrypt.hash("password123", 4),
  };
  mocks.query.mockReset();
  mocks.query.mockImplementation(async (sql: string, values: any[]) => {
    if (sql.includes("INSERT INTO persistent_sessions")) {
      stored = values;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("DELETE FROM persistent_sessions")) {
      if (stored?.[0] === values[0]) stored = null;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("FROM persistent_sessions"))
      return [
        [
          ...(stored?.[0] === values[0] &&
          user.active &&
          user.tenant_status === "ACTIVE"
            ? [{ ...user, password_fingerprint: stored[3] }]
            : []),
        ],
      ];
    return [[user]];
  });
});
const login = (persistent = true) =>
  request(app)
    .post("/auth/login")
    .send({ email: "ana@example.test", password: "password123", persistent });
it("persists beyond eight hours and stores only a hash; logout revokes the token", async () => {
  const result = await login();
  expect(result.status).toBe(200);
  const token = result.body.token;
  expect(token).toMatch(/^pc_session_[a-f0-9]{64}$/);
  expect(stored[0]).toBe(sessionHash(token));
  expect(JSON.stringify(stored)).not.toContain(token);
  const clock = vi
    .spyOn(Date, "now")
    .mockReturnValue(Date.now() + 365 * 86400000);
  try {
    expect(
      (await request(app).get("/protected").auth(token, { type: "bearer" }))
        .status,
    ).toBe(200);
  } finally {
    clock.mockRestore();
  }
  expect(
    (await request(app).post("/auth/logout").auth(token, { type: "bearer" }))
      .status,
  ).toBe(204);
  expect(
    (await request(app).get("/protected").auth(token, { type: "bearer" }))
      .status,
  ).toBe(401);
});
it("invalidates a persistent session after password changes or account deactivation", async () => {
  const { body } = await login();
  user.password_hash = "changed-password-hash";
  expect(
    (await request(app).get("/protected").auth(body.token, { type: "bearer" }))
      .status,
  ).toBe(401);
  user.password_hash = await bcrypt.hash("password123", 4);
  const next = await login();
  user.active = 0;
  expect(
    (
      await request(app)
        .get("/protected")
        .auth(next.body.token, { type: "bearer" })
    ).status,
  ).toBe(401);
});
it("does not treat a database outage as an expired session", async () => {
  const { body } = await login();
  mocks.query.mockRejectedValue(new Error("database offline"));
  expect(
    (await request(app).get("/protected").auth(body.token, { type: "bearer" }))
      .status,
  ).toBe(503);
});
it("keeps the existing JWT login for managers and nonpersistent clients", async () => {
  let result = await login(false);
  expect(jwt.verify(result.body.token, "session-test-secret")).toHaveProperty(
    "exp",
  );
  user.role = "TENANT_ADMIN";
  result = await login();
  expect(jwt.verify(result.body.token, "session-test-secret")).toHaveProperty(
    "role",
    "TENANT_ADMIN",
  );
  expect(stored).toBeNull();
});
it("rejects wrong passwords and forged session tokens", async () => {
  expect(
    (
      await request(app)
        .post("/auth/login")
        .send({ email: user.email, password: "wrong", persistent: true })
    ).status,
  ).toBe(401);
  expect(
    (
      await request(app)
        .get("/protected")
        .auth(`pc_session_${"a".repeat(64)}`, { type: "bearer" })
    ).status,
  ).toBe(401);
  expect(stored).toBeNull();
});
