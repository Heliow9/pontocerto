import "express-async-errors";
import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
const m = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  check: vi.fn(),
  audit: vi.fn(),
  photo: null as Buffer | null,
  exists: true,
}));
vi.mock("../apps/api/src/db/pool.js", () => ({
  pool: { query: m.query, getConnection: async () => m },
}));
vi.mock("../apps/api/src/middlewares/auth.js", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.auth = {
      tenantId: 7,
      userId: 3,
      role: req.headers["x-role"] || "TENANT_ADMIN",
    };
    next();
  },
}));
vi.mock("../apps/api/src/utils/audit.js", () => ({ writeAudit: m.audit }));
vi.mock("../apps/api/src/services/face.service.js", () => ({
  assertSingleFace: m.check,
  validateFaceImage: () => "image/png",
  faceError: (message: string, code: string, status: number) =>
    Object.assign(new Error(message), { code, status }),
}));
import { faceRouter } from "../apps/api/src/routes/face.routes";
const app = express();
app.use("/face", faceRouter);
app.use((err: any, _req: any, res: any, _next: any) =>
  res.status(err.status || 500).json({ message: err.message }),
);
beforeEach(() => {
  vi.resetAllMocks();
  m.photo = null;
  m.exists = true;
  m.query.mockImplementation(async (sql: string, params: any[]) => {
    if (sql.includes("FROM employees"))
      return [m.exists ? [{ id: 11, company_id: 2 }] : []];
    if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
    if (sql.includes("INSERT INTO employee_face_images")) {
      m.photo = params[2];
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("DELETE FROM employee_face_images")) {
      m.photo = null;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("FROM employee_face_images"))
      return [
        m.photo
          ? [
              {
                image: m.photo,
                mime_type: "image/png",
                updated_at: "2026-09-14",
              },
            ]
          : [],
      ];
    return [[]];
  });
});
it("saves, replaces, previews and removes a reference photo", async () => {
  expect(
    (await request(app).get("/face/employee/11/status")).body.enrolled,
  ).toBe(false);
  expect(
    (
      await request(app)
        .post("/face/employee/11/photo")
        .attach("photo", Buffer.from("first"), "photo.png")
    ).status,
  ).toBe(200);
  expect(
    (await request(app).get("/face/employee/11/status")).body.enrolled,
  ).toBe(true);
  await request(app)
    .post("/face/employee/11/photo")
    .attach("photo", Buffer.from("second"), "photo.png");
  const photo = await request(app).get("/face/employee/11/photo");
  expect(photo.body.toString()).toBe("second");
  expect(photo.headers["cache-control"]).toBe("no-store");
  expect((await request(app).delete("/face/employee/11/photo")).status).toBe(
    200,
  );
  expect(
    (await request(app).get("/face/employee/11/status")).body.enrolled,
  ).toBe(false);
});
it("keeps the previous reference if AWS rejects a replacement", async () => {
  m.photo = Buffer.from("old");
  m.check.mockRejectedValue(
    Object.assign(new Error("No face"), { status: 422 }),
  );
  expect(
    (
      await request(app)
        .post("/face/employee/11/photo")
        .attach("photo", Buffer.from("new"), "photo.png")
    ).status,
  ).toBe(422);
  expect(m.photo.toString()).toBe("old");
});
it("rejects employee self-enrollment and another tenant's employee", async () => {
  expect(
    (
      await request(app)
        .delete("/face/employee/11/photo")
        .set("x-role", "FUNCIONARIO")
    ).status,
  ).toBe(403);
  m.exists = false;
  expect((await request(app).get("/face/employee/11/photo")).status).toBe(404);
  expect(m.query.mock.calls.at(-1)?.[1]).toEqual([11, 7]);
});
