import { test, expect } from "@playwright/test";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/YQAAAAASUVORK5CYII=",
  "base64",
);
test("employee photo can be uploaded, replaced and removed from the mobile admin", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("pc_token", "test-face"));
  let enrolled = false,
    uploads = 0;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.port === "5173") return route.continue();
    const path = url.pathname.replace(/^\/api/, "");
    if (path === "/face/employee/11/status")
      return route.fulfill({ json: { enrolled } });
    if (path === "/face/employee/11/photo") {
      if (route.request().method() === "POST") {
        enrolled = true;
        uploads++;
        return route.fulfill({ json: { ok: true } });
      }
      if (route.request().method() === "DELETE") {
        enrolled = false;
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ body: png, contentType: "image/png" });
    }
    const data: Record<string, unknown> = {
      "/auth/me": { name: "RH", role: "TENANT_ADMIN", tenant_name: "Empresa" },
      "/companies": [{ id: 2, legal_name: "Empresa", active: 1 }],
      "/employees": [
        {
          id: 11,
          company_id: 2,
          company_name: "Empresa",
          name: "Ana Silva",
          active: 1,
        },
      ],
      "/automation/limits/employee/11": {
        minutes: null,
        inheritedMinutes: null,
      },
    };
    return route.fulfill({ json: data[path] || [] });
  });
  await page.goto("/#employees");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page
    .locator("summary")
    .filter({ hasText: "Foto para validação facial" })
    .click();
  await expect(
    page.getByText("Sem foto cadastrada", { exact: true }),
  ).toBeVisible();
  const camera = page.getByLabel("Capturar foto do funcionário");
  await expect(camera).toHaveAttribute("capture", "user");
  await camera.setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByRole("button", { name: "Salvar foto", exact: true }).click();
  await expect(
    page.getByText("Validação facial ativa", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Selecionar foto do funcionário")
    .setInputFiles({ name: "new.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Salvar foto", exact: true }).click();
  await expect(
    page.getByText("Validação facial ativa", { exact: true }),
  ).toBeVisible();
  expect(uploads).toBe(2);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remover foto", exact: true }).click();
  await expect(
    page.getByText("Sem foto cadastrada", { exact: true }),
  ).toBeVisible();
  expect(enrolled).toBe(false);
});
