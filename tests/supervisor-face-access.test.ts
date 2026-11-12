import "express-async-errors";
import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const m = vi.hoisted(() => ({
  permission: "write",
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock("../apps/api/src/db/pool.js", () => ({
  pool: { query: m.query, getConnection: async () => ({ query: m.query, release: m.release }) },
}));
vi.mock("../apps/api/src/middlewares/auth.js", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.auth = { tenantId: 7, companyId: 2, userId: 3, role: "SUPERVISOR" };
    next();
  },
}));
vi.mock("../apps/api/src/utils/audit.js", () => ({ writeAudit: vi.fn() }));
vi.mock("../apps/api/src/services/face.service.js", () => ({
  assertSingleFace: vi.fn(),
  validateFaceImage: () => "image/png",
  faceError: (message: string, code: string, status: number) =>
    Object.assign(new Error(message), { code, status }),
}));
vi.mock("../apps/api/src/services/face-collection.service.js", () => ({
  indexEmployeeFace: vi.fn(),
  removeEmployeeFaceIndex: vi.fn(),
}));
vi.mock("../apps/api/src/services/control-id-sync.service.js", () => ({
  enqueueControlIdEmployeeSync: vi.fn(async () => ({ queued: true })),
  enqueueControlIdEmployeeRemoval: vi.fn(async () => ({ queued: true })),
}));

import { faceRouter } from "../apps/api/src/routes/face.routes";

const app = express();
app.use("/face", faceRouter);
app.use((err: any, _req: any, res: any, _next: any) =>
  res.status(err.status || 500).json({ message: err.message }),
);

beforeEach(() => {
  vi.clearAllMocks();
  m.permission = "write";
  m.query.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes("FROM users u LEFT JOIN user_permissions"))
      return [[{
        active: 1,
        permissions_json: JSON.stringify({ employees: m.permission }),
        sensitive_permissions_json: "{}",
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
    if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
    if (sql.includes("FROM employee_face_images")) return [[]];
    return [{ affectedRows: 1 }];
  });
});

it("allows an employee writer to read and save a photo in the supervisor company", async () => {
  expect((await request(app).get("/face/employee/11/status")).status).toBe(200);
  expect(
    (
      await request(app)
        .post("/face/employee/11/photo")
        .attach("photo", Buffer.from("photo"), "photo.png")
    ).status,
  ).toBe(200);
});

it("rejects photo writes when the supervisor only has employee read access", async () => {
  m.permission = "read";
  expect(
    (
      await request(app)
        .post("/face/employee/11/photo")
        .attach("photo", Buffer.from("photo"), "photo.png")
    ).status,
  ).toBe(403);
});

it("does not expose another company's employee photo to a supervisor", async () => {
  expect((await request(app).get("/face/employee/12/status")).status).toBe(404);
});
