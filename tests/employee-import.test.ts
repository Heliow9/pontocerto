import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  importColumns,
  normalizeImportRow,
  readEmployeeFile,
  rowIssues,
  validCpf,
} from "../apps/api/src/services/employee-import.service";
describe("employee spreadsheet parsing", () => {
  it("preserves zero-prefixed identifiers and quoted delimiters in CSV", async () => {
    const rows = await readEmployeeFile(
      Buffer.from(
        'nome;matricula;cargo;admissao\n"Ana; Silva";00012;"Auxiliar, geral";10/09/2026',
      ),
      "equipe.csv",
    );
    expect(rows[0]).toMatchObject({
      nome: "Ana; Silva",
      matricula: "00012",
      line: 2,
    });
    expect(normalizeImportRow(rows[0]).admissao).toBe("2026-09-10");
  });
  it("parses Excel values and dates without executing formulas", async () => {
    const book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet("Funcionarios");
    sheet.addRow(importColumns);
    sheet.addRow([
      "Ana Silva",
      "52998224725",
      "00012",
      "",
      new Date("2026-09-10T00:00:00Z"),
    ]);
    const rows = await readEmployeeFile(
      Buffer.from(await book.xlsx.writeBuffer()),
      "a.xlsx",
    );
    expect(rows[0].admissao).toBe("2026-09-10");
    expect(rowIssues(rows[0])).toEqual([]);
    sheet.getCell("A2").value = {
      formula: 'HYPERLINK("https://example.com", "Ana")',
      result: "Ana",
    };
    await expect(
      readEmployeeFile(Buffer.from(await book.xlsx.writeBuffer()), "a.xlsx"),
    ).rejects.toThrow("fórmulas");
  });
  it("rejects unknown headers, unsupported files and oversized batches", async () => {
    await expect(
      readEmployeeFile(Buffer.from("nome;matricula;senha\nAna;1;abc"), "a.csv"),
    ).rejects.toThrow("Cabeçalho");
    await expect(
      readEmployeeFile(Buffer.from("data"), "a.xls"),
    ).rejects.toThrow(".xlsx");
    await expect(
      readEmployeeFile(
        Buffer.from(
          "nome;matricula\n" +
            Array.from({ length: 501 }, (_, i) => `Pessoa ${i};${i}`).join(
              "\n",
            ),
        ),
        "a.csv",
      ),
    ).rejects.toThrow("500");
  });
  it("detects invalid CPF, invalid date and spreadsheet formulas", async () => {
    expect(validCpf("52998224725")).toBe(true);
    expect(validCpf("11111111111")).toBe(false);
    const [row] = await readEmployeeFile(
      Buffer.from(
        "nome;matricula;cpf;admissao\n=SUM(A1);01;12345678900;2026-02-31",
      ),
      "a.csv",
    );
    expect(rowIssues(row).join(" ")).toMatch(/CPF inválido/);
    expect(rowIssues(row).join(" ")).toMatch(/Data de admissão/);
    expect(rowIssues(row).join(" ")).toMatch(/fórmula/);
  });
});
