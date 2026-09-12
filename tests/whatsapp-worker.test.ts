import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  query: vi.fn(),
  gate: vi.fn(),
  socket: vi.fn(),
  send: vi.fn(),
  onWhatsApp: vi.fn(),
  events: {} as Record<string, Function>,
  collect: vi.fn(),
  state: "PENDING",
  companies: [] as any[],
}));
vi.mock("../apps/api/src/db/pool.js", () => ({
  pool: {
    query: m.query,
    getConnection: async () => ({
      query: m.gate,
      ping: async () => {},
      on: () => {},
      release: () => {},
    }),
  },
}));
vi.mock("../apps/api/src/services/overtime.service.js", () => ({
  collectOvertimeAlerts: m.collect,
}));
vi.mock("@whiskeysockets/baileys", () => ({
  default: m.socket,
  BufferJSON: {
    replacer: (_k: string, v: any) => v,
    reviver: (_k: string, v: any) => v,
  },
  DisconnectReason: { loggedOut: 401, restartRequired: 515 },
  initAuthCreds: () => ({ registered: false }),
  generateMessageIDV2: () => "message-1",
  proto: { Message: { AppStateSyncKeyData: { fromObject: (v: any) => v } } },
}));
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("WHATSAPP_ENCRYPTION_KEY", "a".repeat(64));
  m.events = {};
  m.state = "PENDING";
  m.companies = [
    {
      tenant_id: 7,
      company_id: 2,
      recipients: JSON.stringify([{ name: "RH", phone: "5511999999999" }]),
    },
  ];
  m.gate.mockResolvedValue([[{ acquired: 1 }]]);
  m.socket.mockImplementation(() => ({
    user: { id: "5511888888888:1@s.whatsapp.net" },
    ev: {
      on: (name: string, fn: Function) => {
        m.events[name] = fn;
      },
    },
    sendMessage: m.send,
    onWhatsApp: m.onWhatsApp,
    end: () => {},
    logout: async () => {},
  }));
  m.send.mockResolvedValue({ key: { id: "message-1" } });
  m.onWhatsApp.mockResolvedValue([{ exists: true, jid: "5511999999999@s.whatsapp.net" }]);
  m.query.mockImplementation(async (sql: string, args: any[]) => {
    if (sql.includes("SELECT a.*")) return [m.companies];
    if (sql.includes("SELECT encrypted_value")) return [[]];
    if (sql.includes("SELECT * FROM overtime_alerts"))
      return [
        m.state === "PENDING"
          ? [
              {
                id: 9,
                recipient: "5511999999999",
                message_text: "fixture only",
              },
            ]
          : [],
      ];
    if (sql.includes("SET status='SENDING'")) {
      m.state = "SENDING";
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("SET status='SENT'") || sql.includes("SET status='ACCEPTED'")) m.state = "ACCEPTED";
    if (sql.includes("SET status='UNKNOWN',error_code='SEND_UNCONFIRMED'"))
      m.state = "UNKNOWN";
    return [{ affectedRows: 1 }];
  });
});
afterEach(() => vi.unstubAllEnvs());
it("envia pela sessão correta e não repete o alerta depois da confirmação", async () => {
  const worker = await import("../apps/api/src/services/whatsapp.service");
  await worker.runWhatsAppTick();
  m.events["connection.update"]({ connection: "open" });
  await worker.runWhatsAppTick();
  await worker.runWhatsAppTick();
  expect(m.send).toHaveBeenCalledTimes(1);
  expect(m.send).toHaveBeenCalledWith(
    "5511999999999@s.whatsapp.net",
    { text: "fixture only" },
    { messageId: "message-1" },
  );
  expect(worker.whatsappStatus(7, 2).status).toBe("CONNECTED");
  expect(worker.whatsappStatus(8, 2).status).toBe("DISCONNECTED");
});
it("não repete automaticamente uma entrega cujo resultado é incerto", async () => {
  m.send.mockRejectedValue(new Error("network after submission"));
  const worker = await import("../apps/api/src/services/whatsapp.service");
  await worker.runWhatsAppTick();
  m.events["connection.update"]({ connection: "open" });
  await worker.runWhatsAppTick();
  await worker.runWhatsAppTick();
  expect(m.state).toBe("UNKNOWN");
  expect(m.send).toHaveBeenCalledTimes(1);
});
it("não conecta outra instância quando o lock do serviço pertence a outro processo", async () => {
  m.gate.mockResolvedValue([[{ acquired: 0 }]]);
  const worker = await import("../apps/api/src/services/whatsapp.service");
  await worker.runWhatsAppTick();
  expect(m.socket).not.toHaveBeenCalled();
  expect(m.send).not.toHaveBeenCalled();
});

it("reconecta após restart requerido no pareamento sem ficar preso em conectando", async () => {
  const worker = await import("../apps/api/src/services/whatsapp.service");
  await worker.runWhatsAppTick();
  expect(m.socket).toHaveBeenCalledTimes(1);
  m.events["connection.update"]({ qr: "fixture-qr" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(worker.whatsappStatus(7, 2).status).toBe("QR");
  m.events["connection.update"]({
    connection: "close",
    lastDisconnect: { error: { output: { statusCode: 515 } } },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(worker.whatsappStatus(7, 2).status).toBe("RECONNECTING");
  await worker.runWhatsAppTick();
  expect(m.socket).toHaveBeenCalledTimes(2);
});

it("marca logout e remove a sessão persistida", async () => {
  const worker = await import("../apps/api/src/services/whatsapp.service");
  await worker.runWhatsAppTick();
  m.events["connection.update"]({
    connection: "close",
    lastDisconnect: { error: { output: { statusCode: 401 } } },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(worker.whatsappStatus(7, 2).status).toBe("LOGGED_OUT");
  expect(
    m.query.mock.calls.some(([sql]) =>
      String(sql).includes("DELETE FROM whatsapp_auth"),
    ),
  ).toBe(true);
});

it("não deixa um QR atrasado sobrescrever o estado conectado", async () => {
  const worker = await import("../apps/api/src/services/whatsapp.service");
  await worker.runWhatsAppTick();
  m.events["connection.update"]({ qr: "fixture-qr" });
  m.events["connection.update"]({ connection: "open" });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(worker.whatsappStatus(7, 2).status).toBe("CONNECTED");
  expect(worker.whatsappStatus(7, 2).qr).toBeNull();
});

it("valida o destinatário no WhatsApp e envia para o JID resolvido", async () => {
  m.onWhatsApp.mockResolvedValue([
    { exists: true, jid: "123456789012345@lid" },
  ]);
  const worker = await import("../apps/api/src/services/whatsapp.service");
  await worker.runWhatsAppTick();
  m.events["connection.update"]({ connection: "open" });
  await worker.runWhatsAppTick();
  expect(m.onWhatsApp).toHaveBeenCalledWith("5511999999999");
  expect(m.send).toHaveBeenCalledWith(
    "123456789012345@lid",
    { text: "fixture only" },
    { messageId: "message-1" },
  );
});

it("não envia e registra destinatário inválido quando o número não existe no WhatsApp", async () => {
  m.onWhatsApp.mockResolvedValue([]);
  const worker = await import("../apps/api/src/services/whatsapp.service");
  await worker.runWhatsAppTick();
  m.events["connection.update"]({ connection: "open" });
  await worker.runWhatsAppTick();
  expect(m.send).not.toHaveBeenCalled();
  expect(
    m.query.mock.calls.some(([sql, args]) =>
      String(sql).includes("INVALID_RECIPIENT") && args?.includes(9),
    ),
  ).toBe(true);
});
