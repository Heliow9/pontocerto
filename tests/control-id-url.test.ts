import { describe, expect, it } from "vitest";
import { buildControlIdDeviceUrls } from "../apps/web/src/control-id-url.js";

describe("Control iD device URLs", () => {
  it("builds the iDFace Push and Monitor configuration from the one-time secret", () => {
    const credential = "ab".repeat(32);
    const urls = buildControlIdDeviceUrls(
      "https://pontoocerto.duckdns.org/api/",
      credential,
      "https://pontoocerto.duckdns.org",
    );

    expect(urls).toEqual({
      pushServer: `https://pontoocerto.duckdns.org/api/control-id/device/${credential}`,
      pushEndpoint: `https://pontoocerto.duckdns.org/api/control-id/device/${credential}/push`,
      resultEndpoint: `https://pontoocerto.duckdns.org/api/control-id/device/${credential}/result`,
      monitorHost: "pontoocerto.duckdns.org",
      monitorPort: "443",
      monitorPath: `api/control-id/device/${credential}/monitor`,
    });
  });

  it("rejects malformed secrets before displaying a device URL", () => {
    expect(() => buildControlIdDeviceUrls("/api", "short", "https://example.test"))
      .toThrow(/credencial/i);
  });
});
