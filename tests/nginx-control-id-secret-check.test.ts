import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const checker = resolve("scripts/nginx-control-id-secret-check.mjs");

function check(configuration: string) {
  return spawnSync(process.execPath, [checker], {
    input: configuration,
    encoding: "utf8",
  });
}

describe("Control iD Nginx secret logging guard", () => {
  it("accepts a dedicated API location with access logging disabled", () => {
    const result = check(`
      server {
        location ^~ /api/control-id/device/ {
          access_log off;
          proxy_pass http://127.0.0.1:3340/control-id/device/;
        }
      }
    `);
    expect(result.status).toBe(0);
  });

  it("rejects deployments that would log secret device URLs", () => {
    const result = check(`
      server {
        location /api/ { proxy_pass http://127.0.0.1:3340/; }
      }
    `);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/access_log off/i);
  });
});
