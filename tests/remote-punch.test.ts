import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
const m = vi.hoisted(() => ({
  query: vi.fn(),
  conn: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  device: vi.fn(),
  existing: null as any,
}));
vi.mock("../apps/api/src/db/pool.js", () => ({
  pool: {
    query: m.query,
    getConnection: async () => ({
      query: m.conn,
      beginTransaction: async () => {},
      commit: m.commit,
      rollback: m.rollback,
      release: () => {},
    }),
  },
}));
vi.mock("../apps/api/src/middlewares/auth.js", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.auth = {
      tenantId: 7,
      employeeId: 11,
      userId: 3,
      role: req.headers["x-role"] || "FUNCIONARIO",
    };
    next();
  },
}));
vi.mock("../apps/api/src/services/device-biometric.service.js", () => ({
  validateEmployeeDevice: m.device,
  getEmployeeDevicePolicy: async () => ({}),
}));
vi.mock("../apps/api/src/services/selfie.service.js", () => ({
  saveTimeEntrySelfie: m.save,
  removeTimeEntrySelfie: m.remove,
}));
import { remotePunchRouter } from "../apps/api/src/routes/remote-punch.routes";
const app = express();
app.use(express.json());
app.use("/remote-punch", remotePunchRouter);
app.use((_e: any, _req: any, res: any, _next: any) => res.sendStatus(500));
const photo = Buffer.concat([
  Buffer.from([255, 216, 255]),
  Buffer.alloc(100),
]).toString("base64");
const payload = () => ({
  employeeId: 11,
  requestKey: "remote-request-123456",
  type: "CLOCK_IN",
  capturedAt: new Date(Date.now() - 3600000).toISOString(),
  offline: true,
  source: "WEB",
  selfie: photo,
  deviceUid: null,
});
beforeEach(() => {
  vi.resetAllMocks();
  m.rollback.mockResolvedValue(undefined);
  m.existing = null;
  m.query.mockResolvedValue([
    [{ id: 11, company_id: 2, remote_enabled: 1, offline_enabled: 1 }],
  ]);
  m.device.mockResolvedValue({ verified: true, policy: {}, device: null });
  m.save.mockResolvedValue({
    relativePath: "fixture.jpg",
    sha256: "test",
    fileSize: 103,
  });
  m.conn.mockImplementation(async (sql: string, args: any[]) => {
    if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
    if (sql.includes("SELECT r.payload_hash"))
      return [m.existing ? [m.existing] : []];
    if (sql.includes("INSERT INTO time_entries")) return [{ insertId: 99 }];
    if (sql.includes("INSERT INTO remote_punches"))
      m.existing = {
        id: 99,
        payload_hash: args[7],
        registered_at: args[5],
        entry_type: "CLOCK_IN",
      };
    return [{ affectedRows: 1 }];
  });
});
it("sincroniza o horário capturado e retorna o mesmo comprovante no reenvio", async () => {
  const data = payload();
  expect((await request(app).post("/remote-punch").send(data)).status).toBe(
    201,
  );
  const retry = await request(app).post("/remote-punch").send(data);
  expect(retry.status).toBe(200);
  expect(retry.body.replayed).toBe(true);
  expect(
    m.conn.mock.calls.filter(([sql]) =>
      sql.includes("INSERT INTO time_entries"),
    ),
  ).toHaveLength(1);
  expect(m.existing.registered_at).toBe(
    new Date(Date.parse(data.capturedAt) - 3 * 3600000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " "),
  );
  expect(m.commit).toHaveBeenCalledTimes(1);
});
it("rejeita alteração de uma tentativa já recebida", async () => {
  const data = payload();
  await request(app).post("/remote-punch").send(data);
  expect(
    (
      await request(app)
        .post("/remote-punch")
        .send({ ...data, type: "CLOCK_OUT" })
    ).status,
  ).toBe(409);
});
it("exige autorização da empresa, vínculo ativo e papel funcionário", async () => {
  m.query.mockResolvedValue([
    [{ id: 11, company_id: 2, remote_enabled: 1, offline_enabled: 0 }],
  ]);
  expect(
    (await request(app).post("/remote-punch").send(payload())).status,
  ).toBe(403);
  m.query.mockResolvedValue([[]]);
  expect(
    (await request(app).post("/remote-punch").send(payload())).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post("/remote-punch")
        .set("x-role", "RH")
        .send(payload())
    ).status,
  ).toBe(403);
  expect(m.save).not.toHaveBeenCalled();
});
it("preserva as regras de aparelho e biometria e não aceita horário futuro", async () => {
  m.device.mockResolvedValue({ verified: false, message: "Revogado" });
  expect(
    (await request(app).post("/remote-punch").send(payload())).status,
  ).toBe(403);
  m.device.mockResolvedValue({
    verified: true,
    policy: { requireDeviceBiometric: true },
  });
  expect(
    (await request(app).post("/remote-punch").send(payload())).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post("/remote-punch")
        .send({
          ...payload(),
          capturedAt: new Date(Date.now() + 3600000).toISOString(),
        })
    ).status,
  ).toBe(422);
});
it("desfaz a operação e remove a foto quando a transação falha", async () => {
  m.commit.mockRejectedValue(new Error("DB failure"));
  expect(
    (await request(app).post("/remote-punch").send(payload())).status,
  ).toBe(500);
  expect(m.rollback).toHaveBeenCalled();
  expect(m.remove).toHaveBeenCalledWith("fixture.jpg");
});
