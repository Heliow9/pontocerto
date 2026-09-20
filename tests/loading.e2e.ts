import { test, expect, type Page } from "@playwright/test";

const employee = {
  id: 1,
  name: "Ana Oliveira",
  company_id: 1,
  company_name: "Empresa de Teste",
  schedule_name: "Comercial",
  active: 1,
};
async function setup(
  page: Page,
  options: { slow?: string; fail?: string } = {},
) {
  const counts: Record<string, number> = {};
  await page.addInitScript(() =>
    localStorage.setItem("pc_token", "loading-test"),
  );
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.port === "5173") return route.continue();
    const p = url.pathname.replace(/^\/api/, "");
    counts[p] = (counts[p] || 0) + 1;
    if (options.slow === p)
      await new Promise((resolve) => setTimeout(resolve, 1200));
    if (options.fail === p)
      return route.fulfill({
        status: 503,
        json: { message: "Serviço temporariamente indisponível" },
      });
    const data: Record<string, unknown> = {
      "/auth/me": {
        name: "Maria Silva",
        tenant_name: "Empresa de Teste",
        role: "TENANT_ADMIN",
      },
      "/dashboard": {
        employees: 1,
        workingNow: 1,
        lateToday: 0,
        pendingAdjustments: 0,
        entriesToday: 0,
        recentEntries: [],
      },
      "/employees": [employee],
      "/companies": [{ id: 1, legal_name: "Empresa de Teste", active: 1 }],
      "/schedules": [],
      "/locations": [],
      "/groups": [],
      "/time-entries": [
        {
          id: 1,
          employee_name: "Ana Oliveira",
          entry_type: "CLOCK_IN",
          registered_at: "2026-09-13 08:00:00",
          source: "MOBILE",
        },
      ],
    };
    return route.fulfill({ json: data[p] || [] });
  });
  return counts;
}

test("primeiro carregamento mostra estrutura sem anunciar tabela vazia", async ({
  page,
}) => {
  const counts = await setup(page, { slow: "/employees" });
  await page.goto("/#employees");
  await expect(
    page.getByRole("heading", { name: "Funcionários", exact: true }),
  ).toBeVisible();
  await expect.poll(() => counts["/employees"]).toBe(1);
  await expect(page.getByTestId("page-skeleton")).toBeVisible();
  await expect(
    page.getByText(/Nenhum funcionário|Nenhum resultado/),
  ).toHaveCount(0);
  await page.screenshot({ path: "test-results/loading-desktop.png" });
  await expect(page.getByText("Ana Oliveira", { exact: true })).toBeVisible();
  await expect(page.getByTestId("page-skeleton")).toHaveCount(0);
});

test("navegação faz uma consulta por recurso e mantém o menu acessível", async ({
  page,
}) => {
  const counts = await setup(page, { slow: "/employees" });
  await page.goto("/#dashboard");
  await expect(
    page.getByRole("heading", { name: /Um bom dia começa/ }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Funcionários", exact: true })
    .click();
  await expect(page.getByText("Ana Oliveira", { exact: true })).toBeVisible();
  expect(counts["/employees"]).toBe(1);
  expect(counts["/companies"]).toBe(1);
  await expect(
    page.getByRole("navigation", { name: "Navegação principal" }),
  ).toBeVisible();
});

test("falha inicial oferece recuperação sem afirmar que não existem registros", async ({
  page,
}) => {
  const options = { fail: "/employees" };
  await setup(page, options);
  await page.goto("/#employees");
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível carregar",
  );
  await expect(
    page.getByText(/Nenhum funcionário|Nenhum resultado/),
  ).toHaveCount(0);
  options.fail = "";
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByText("Ana Oliveira", { exact: true })).toBeVisible();
});

test("carregamento em celular respeita a largura e movimento reduzido", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setup(page, { slow: "/employees" });
  await page.goto("/#employees");
  await expect(page.getByTestId("page-skeleton")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/loading-mobile.png" });
});

test("atualizar preserva os dados e não desloca o cabeçalho", async ({
  page,
}) => {
  const options = { slow: "" };
  await setup(page, options);
  await page.goto("/#dashboard");
  await expect(
    page.getByRole("heading", { name: /Um bom dia começa/ }),
  ).toBeVisible();
  const heading = page.getByRole("heading", {
    name: "Visão geral",
    exact: true,
  });
  const before = await heading.boundingBox();
  options.slow = "/dashboard";
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await expect(
    page.getByText("Atualizando dados…", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Um bom dia começa/ }),
  ).toBeVisible();
  await expect(page.getByTestId("page-skeleton")).toHaveCount(0);
  const after = await heading.boundingBox();
  expect(after?.y).toBe(before?.y);
  await expect(
    page.getByText("Atualizando dados…", { exact: true }),
  ).toHaveCount(0);
});
