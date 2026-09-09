import { test, expect, Page } from "@playwright/test";
const user = {
  name: "Maria Silva",
  email: "maria@example.test",
  role: "TENANT_ADMIN",
  tenant_name: "Empresa de Teste",
  employee_id: 1,
  company_name: "Empresa de Teste",
};
const employee = {
  id: 1,
  name: "Ana Oliveira",
  company_id: 1,
  company_name: "Empresa de Teste",
  schedule_name: "Comercial",
  work_schedule_id: 1,
  location_names: "Sede",
  device_count: 1,
  active: 1,
  registration_number: "001",
  access_email: "ana@example.test",
};
const date = "2026-09-09";
const entry = {
  id: 1,
  employee_name: "Ana Oliveira",
  entry_type: "CLOCK_IN",
  registered_at: `${date} 08:00:00`,
  source: "MOBILE",
  has_selfie: 1,
};
async function mock(page: Page, role = "TENANT_ADMIN") {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["127.0.0.1:5173", "127.0.0.1:4174"].includes(url.host))
      return route.continue();
    const p = url.pathname.replace(/^\/api/, "");
    const responses: Record<string, unknown> = {
      "/auth/me": { ...user, role },
      "/auth/login": {
        token: "test-token",
        user: { ...user, role, employeeId: 1 },
      },
      "/employees": [employee],
      "/companies": [{ id: 1, legal_name: "Empresa de Teste", active: 1 }],
      "/schedules": [{ id: 1, company_id: 1, name: "Comercial", active: 1 }],
      "/locations": [{ id: 1, company_id: 1, name: "Sede", active: 1 }],
      "/locations/employee/1": [{ id: 1 }],
      "/dashboard": {
        employees: 1,
        workingNow: 1,
        lateToday: 0,
        pendingAdjustments: 0,
        entriesToday: 1,
        recentEntries: [entry],
      },
      "/time-entries": [entry],
      "/time-entries/my/today": [entry],
      "/time-entries/my/history": [entry],
      "/time-entries/my/context": {
        decision: "ALLOWED",
        nextType: "CLOCK_OUT",
        complete: false,
        scheduleText: "08:00 às 13:00",
      },
      "/devices/my/status": {
        policy: {
          requireRegisteredDevice: false,
          requireDeviceBiometric: false,
          punchRadiusMeters: 200,
          maxGpsAccuracyMeters: 100,
        },
        currentDevice: null,
      },
      "/adjustments": [],
      "/absences": [],
      "/settings": { name: "Empresa de Teste", timezone: "America/Sao_Paulo" },
      "/holidays": [],
    };
    if (p.startsWith("/reports/monthly-data"))
      return route.fulfill({
        json: {
          employee: { name: "Ana Oliveira", company_name: "Empresa de Teste" },
          days: [
            { work_date: date, expected_minutes: 480, normal_minutes: 480 },
          ],
        },
      });
    return route.fulfill({ json: responses[p] ?? { ok: true } });
  });
}
async function admin(page: Page, hash = "dashboard", role = "TENANT_ADMIN") {
  await mock(page, role);
  await page.addInitScript(() =>
    localStorage.setItem("pc_token", "test-token"),
  );
  await page.goto(`/#${hash}`);
}
test("menu móvel não ocupa a tela e tabelas viram cartões", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await admin(page, "employees");
  await expect(
    page.getByRole("heading", { name: "Funcionários", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Ana Oliveira", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("link", { name: "Relatórios", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Relatórios", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/web-mobile.png",
    fullPage: true,
  });
});
test("falha ao ler locais impede salvar o funcionário", async ({ page }) => {
  await admin(page, "employees");
  await page.route("**/locations/employee/1", (route) =>
    route.fulfill({ status: 503, json: { message: "Indisponível" } }),
  );
  await page
    .getByRole("button", { name: "Editar", exact: true })
    .first()
    .click();
  await expect(page.getByRole("alert")).toContainText("Nenhum vínculo", {
    ignoreCase: true,
  });
  await expect(
    page.getByRole("button", { name: "Salvar funcionário" }),
  ).toHaveCount(0);
});
test("modal protege alterações e mantém navegação por teclado", async ({
  page,
}) => {
  await admin(page, "employees");
  await page
    .getByRole("button", { name: "Editar", exact: true })
    .first()
    .click();
  await page.getByLabel("Nome completo").fill("Ana atualizada");
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("Descartar alterações?", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuar editando" }).click();
  await expect(page.getByLabel("Nome completo")).toHaveValue("Ana atualizada");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page.getByText("Descartar alterações?", { exact: true }),
  ).toBeVisible();
});
test("mudança de período remove relatório antigo", async ({ page }) => {
  await admin(page, "reports");
  await page.getByRole("button", { name: "Visualizar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ana Oliveira" }),
  ).toBeVisible();
  await page.getByLabel("Início", { exact: true }).fill("2026-01-01");
  await expect(page.getByRole("heading", { name: "Ana Oliveira" })).toHaveCount(
    0,
  );
});
test("supervisor não recebe ações de alteração", async ({ page }) => {
  await admin(page, "employees", "SUPERVISOR");
  await expect(page.getByText("Ana Oliveira", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Novo funcionário" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Editar", exact: true }),
  ).toHaveCount(0);
});
test("erro de sessão preserva token e oferece recuperação", async ({
  page,
}) => {
  await mock(page);
  await page.route("**/auth/me", (route) =>
    route.fulfill({ status: 503, json: { message: "Indisponível" } }),
  );
  await page.addInitScript(() =>
    localStorage.setItem("pc_token", "test-token"),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Tentar novamente" }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("pc_token"))).toBe(
    "test-token",
  );
});
test("dashboard desktop e estados de erro", async ({ page }) => {
  await admin(page);
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/web-desktop.png",
    fullPage: true,
  });
  await page.route("**/dashboard", (route) =>
    route.fulfill({
      status: 503,
      json: { message: "Serviço temporariamente indisponível" },
    }),
  );
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("indisponível");
  await expect(page.getByText("Ana Oliveira", { exact: true })).toBeVisible();
});
test("PWA login, histórico, feedback e falha de consulta", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, "FUNCIONARIO");
  await page.goto("http://127.0.0.1:4174");
  await page
    .getByRole("button", { name: "Preciso recuperar meu acesso" })
    .click();
  await expect(
    page.getByText("Recuperar acesso", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Entendi" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill("maria@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Olá, Maria", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "REGISTRAR SAÍDA", exact: true }),
  ).toBeEnabled();
  await page.getByRole("tab", { name: "Histórico" }).click();
  await expect(page.getByText("1 marcações")).toBeVisible();
  await page.getByRole("tab", { name: "Ponto", exact: true }).click();
  await page.route("**/time-entries/my/context", (route) =>
    route.fulfill({ status: 503, json: { message: "Indisponível" } }),
  );
  await page.getByRole("button", { name: "Atualizar dados" }).click();
  await expect(
    page.getByRole("button", { name: "Atualize para registrar" }),
  ).toBeDisabled();
  await expect(page.getByText("08:00", { exact: true }).first()).toBeVisible();
  await page.screenshot({
    path: "test-results/pwa-mobile.png",
    fullPage: true,
  });
});

test("formulário bloqueia um segundo envio", async ({ page }) => {
  await admin(page, "employees");
  let saves = 0;
  await page.route("**/employees/1", async (route) => {
    saves++;
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ json: { ok: true } });
  });
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Nome completo").fill("Ana editada");
  await page.getByRole("button", { name: "Salvar funcionário" }).click();
  await expect(
    page.getByRole("button", { name: "Salvar funcionário" }),
  ).toBeDisabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(saves).toBe(1);
});
test("PWA abre offline com dados identificados e registro bloqueado", async ({
  page,
  context,
}) => {
  await mock(page, "FUNCIONARIO");
  await page.goto("http://127.0.0.1:4174");
  await page.getByLabel("E-mail", { exact: true }).fill("maria@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "REGISTRAR SAÍDA", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const result: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const req of await cache.keys())
        result.push(new URL(req.url).pathname);
    }
    return result;
  });
  expect(
    cached.some(
      (path) => path.includes("auth") || path.includes("time-entries"),
    ),
  ).toBe(false);
  await context.setOffline(true);
  await page.unroute("**/*");
  await page.reload();
  await expect(page.getByText("Olá, Maria", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Atualize para registrar" }),
  ).toBeDisabled();
});
