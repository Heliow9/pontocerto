import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("admin navigation exposes the Control iD equipment page", async () => {
  const app = await readFile(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /controlid/);
  assert.match(app, /Equipamentos Control iD/);
  assert.match(app, /ControlIdPage/);
});

test("equipment page supports pairing, one-time credential and full sync", async () => {
  const page = await readFile(new URL("../apps/web/src/pages/ControlIdPage.tsx", import.meta.url), "utf8");
  assert.match(page, /vendorDeviceId/);
  assert.match(page, /serialNumber/);
  assert.match(page, /credential/);
  assert.match(page, /Sincronizar funcionários/);
  assert.match(page, /\/control-id\/admin\/terminals/);
  assert.match(page, /\/control-id\/admin\/companies/);
});
