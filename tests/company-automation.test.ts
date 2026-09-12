import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
const m = vi.hoisted(() => ({
  query: vi.fn(),
  audit: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("../apps/api/src/db/pool.js", () => ({ pool: { query: m.query } }));
vi.mock("../apps/api/src/middlewares/auth.js", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.auth = {
      tenantId: 7,
      companyId: 2,
      userId: 3,
      role: req.headers["x-role"] || "TENANT_ADMIN",
    };
    next();
  },
}));
vi.mock("../apps/api/src/utils/audit.js", () => ({ writeAudit: m.audit }));
vi.mock("../apps/api/src/services/whatsapp.service.js", () => ({
  whatsappReady: () => true,
  whatsappStatus: () => ({ ready: true, status: "DISCONNECTED" }),
  disconnectWhatsApp: m.disconnect,
}));
vi.mock("../apps/api/src/services/overtime.service.js", () => ({
  overtimeSummary: async () => [],
}));
import { automationRouter } from "../apps/api/src/routes/automation.routes";
const app = express();
app.use(express.json());
app.use("/automation", automationRouter);
beforeEach(() => {
  vi.resetAllMocks();
  m.query.mockImplementation(async (sql: string) =>
    sql.includes("SELECT id FROM companies")
      ? [[{ id: 2 }]]
      : sql.includes("SELECT id,company_id")
        ? [[{ id: 11, company_id: 2, group_id: 5 }]]
        : sql.includes("SELECT overtime_enabled")
          ? [[{ overtime_enabled: 1 }]]
          : [[]],
  );
});
it("isola a empresa e proíbe funcionário de alterar configurações", async () => {
  expect((await request(app).get("/automation/companies/3")).status).toBe(404);
  expect(m.query).not.toHaveBeenCalled();
  expect(
    (
      await request(app)
        .get("/automation/companies/2")
        .set("x-role", "FUNCIONARIO")
    ).status,
  ).toBe(403);
});
it("valida números e impede ativar offline sem ponto remoto", async () => {
  const data = {
    overtimeEnabled: true,
    remoteEnabled: false,
    offlineEnabled: true,
    recipients: [],
  };
  expect(
    (await request(app).put("/automation/companies/2").send(data)).status,
  ).toBe(400);
  expect(
    (
      await request(app)
        .put("/automation/companies/2")
        .send({
          ...data,
          remoteEnabled: true,
          recipients: [{ name: "RH", phone: "bad" }],
        })
    ).status,
  ).toBe(400);
  expect(
    (
      await request(app)
        .put("/automation/companies/2")
        .send({
          ...data,
          remoteEnabled: true,
          recipients: [{ name: "RH", phone: "5511999999999" }],
        })
    ).status,
  ).toBe(200);
});
it("salva a substituição individual e permite removê-la para herdar do grupo", async () => {
  expect(
    (
      await request(app)
        .put("/automation/limits/employee/11")
        .send({ minutes: 1800 })
    ).status,
  ).toBe(200);
  expect(
    m.query.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO overtime_references"),
    )?.[1],
  ).toEqual([7, 2, "employee", 11, 1800]);
  expect(
    (
      await request(app)
        .put("/automation/limits/employee/11")
        .send({ minutes: null })
    ).status,
  ).toBe(200);
  expect(
    m.query.mock.calls.find(([sql]) =>
      sql.includes("DELETE FROM overtime_references"),
    )?.[1],
  ).toEqual([7, "employee", 11]);
});
it("conecta somente por ação explícita e desconecta a sessão da empresa", async () => {
  expect(
    (await request(app).post("/automation/companies/2/whatsapp/connect"))
      .status,
  ).toBe(200);
  expect(
    m.query.mock.calls.find(([sql]) =>
      sql.includes("SET whatsapp_enabled"),
    )?.[1],
  ).toEqual([1, 7, 2]);
  expect(
    (await request(app).post("/automation/companies/2/whatsapp/disconnect"))
      .status,
  ).toBe(200);
  expect(m.disconnect).toHaveBeenCalledWith(7, 2);
});
