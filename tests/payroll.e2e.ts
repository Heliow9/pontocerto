import { expect, test, type Page } from "@playwright/test";
import {
  payrollFormats,
  payrollEvents,
} from "../apps/api/src/services/payroll-export.service";

const employees = [
  {
    id: 11,
    company_id: 2,
    group_id: 4,
    group_name: "Equipe Centro",
    name: "Ana Oliveira",
    registration_number: "0011",
    work_schedule_id: 1,
  },
  {
    id: 12,
    company_id: 2,
    group_id: 4,
    group_name: "Equipe Centro",
    name: "Bruno Souza",
    registration_number: "0012",
    work_schedule_id: 1,
  },
  {
    id: 13,
    company_id: 3,
    name: "Carla Lima",
    registration_number: "0013",
    work_schedule_id: 1,
  },
];
const profile = {
  companyCode: "91",
  processCode: "11",
  hourFormat: "HHMM",
  events: { normal: "1", overtime: "2", late: "3", absence: "4" },
  employeeCodes: {},
};
async function setup(page: Page, role = "TENANT_ADMIN") {
  await page.addInitScript(() =>
    localStorage.setItem("pc_token", "payroll-ui-test"),
  );
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.host === "127.0.0.1:5173") return route.continue();
    const path = url.pathname.replace(/^\/api/, "");
    let response: unknown = [];
    if (path === "/auth/me")
      response = {
        name: "Gestora",
        role,
        tenant_name: "Ponto Certo",
        company_id: 2,
      };
    if (path === "/employees") response = employees;
    if (path === "/reports/payroll/options")
      response = {
        companies: [
          { id: 2, legal_name: "Empresa Exemplo" },
          { id: 3, legal_name: "Outra Empresa" },
        ],
        employees,
        formats: payrollFormats,
        events: payrollEvents,
      };
    if (path.startsWith("/reports/payroll/profiles/")) response = { profile };
    if (path === "/reports/payroll/generate") {
      const body = route.request().postDataJSON();
      const selected = employees.filter((e) => body.employeeIds.includes(e.id));
      response = {
        filename: "ponto-dominio.txt",
        content: "1000000000112026080002110000002500000000091\r\n",
        mimeType: "text/plain;charset=utf-8",
        generatedAt: "2026-09-09T20:00:00Z",
        companyName: "Empresa Exemplo",
        selectedCount: selected.length,
        exportedCount: selected.length,
        instructions: payrollFormats[0].instructions,
        warnings: ["Confira as rubricas com a contabilidade."],
        rows: selected.map((e) => ({
          employeeId: e.id,
          employeeName: e.name,
          employeeCode: e.registration_number,
          event: "overtime",
          label: "Horas extras",
          eventCode: "2",
          minutes: 150,
        })),
      };
    }
    await route.fulfill({ json: response });
  });
  await page.goto("/#reports");
}
test("selects multiple employees, prepares preview, downloads exact content and invalidates preview on edit", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "Exportar para ERP", exact: true })
    .click();
  await expect(
    page.getByLabel("Código da empresa no ERP", { exact: true }),
  ).toHaveValue("91");
  await expect(
    page.getByLabel("Código da empresa no ERP", { exact: true }),
  ).not.toBeVisible();
  await expect(page.getByLabel("Selecionar Carla Lima")).toHaveCount(0);
  await page.getByLabel("Início da apuração").fill("2025-08-01");
  await page.getByLabel("Fim da apuração").fill("2025-08-31");
  await page.getByLabel("Competência da folha").fill("2025-08");
  await page
    .getByRole("button", { name: "Continuar para funcionários" })
    .click();
  await page.getByRole("button", { name: "Selecionar exibidos" }).click();
  await expect(page.getByText("2 de 2 selecionados")).toBeVisible();
  await page
    .getByRole("button", { name: "Continuar para códigos da folha" })
    .click();
  const generation = page.waitForRequest((r) =>
    r.url().endsWith("/reports/payroll/generate"),
  );
  await page.getByRole("button", { name: "Preparar exportação" }).click();
  expect((await generation).postDataJSON().employeeIds).toEqual([11, 12]);
  await expect(
    page.getByText("2 de 2 funcionários com eventos · 2 eventos"),
  ).toBeVisible();
  await expect(page.getByText("02:30", { exact: true })).toHaveCount(2);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar arquivo para ERP" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("ponto-dominio.txt");
  const stream = await download.createReadStream();
  let content = "";
  for await (const chunk of stream!) content += chunk.toString();
  expect(content).toBe("1000000000112026080002110000002500000000091\r\n");
  await page.screenshot({
    path: "test-results/payroll-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "Etapas da exportação" })
    .getByRole("button", { name: /Funcionários/ })
    .click();
  await page.getByLabel("Matrícula no ERP de Ana Oliveira").fill("22");
  await expect(
    page.getByRole("button", { name: "Baixar arquivo para ERP" }),
  ).toHaveCount(0);
});
test("changing company clears selection and uses the corresponding employee list", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "Exportar para ERP", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continuar para funcionários" })
    .click();
  await page.getByLabel("Selecionar Ana Oliveira").check();
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await page.getByLabel("Empresa para exportação").selectOption("3");
  await page
    .getByRole("button", { name: "Continuar para funcionários" })
    .click();
  await expect(page.getByText("0 de 1 selecionados")).toBeVisible();
  await expect(page.getByLabel("Selecionar Carla Lima")).toBeVisible();
  await expect(page.getByLabel("Selecionar Ana Oliveira")).toHaveCount(0);
});
test("shows export failures without offering an old download", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/reports/payroll/generate", (route) =>
    route.fulfill({
      status: 422,
      json: { message: "Há solicitações de ajuste pendentes no período." },
    }),
  );
  await page
    .getByRole("button", { name: "Exportar para ERP", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continuar para funcionários" })
    .click();
  await page.getByLabel("Selecionar Ana Oliveira").check();
  await page
    .getByRole("button", { name: "Continuar para códigos da folha" })
    .click();
  await page.getByRole("button", { name: "Preparar exportação" }).click();
  await expect(
    page.getByText("Há solicitações de ajuste pendentes no período.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Baixar arquivo para ERP" }),
  ).toHaveCount(0);
});
test("keeps the employee selection usable on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page
    .getByRole("button", { name: "Exportar para ERP", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continuar para funcionários" })
    .click();
  await page.getByLabel("Selecionar Ana Oliveira").check();
  await expect(
    page.getByRole("button", { name: "Continuar para códigos da folha" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/payroll-mobile.png",
    fullPage: true,
  });
});
test("hides payroll exports from supervisors", async ({ page }) => {
  await setup(page, "SUPERVISOR");
  await expect(page.getByRole("button", { name: "Baixar PDF" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Exportar para ERP" }),
  ).toHaveCount(0);
});

test("wizard blocks invalid periods and empty selections before making an export request", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "Exportar para ERP", exact: true })
    .click();
  await page.getByLabel("Fim da apuração").fill("2099-12-01");
  await page
    .getByRole("button", { name: "Continuar para funcionários" })
    .click();
  await expect(page.getByRole("alert")).toContainText("até ontem");
  await page.getByLabel("Início da apuração").fill("2025-08-01");
  await page.getByLabel("Fim da apuração").fill("2025-08-31");
  await page
    .getByRole("button", { name: "Continuar para funcionários" })
    .click();
  await page
    .getByRole("button", { name: "Continuar para códigos da folha" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "pelo menos um funcionário",
  );
  await expect(
    page.getByRole("button", { name: "Preparar exportação" }),
  ).toHaveCount(0);
});

test("exports a complete group even when search hides one member", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "Exportar para ERP", exact: true })
    .click();
  await page.getByLabel("Início da apuração").fill("2025-08-01");
  await page.getByLabel("Fim da apuração").fill("2025-08-31");
  await page
    .getByRole("button", { name: "Continuar para funcionários" })
    .click();
  await page.getByLabel("Exportar por", { exact: true }).selectOption("group");
  await page.getByLabel("Grupo para exportação").selectOption("4");
  await expect(page.getByLabel("Selecionar Ana Oliveira")).toBeChecked();
  await expect(page.getByLabel("Selecionar Bruno Souza")).toBeDisabled();
  await page.getByLabel("Buscar funcionário").fill("Ana");
  await expect(page.getByText("2 de 2 selecionados")).toBeVisible();
  await page.screenshot({
    path: "test-results/export-group.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Continuar para códigos da folha" })
    .click();
  const generated = page.waitForRequest((r) =>
    r.url().endsWith("/reports/payroll/generate"),
  );
  await page.getByRole("button", { name: "Preparar exportação" }).click();
  expect((await generated).postDataJSON()).toMatchObject({
    groupId: 4,
    employeeIds: [11, 12],
  });
});
test("individual mode replaces the selection with one employee", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "Exportar para ERP", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continuar para funcionários" })
    .click();
  await page.getByLabel("Exportar por", { exact: true }).selectOption("single");
  await page.getByLabel("Selecionar Ana Oliveira").check();
  await page.getByLabel("Selecionar Bruno Souza").check();
  await expect(page.getByLabel("Selecionar Ana Oliveira")).not.toBeChecked();
  await expect(page.getByText("1 de 2 selecionados")).toBeVisible();
});
