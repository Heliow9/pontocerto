import { expect, it } from "vitest";
// @ts-ignore standalone deployment script
import { findPwaRoot } from "../scripts/nginx-pwa-root.mjs";
it("localiza somente o root do domínio do PWA, incluindo location /", () => {
  const config =
    "http { server { server_name painel.test; root /var/www/painel; } server { server_name hubpontocerto.duckdns.org; root /var/www/pwa; location /api { proxy_pass http://localhost:3333; } location / { try_files $uri /index.html; } } }";
  expect(findPwaRoot(config, "hubpontocerto.duckdns.org")).toBe("/var/www/pwa");
  expect(
    findPwaRoot(
      "server { server_name hub.test; location / { alias /var/www/hub/; } }",
      "hub.test",
    ),
  ).toBe("/var/www/hub/");
});
it("interrompe a publicação em configuração ambígua, proxy ou raiz inválida", () => {
  for (const config of [
    "server { server_name hub; root /; }",
    "server { server_name hub; root /one; } server { server_name hub; root /two; }",
    "server { server_name hub; location / { proxy_pass http://localhost:8080; } }",
  ])
    expect(() => findPwaRoot(config, "hub")).toThrow();
});
