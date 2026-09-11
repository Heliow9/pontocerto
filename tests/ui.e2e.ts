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
      "/groups": [],
      "/notifications/settings": {
        webReady: true,
        workerEnabled: true,
        publicKey: "test-public",
        subscriptions: [],
      },
      "/notifications/upcoming": { events: [] },
      "/time-entries/my/summary": [],
      "/reports/payroll/options": {
        companies: [{ id: 1, legal_name: "Empresa de Teste" }],
        employees: [employee],
        formats: [
          {
            id: "DOMINIO",
            name: "Domínio Sistemas — TXT",
            instructions: "Confira os códigos no ERP.",
            source: null,
          },
        ],
        events: [{ key: "normal", label: "Horas normais" }],
      },
      "/reports/payroll/profiles/1/DOMINIO": { profile: null },
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
test("busca de funções navega e pode ser fechada sem aviso de alterações", async ({
  page,
}) => {
  await admin(page);
  await page.getByRole("button", { name: "Encontrar uma função" }).click();
  await page.getByLabel("Buscar uma função").fill("folha");
  await expect(
    page.getByRole("dialog").getByRole("link", { name: /^Relatórios/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Encontrar uma função" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Encontrar uma função" }).click();
  await page.getByLabel("Buscar uma função").fill("senha");
  await page
    .getByRole("dialog")
    .getByRole("link", { name: /^Alterar senha/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Alterar senha", exact: true }),
  ).toBeVisible();
});
test("busca da equipe filtra imediatamente e permite limpar", async ({
  page,
}) => {
  await admin(page, "employees");
  await expect(page.getByText("Ana Oliveira", { exact: true })).toBeVisible();
  await page.getByLabel("Buscar por nome, CPF ou matrícula").fill("ninguém");
  await expect(page.getByText("Ana Oliveira", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page.getByText("Ana Oliveira", { exact: true })).toBeVisible();
});
test("detalhes técnicos do ponto são opcionais e a ajuda acompanha a página", async ({
  page,
}) => {
  await admin(page, "points");
  await expect(
    page.getByRole("columnheader", { name: "Biometria / aparelho" }),
  ).toHaveCount(0);
  await page.getByLabel("Detalhes de segurança").check();
  await expect(
    page.getByRole("columnheader", { name: "Biometria / aparelho" }),
  ).toBeVisible();
  expect(await page.locator("td td").count()).toBe(0);
  await page.getByRole("button", { name: "Como usar esta página" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Consulte as entradas e saídas",
  );
});
test("atalho da contabilidade abre diretamente o destino correto", async ({
  page,
}) => {
  await admin(page);
  await page.getByRole("link", { name: /Enviar para a contabilidade/ }).click();
  await expect(page).toHaveURL(/#reports\?tab=payroll/);
  await expect(
    page.getByRole("button", { name: "Exportar para ERP", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
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
test("PWA mantém a sessão ao reabrir e encerra somente ao sair", async ({
  page,
  context,
}) => {
  await mock(page, "FUNCIONARIO");
  await page.goto("http://127.0.0.1:4174");
  await page.getByLabel("E-mail", { exact: true }).fill("maria@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("test-password");
  const loginRequest = page.waitForRequest("**/auth/login");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  expect((await loginRequest).postDataJSON().persistent).toBe(true);
  await expect(page.getByText("Olá, Maria", { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("pc_snapshot")))
    .not.toBeNull();
  await page.close();
  const reopened = await context.newPage();
  await mock(reopened, "FUNCIONARIO");
  await reopened.route("**/auth/me", (route) =>
    route.fulfill({ status: 503, json: { message: "Indisponível" } }),
  );
  await reopened.goto("http://127.0.0.1:4174");
  await expect(reopened.getByText("Olá, Maria", { exact: true })).toBeVisible();
  expect(await reopened.evaluate(() => localStorage.getItem("pc_token"))).toBe(
    "test-token",
  );
  await reopened.unroute("**/auth/me");
  await reopened.reload();
  await expect(reopened.getByText("Olá, Maria", { exact: true })).toBeVisible();
  await reopened.getByRole("tab", { name: "Perfil", exact: true }).click();
  const logoutRequest = reopened.waitForRequest("**/auth/logout");
  await reopened
    .getByRole("button", { name: "Sair da conta", exact: true })
    .click();
  expect((await logoutRequest).headers().authorization).toBe(
    "Bearer test-token",
  );
  await expect(
    reopened.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeVisible();
  await reopened.reload();
  await expect(
    reopened.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeVisible();
  expect(
    await reopened.evaluate(() => localStorage.getItem("pc_token")),
  ).toBeNull();
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

for (const role of ["TENANT_ADMIN", "SUPER_ADMIN"]) {
  test(`alteração de senha web: ${role}`, async ({ page }) => {
    await admin(page, "password", role);
    let calls = 0;
    await page.route("**/auth/password", (route) => {
      calls++;
      return route.fulfill({
        status: calls === 1 ? 400 : 200,
        json: {
          message:
            calls === 1
              ? "A senha atual está incorreta."
              : "Senha alterada com sucesso.",
        },
      });
    });
    await page
      .getByLabel("Senha atual", { exact: true })
      .fill("Anterior-teste-123");
    await page.getByLabel("Nova senha", { exact: true }).fill("Nova-teste-456");
    await page
      .getByLabel("Confirmar nova senha", { exact: true })
      .fill("Diferente-123");
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page.getByRole("alert")).toContainText("não corresponde");
    expect(calls).toBe(0);
    await page
      .getByLabel("Confirmar nova senha", { exact: true })
      .fill("Nova-teste-456");
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "senha atual está incorreta",
    );
    await expect(
      page.getByRole("heading", { name: "Alterar senha" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(
      page.getByText(
        "Senha alterada com sucesso. Use a nova senha no próximo acesso.",
      ),
    ).toBeVisible();
    await expect(page.getByLabel("Senha atual", { exact: true })).toHaveValue(
      "",
    );
  });
}
test("alteração de senha na PWA pelo perfil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, "FUNCIONARIO");
  await page.goto("http://127.0.0.1:4174");
  await page.getByLabel("E-mail", { exact: true }).fill("maria@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("tab", { name: "Perfil", exact: true }).click();
  await page
    .getByRole("button", { name: "Alterar senha", exact: true })
    .click();
  await page
    .getByLabel("Senha atual", { exact: true })
    .fill("Anterior-teste-123");
  await page.getByLabel("Nova senha", { exact: true }).fill("Nova-teste-456");
  await page
    .getByLabel("Confirmar nova senha", { exact: true })
    .fill("Diferente-123");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByRole("alert")).toContainText("não corresponde");
  await page
    .getByLabel("Confirmar nova senha", { exact: true })
    .fill("Nova-teste-456");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(
    page.getByText(
      "Senha alterada com sucesso. Use a nova senha no próximo acesso.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Alterar senha", exact: true })
    .click();
  await expect(page.getByLabel("Senha atual", { exact: true })).toHaveValue("");
});

test("gerencia grupo, vincula integrantes e filtra funcionários", async ({
  page,
}) => {
  await admin(page, "employees");
  let saved = false;
  await page.route("**/groups", async (route) => {
    if (route.request().method() === "POST")
      return route.fulfill({ json: { id: 4 } });
    return route.fulfill({
      json: saved
        ? [{ id: 4, company_id: 1, name: "Equipe Centro", employee_count: 1 }]
        : [],
    });
  });
  await page.route("**/groups/4/members", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ employeeIds: [1] });
    saved = true;
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/employees?*", (route) =>
    route.fulfill({
      json: [
        {
          ...employee,
          ...(saved ? { group_id: 4, group_name: "Equipe Centro" } : {}),
        },
      ],
    }),
  );
  await page.getByRole("button", { name: "Gerenciar grupos" }).click();
  await page.getByLabel("Nome do grupo").fill("Equipe Centro");
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.screenshot({
    path: "test-results/employee-groups.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Salvar grupo e integrantes" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Grupo salvo" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fechar", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Grupo", { exact: true }).selectOption("4");
  await expect(page.getByText("Ana Oliveira", { exact: true })).toBeVisible();
});
test("PWA mostra próximo registro, ajuda e calendário com apuração", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, "FUNCIONARIO");
  await page.route("**/time-entries/my/summary?*", (route) =>
    route.fulfill({
      json: [
        {
          work_date: date,
          expected_minutes: 480,
          worked_minutes: 510,
          time_bank_minutes: 30,
          processed_at: `${date} 18:00:00`,
        },
      ],
    }),
  );
  await page.goto("http://127.0.0.1:4174");
  await page.getByLabel("E-mail", { exact: true }).fill("maria@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByText("Próximo registro: Saída", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preciso de ajuda para registrar" })
    .click();
  await expect(
    page.getByText("Vamos resolver seu registro", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar ajuda" }).click();
  await page.getByRole("tab", { name: "Histórico" }).click();
  await page
    .getByRole("button", { name: "9/09/2026, 1 marcações", exact: true })
    .click();
  await expect(
    page.getByText("Saldo do dia: 0h 30min", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/pwa-calendar.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Solicitar marcação ausente" })
    .click();
  await expect(page.getByLabel("Data e horário solicitados")).toHaveValue(
    `${date}T08:00`,
  );
});

test("PWA concilia tentativa pendente e mostra confirmação do servidor", async ({
  page,
}) => {
  await mock(page, "FUNCIONARIO");
  await page.addInitScript(() => {
    localStorage.setItem("pc_token", "test-token");
    localStorage.setItem("pc_pending_1", "pending-test");
  });
  await page.route("**/time-entries/my/requests/pending-test", (route) =>
    route.fulfill({
      json: {
        ...entry,
        entry_type: "CLOCK_OUT",
        registered_at: `${date} 17:04:00`,
      },
    }),
  );
  await page.goto("http://127.0.0.1:4174");
  await page
    .getByRole("button", { name: "Consultar confirmação pendente" })
    .click();
  await expect(
    page.getByText("Saída confirmada às 17:04", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Consultar confirmação pendente" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("pc_pending_1")),
  ).toBeNull();
});

test("importação exige prévia válida e confirma a planilha escolhida", async ({
  page,
}) => {
  await admin(page, "employees");
  let imported = 0;
  await page.route("**/employees/import/preview", (route) =>
    route.fulfill({
      json: {
        rows: [{ line: 2, nome: "Bruno Souza", matricula: "002" }],
        preview: [
          {
            line: 2,
            nome: "Bruno Souza",
            matricula: "002",
            grupo: "Equipe Centro",
            jornada: "Comercial",
            local: "Sede",
            errors: [],
            warnings: [],
          },
        ],
        canImport: true,
        confirmation: "signed-preview",
      },
    }),
  );
  await page.route("**/employees/import/confirm", (route) => {
    imported++;
    expect(route.request().postDataJSON().confirmation).toBe("signed-preview");
    return route.fulfill({ json: { imported: 1 } });
  });
  await page
    .getByRole("button", { name: "Importar planilha", exact: true })
    .click();
  await page.getByLabel("Arquivo Excel ou CSV").setInputFiles({
    name: "equipe.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("nome;matricula\nBruno Souza;002"),
  });
  await expect(
    page.getByRole("button", { name: "Importar 1 funcionário" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Conferir planilha" }).click();
  await expect(
    page.getByText("Pronto para importar", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/import-preview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Importar 1 funcionário" }).click();
  await expect(
    page.getByText("1 funcionário importado com sucesso.", { exact: true }),
  ).toBeVisible();
  expect(imported).toBe(1);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fechar", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("erros da planilha impedem importar e mostram a linha", async ({
  page,
}) => {
  await admin(page, "employees");
  await page.route("**/employees/import/preview", (route) =>
    route.fulfill({
      json: {
        rows: [],
        preview: [
          {
            line: 2,
            nome: "Ana Silva",
            matricula: "001",
            errors: ["Matrícula já cadastrada."],
            warnings: [],
          },
        ],
        canImport: false,
        confirmation: null,
      },
    }),
  );
  await page
    .getByRole("button", { name: "Importar planilha", exact: true })
    .click();
  await page.getByLabel("Arquivo Excel ou CSV").setInputFiles({
    name: "equipe.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("nome;matricula\nAna Silva;001"),
  });
  await page.getByRole("button", { name: "Conferir planilha" }).click();
  await expect(
    page.getByText("Matrícula já cadastrada.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Importar 1 funcionário" }),
  ).toBeDisabled();
});
test("PWA permite ativar e desativar lembretes no aparelho", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, "FUNCIONARIO");
  await page.addInitScript(() => {
    localStorage.setItem("pc_token", "test-token");
    localStorage.setItem("pc_push_device", "push-test-device-1");
    let permission: NotificationPermission = "default",
      subscription: any = null;
    Object.defineProperty(Notification, "permission", {
      get: () => permission,
    });
    Notification.requestPermission = async () => {
      permission = "granted";
      return permission;
    };
    const fake = {
      pushManager: {
        getSubscription: async () => subscription,
        subscribe: async () => {
          subscription = {
            toJSON: () => ({
              endpoint: "https://fcm.googleapis.com/test",
              keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) },
            }),
            unsubscribe: async () => {
              subscription = null;
              return true;
            },
          };
          return subscription;
        },
      },
      addEventListener: () => {},
    };
    navigator.serviceWorker.register = async () => fake as any;
    navigator.serviceWorker.getRegistration = async () => fake as any;
    Object.defineProperty(navigator.serviceWorker, "ready", {
      value: Promise.resolve(fake),
    });
  });
  let enabled = false;
  await page.route("**/notifications/settings", (route) =>
    route.fulfill({
      json: {
        publicKey: "dGVzdA",
        webReady: true,
        workerEnabled: true,
        subscriptions: enabled
          ? [{ device_key: "push-test-device-1", enabled: 1 }]
          : [],
      },
    }),
  );
  await page.route("**/notifications/subscription", (route) => {
    expect(route.request().postDataJSON().kind).toBe("WEB");
    enabled = true;
    return route.fulfill({ json: { enabled: true } });
  });
  await page.route(
    "**/notifications/subscription/push-test-device-1",
    (route) => {
      enabled = false;
      return route.fulfill({ json: { enabled: false } });
    },
  );
  await page.route("**/notifications/upcoming", (route) =>
    route.fulfill({
      json: {
        events: [
          {
            key: "entrada",
            label: "entrada",
            time: "07:00",
            remindAt: Date.parse("2026-09-11T09:55:00Z"),
          },
        ],
      },
    }),
  );
  await page.goto("http://127.0.0.1:4174");
  await page.getByRole("tab", { name: "Perfil" }).click();
  await page
    .getByRole("button", { name: "Ativar lembretes", exact: true })
    .click();
  await expect(
    page.getByText("Ativados neste aparelho", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/aviso de entrada às 07:00/)).toBeVisible();
  await page
    .getByText("Lembretes de ponto", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/pwa-reminders.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Desativar lembretes", exact: true })
    .click();
  await expect(
    page.getByText("Desativados neste aparelho", { exact: true }),
  ).toBeVisible();
  expect(enabled).toBe(false);
});
