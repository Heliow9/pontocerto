import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../apps/api/src/db/pool.js", () => ({ pool: { query } }));
vi.mock("../apps/api/src/config/env.js", () => ({
  env: { JWT_SECRET: "test-only-password-secret" },
}));
import jwt from "jsonwebtoken";
import { passwordRouter } from "../apps/api/src/routes/password.routes";
const app = express();
app.use(express.json());
app.use("/auth", passwordRouter);
app.use((_error: any, _req: any, res: any, _next: any) =>
  res.status(500).json({ message: "Erro interno" }),
);
const oldPassword = "Anterior-teste-123";
const body = {
  currentPassword: oldPassword,
  newPassword: "Nova-teste-456",
  confirmPassword: "Nova-teste-456",
};
let hash: string;
function send(role = "FUNCIONARIO", data = body) {
  const token = jwt.sign(
    { userId: 3, tenantId: 7, role },
    "test-only-password-secret",
  );
  return request(app)
    .post("/auth/password")
    .auth(token, { type: "bearer" })
    .send(data);
}
beforeEach(async () => {
  query.mockReset();
  hash = await bcrypt.hash(oldPassword, 4);
  query
    .mockResolvedValueOnce([[{ password_hash: hash }]])
    .mockResolvedValue([{ affectedRows: 1 }]);
});
it("requires an authenticated session", async () => {
  expect((await request(app).post("/auth/password").send(body)).status).toBe(
    401,
  );
  expect(query).not.toHaveBeenCalled();
});
it.each(["FUNCIONARIO", "TENANT_ADMIN", "SUPER_ADMIN"])(
  "changes only the authenticated account for %s",
  async (role) => {
    const result = await send(role, {
      ...body,
      userId: 999,
      tenantId: 888,
    } as any);
    expect(result.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([3, 7]);
    const values = query.mock.calls[1][1];
    expect(values.slice(1)).toEqual([3, 7, hash]);
    expect(await bcrypt.compare(body.newPassword, values[0])).toBe(true);
    expect(await bcrypt.compare(oldPassword, values[0])).toBe(false);
    expect(JSON.stringify(result.body)).not.toContain(values[0]);
  },
);
it("rejects an incorrect current password without changing data", async () => {
  const result = await send("TENANT_ADMIN", {
    ...body,
    currentPassword: "Incorreta",
  });
  expect(result.status).toBe(400);
  expect(query).toHaveBeenCalledTimes(1);
});
it.each([
  { ...body, confirmPassword: "Diferente" },
  { ...body, newPassword: "curta", confirmPassword: "curta" },
  { ...body, newPassword: oldPassword, confirmPassword: oldPassword },
  { ...body, newPassword: "á".repeat(37), confirmPassword: "á".repeat(37) },
])("rejects invalid password input before database access", async (data) => {
  expect((await send("FUNCIONARIO", data)).status).toBe(400);
  expect(query).not.toHaveBeenCalled();
});
it("does not overwrite a concurrent password change", async () => {
  query.mockReset();
  query
    .mockResolvedValueOnce([[{ password_hash: hash }]])
    .mockResolvedValueOnce([{ affectedRows: 0 }]);
  expect((await send()).status).toBe(409);
});
it("rejects unavailable accounts", async () => {
  query.mockReset();
  query.mockResolvedValueOnce([[]]);
  expect((await send()).status).toBe(403);
  expect(query).toHaveBeenCalledTimes(1);
});
