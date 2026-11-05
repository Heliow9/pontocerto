import test from "node:test";
import assert from "node:assert/strict";
import {
  createControlIdTerminal,
  resolveControlIdTerminal,
  type ControlIdTerminalStore,
} from "../src/services/control-id.service.js";

function memoryStore(): ControlIdTerminalStore & { terminals: any[] } {
  const terminals: any[] = [];
  return {
    terminals,
    async findCompany(tenantId, companyId) {
      return tenantId === 7 && companyId === 2
        ? { id: 2, active: true, name: "Empresa A" }
        : null;
    },
    async findActiveByCompany(tenantId, companyId) {
      return terminals.find(
        (row) => row.tenantId === tenantId && row.companyId === companyId && row.active,
      ) ?? null;
    },
    async insertTerminal(input) {
      const row = { id: terminals.length + 1, active: true, ...input };
      terminals.push(row);
      return row;
    },
    async findByCredentialHash(hash) {
      return terminals.find((row) => row.credentialHash === hash) ?? null;
    },
    async touchTerminal(id, channel) {
      const row = terminals.find((item) => item.id === id);
      if (row) row.lastChannel = channel;
    },
  };
}

test("creates one terminal inside the authenticated tenant and returns its secret once", async () => {
  const store = memoryStore();
  const created = await createControlIdTerminal({
    store,
    tenantId: 7,
    actorUserId: 9,
    companyId: 2,
    name: "Recepção",
    serialNumber: "0M0600/0110EB",
    vendorDeviceId: "478435",
    pepper: "server-pepper",
    createSecret: () => "ab".repeat(32),
  });
  assert.equal(created.credential, "ab".repeat(32));
  assert.deepEqual(created.terminal, {
    id: 1,
    companyId: 2,
    companyName: "Empresa A",
    name: "Recepção",
    serialNumber: "0M06000110EB",
    vendorDeviceId: "478435",
    status: "PENDING",
  });
  assert.notEqual(store.terminals[0].credentialHash, created.credential);

  await assert.rejects(
    () =>
      createControlIdTerminal({
        store,
        tenantId: 7,
        actorUserId: 9,
        companyId: 2,
        name: "Outro",
        serialNumber: "0M06000110EC",
        vendorDeviceId: "478436",
        pepper: "server-pepper",
      }),
    /já possui/i,
  );
});

test("rejects a company from another tenant before creating a terminal", async () => {
  const store = memoryStore();
  await assert.rejects(
    () =>
      createControlIdTerminal({
        store,
        tenantId: 8,
        actorUserId: 9,
        companyId: 2,
        name: "Recepção",
        serialNumber: "0M06000110EB",
        vendorDeviceId: "478435",
        pepper: "server-pepper",
      }),
    /Empresa não encontrada/i,
  );
  assert.equal(store.terminals.length, 0);
});

test("authenticates the terminal only when credential and device id match", async () => {
  const store = memoryStore();
  await createControlIdTerminal({
    store,
    tenantId: 7,
    actorUserId: 9,
    companyId: 2,
    name: "Recepção",
    serialNumber: "0M06000110EB",
    vendorDeviceId: "478435",
    pepper: "server-pepper",
    createSecret: () => "cd".repeat(32),
  });
  const terminal = await resolveControlIdTerminal({
    store,
    authorization: `Bearer ${"cd".repeat(32)}`,
    vendorDeviceId: "478435",
    pepper: "server-pepper",
    channel: "PUSH",
  });
  assert.equal(terminal.companyId, 2);
  assert.equal(store.terminals[0].lastChannel, "PUSH");
  await assert.rejects(
    () =>
      resolveControlIdTerminal({
        store,
        authorization: `Bearer ${"cd".repeat(32)}`,
        vendorDeviceId: "999999",
        pepper: "server-pepper",
        channel: "MONITOR",
      }),
    /equipamento configurado/i,
  );
});

test("authenticates a terminal with the secret supplied by the device URL", async () => {
  const store = memoryStore();
  const credential = "ef".repeat(32);
  await createControlIdTerminal({
    store,
    tenantId: 7,
    actorUserId: 9,
    companyId: 2,
    name: "Recepção",
    serialNumber: "0M06000110EB",
    vendorDeviceId: "4409419584573675",
    pepper: "server-pepper",
    createSecret: () => credential,
  });

  const terminal = await resolveControlIdTerminal({
    store,
    credential,
    vendorDeviceId: "4409419584573675",
    pepper: "server-pepper",
    channel: "PUSH",
  });

  assert.equal(terminal.companyId, 2);
  assert.equal(store.terminals[0].lastChannel, "PUSH");

  await assert.rejects(
    () =>
      resolveControlIdTerminal({
        store,
        credential,
        vendorDeviceId: "999999",
        pepper: "server-pepper",
        channel: "MONITOR",
      }),
    /equipamento configurado/i,
  );
});

test("rejects a malformed secret supplied by the device URL", async () => {
  const store = memoryStore();
  await assert.rejects(
    () =>
      resolveControlIdTerminal({
        store,
        credential: "not-a-secret",
        vendorDeviceId: "4409419584573675",
        pepper: "server-pepper",
        channel: "PUSH",
      }),
    /credencial/i,
  );
});
