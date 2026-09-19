import { test, expect } from "@playwright/test";

test("offers available email suggestions and refreshes alternatives after a save conflict", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("pc_token", "email-test"),
  );
  let saved: any;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.port === "5173") return route.continue();
    const path = url.pathname.replace(/^\/api/, "");
    if (path === "/employees/email-suggestions")
      return route.fulfill({
        json: {
          suggestions: [
            "joao.silva@arvore.com.br",
            "joao.silva2@arvore.com.br",
            "joao.silva3@arvore.com.br",
          ],
        },
      });
    if (path === "/employees" && route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      return route.fulfill({
        status: 409,
        json: {
          message: "E-mail já cadastrado.",
          suggestions: ["joao.silva4@arvore.com.br"],
        },
      });
    }
    const data: Record<string, unknown> = {
      "/auth/me": {
        name: "Admin",
        role: "TENANT_ADMIN",
        tenant_name: "Árvore",
      },
      "/companies": [{ id: 2, legal_name: "Árvore Serviços Ltda", active: 1 }],
    };
    return route.fulfill({ json: data[path] || [] });
  });
  await page.goto("/#employees");
  await page
    .getByRole("button", { name: "+ Novo funcionário", exact: true })
    .click();
  await page.getByLabel("Nome completo", { exact: true }).fill("João da Silva");
  await page
    .locator("summary")
    .filter({ hasText: "Acesso ao aplicativo" })
    .click();
  await page
    .getByRole("button", { name: "Usar joao.silva@arvore.com.br", exact: true })
    .click();
  await expect(
    page.getByLabel("E-mail de acesso", { exact: true }),
  ).toHaveValue("joao.silva@arvore.com.br");
  await page.getByLabel("Senha inicial").fill("123456");
  await page
    .getByRole("button", { name: "Salvar funcionário", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Usar joao.silva4@arvore.com.br",
      exact: true,
    }),
  ).toBeVisible();
  expect(saved.accessEmail).toBe("joao.silva@arvore.com.br");
});
