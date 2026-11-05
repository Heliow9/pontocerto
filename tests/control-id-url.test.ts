import test from "node:test";
import assert from "node:assert/strict";
import { buildControlIdDeviceUrls } from "../apps/web/src/control-id-url.js";

test("builds the iDFace Push and Monitor configuration from the one-time secret", () => {
  const credential = "ab".repeat(32);
  const urls = buildControlIdDeviceUrls(
    "https://pontoocerto.duckdns.org/api/",
    credential,
    "https://pontoocerto.duckdns.org",
  );

  assert.deepEqual(urls, {
    pushServer: `https://pontoocerto.duckdns.org/api/control-id/device/${credential}`,
    pushEndpoint: `https://pontoocerto.duckdns.org/api/control-id/device/${credential}/push`,
    resultEndpoint: `https://pontoocerto.duckdns.org/api/control-id/device/${credential}/result`,
    monitorHost: "pontoocerto.duckdns.org",
    monitorPort: "443",
    monitorPath: `api/control-id/device/${credential}/monitor`,
  });
});

test("rejects malformed secrets before displaying a device URL", () => {
  assert.throws(
    () => buildControlIdDeviceUrls("/api", "short", "https://example.test"),
    /credencial/i,
  );
});
