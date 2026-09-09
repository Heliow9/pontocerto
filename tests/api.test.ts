import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getConnection: vi.fn(),
  connQuery: vi.fn(),
  begin: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  schedule: vi.fn(),
  geo: vi.fn(),
  device: vi.fn(),
  saveSelfie: vi.fn(),
  removeSelfie: vi.fn(),
  existing: null as any,
}));
vi.mock("../apps/api/src/db/pool.js", () => ({
  pool: { query: mocks.query, getConnection: mocks.getConnection },
}));
vi.mock("../apps/api/src/middlewares/auth.js", () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../apps/api/src/config/env.js", () => ({
  env: { SELFIE_MAX_IMAGE_MB: 5 },
}));
vi.mock("../apps/api/src/services/geofence.service.js", () => ({
  evaluateEmployeeGeofence: mocks.geo,
  getCompanySecurityPolicy: vi.fn(),
}));
vi.mock("../apps/api/src/services/schedule-guard.service.js", () => ({
  evaluateEmployeeSchedule: mocks.schedule,
}));
vi.mock("../apps/api/src/services/device-biometric.service.js", () => ({
  validateEmployeeDevice: mocks.device,
  getEmployeeDevicePolicy: vi.fn(),
}));
vi.mock("../apps/api/src/services/selfie.service.js", () => ({
  saveTimeEntrySelfie: mocks.saveSelfie,
  removeTimeEntrySelfie: mocks.removeSelfie,
  readTimeEntrySelfie: vi.fn(),
}));
import { timeEntriesRouter } from "../apps/api/src/routes/time-entries.routes";
import { adjustmentsRouter } from "../apps/api/src/routes/adjustments.routes";
import { isLocalDateTime } from "../apps/api/src/utils/adjustment-validation";
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.auth = {
    tenantId: 7,
    employeeId: 11,
    userId: 3,
    role: req.headers["x-role"] || "FUNCIONARIO",
  };
  next();
});
app.use("/time-entries", timeEntriesRouter);
app.use("/adjustments", adjustmentsRouter);
app.use((err: any, _req: any, res: any, _next: any) =>
  res.status(500).json({ message: "Erro de teste" }),
);
const entry = {
  id: 99,
  registered_at: "2026-09-09 08:00:00",
  entry_type: "CLOCK_IN",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.existing = null;
  mocks.getConnection.mockResolvedValue({
    query: mocks.connQuery,
    beginTransaction: mocks.begin,
    commit: mocks.commit,
    rollback: mocks.rollback,
    release: mocks.release,
  });
  mocks.query.mockImplementation(async (sql: string) =>
    sql.includes("SELECT id,company_id")
      ? [[{ id: 11, company_id: 2 }]]
      : sql.includes("SELECT id,registered_at")
        ? [[entry]]
        : [[]],
  );
  mocks.connQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
    if (sql.includes("SELECT te.*"))
      return [mocks.existing ? [mocks.existing] : []];
    if (sql.includes("INSERT INTO time_entries")) return [{ insertId: 99 }];
    if (sql.includes("INSERT INTO punch_requests")) mocks.existing = entry;
    return [{ affectedRows: 1 }];
  });
  mocks.schedule.mockResolvedValue({
    decision: "ALLOWED",
    complete: false,
    nextType: "CLOCK_IN",
  });
  mocks.geo.mockResolvedValue({ decision: "ALLOWED", policy: {} });
  mocks.device.mockResolvedValue({
    verified: true,
    required: false,
    policy: { requireDeviceBiometric: false },
  });
  mocks.saveSelfie.mockResolvedValue({
    relativePath: "test.jpg",
    fileSize: 3,
    sha256: "test",
  });
});
function punch() {
  return request(app)
    .post("/time-entries/secure")
    .field("requestKey", "request-test-12345678")
    .field("latitude", "-8")
    .field("longitude", "-34")
    .attach("selfie", Buffer.from([1, 2, 3]), {
      filename: "selfie.jpg",
      contentType: "image/jpeg",
    });
}
describe("registro seguro", () => {
  it("reutiliza a confirmação na mesma tentativa, sem segunda marcação", async () => {
    expect((await punch()).status).toBe(201);
    const retry = await punch();
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(99);
    expect(retry.body.replayed).toBe(true);
    expect(
      mocks.connQuery.mock.calls.filter(([sql]) =>
        sql.includes("INSERT INTO time_entries"),
      ),
    ).toHaveLength(1);
    expect(
      mocks.connQuery.mock.calls.find(([sql]) =>
        sql.includes("SELECT te.*"),
      )?.[1],
    ).toEqual([7, 11, "request-test-12345678"]);
  });
  it("mantém foto gravada se a resposta falha após commit", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id,company_id"))
        return [[{ id: 11, company_id: 2 }]];
      if (sql.includes("SELECT id,registered_at"))
        throw new Error("conexão perdida");
      return [[]];
    });
    expect((await punch()).status).toBe(500);
    expect(mocks.commit).toHaveBeenCalledOnce();
    expect(mocks.removeSelfie).not.toHaveBeenCalled();
    expect(mocks.rollback).not.toHaveBeenCalled();
  });
  it("bloqueio de jornada não grava e libera lock", async () => {
    mocks.schedule.mockResolvedValue({
      decision: "BLOCKED",
      message: "Fora da jornada",
    });
    expect((await punch()).status).toBe(403);
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(
      mocks.connQuery.mock.calls.some(([sql]) => sql.includes("RELEASE_LOCK")),
    ).toBe(true);
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("recusa tentativa simultânea enquanto o lock está ocupado", async () => {
    mocks.connQuery.mockResolvedValue([[{ acquired: 0 }]]);
    expect((await punch()).body.code).toBe("PUNCH_BUSY");
    expect(mocks.begin).not.toHaveBeenCalled();
  });
  it("exige selfie e perfil funcionário", async () => {
    expect(
      (await request(app).post("/time-entries/secure").send({})).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/time-entries/secure")
          .set("x-role", "SUPERVISOR")
          .send({})
      ).status,
    ).toBe(403);
  });
  it("consulta confirmação limitada ao funcionário e organização", async () => {
    await request(app).get("/time-entries/my/requests/request-test-12345678");
    expect(mocks.query.mock.calls[0][1]).toEqual([
      7,
      11,
      "request-test-12345678",
    ]);
  });
});
describe("solicitações", () => {
  it("rejeita datas impossíveis", () => {
    expect(isLocalDateTime("2026-02-30T08:00")).toBe(false);
    expect(isLocalDateTime("2026-09-09T25:00")).toBe(false);
    expect(isLocalDateTime("2028-02-29T23:59")).toBe(true);
  });
  it("funcionário não pode aprovar o próprio pedido", async () => {
    expect(
      (
        await request(app)
          .patch("/adjustments/1")
          .send({ status: "APPROVED", note: "Aprovado" })
      ).status,
    ).toBe(403);
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });
  it("rejeita alteração de marcação de outro funcionário", async () => {
    mocks.query.mockResolvedValue([[]]);
    expect(
      (
        await request(app)
          .post("/adjustments")
          .send({
            timeEntryId: 400,
            requestedTime: "2026-09-09T08:00",
            entryType: "CLOCK_IN",
            reason: "Horário incorreto",
          })
      ).status,
    ).toBe(404);
  });
  it("dupla análise não altera novamente o registro", async () => {
    mocks.connQuery.mockResolvedValue([[{ id: 1, status: "APPROVED" }]]);
    expect(
      (
        await request(app)
          .patch("/adjustments/1")
          .set("x-role", "RH")
          .send({ status: "APPROVED", note: "Aprovado" })
      ).status,
    ).toBe(409);
    expect(mocks.rollback).toHaveBeenCalledOnce();
    expect(mocks.commit).not.toHaveBeenCalled();
  });
});
