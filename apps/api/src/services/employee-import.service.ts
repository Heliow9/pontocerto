import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { fromBuffer } from "yauzl";

export const importColumns = [
  "nome",
  "cpf",
  "matricula",
  "pis",
  "admissao",
  "ctps",
  "cargo",
  "setor",
  "grupo",
  "jornada",
  "local",
] as const;
export type ImportRow = Record<(typeof importColumns)[number], string> & {
  line: number;
};
export class ImportError extends Error {}
export const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

async function checkZip(buffer: Buffer) {
  await new Promise<void>((resolve, reject) => {
    fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (err, zip) => {
        if (err || !zip)
          return reject(new ImportError("Arquivo Excel inválido."));
        let total = 0,
          count = 0;
        zip.on("error", reject);
        zip.on("entry", (entry) => {
          total += entry.uncompressedSize;
          count++;
          if (
            total > 20 * 1024 * 1024 ||
            count > 300 ||
            entry.generalPurposeBitFlag & 1
          ) {
            zip.close();
            reject(
              new ImportError(
                "Planilha muito grande ou protegida. Use o modelo com até 500 funcionários.",
              ),
            );
          } else zip.readEntry();
        });
        zip.on("end", resolve);
        zip.readEntry();
      },
    );
  });
}

export async function readEmployeeFile(
  buffer: Buffer,
  filename: string,
): Promise<ImportRow[]> {
  let records: string[][];
  if (/\.xlsx$/i.test(filename)) {
    await checkZip(buffer);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer as any);
    const sheet = book.getWorksheet("Funcionarios") || book.worksheets[0];
    if (!sheet || sheet.rowCount > 501 || sheet.columnCount > 30)
      throw new ImportError("Use até 500 linhas e o cabeçalho do modelo.");
    records = [];
    for (let r = 1; r <= sheet.rowCount; r++) {
      const row: string[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) {
        const cell = sheet.getCell(r, c),
          value = cell.value;
        if (value instanceof Date) row.push(value.toISOString().slice(0, 10));
        else if (value !== null && typeof value === "object")
          throw new ImportError(
            `Linha ${r}: remova fórmulas, links e objetos. Use somente valores.`,
          );
        else if (typeof value === "number" && /^0+$/.test(cell.numFmt))
          row.push(String(value).padStart(cell.numFmt.length, "0"));
        else row.push(String(value ?? "").trim());
      }
      records.push(row);
    }
  } else if (/\.csv$/i.test(filename)) {
    const text =
      buffer[0] === 0xff && buffer[1] === 0xfe
        ? buffer.subarray(2).toString("utf16le")
        : buffer.toString("utf8").replace(/^\uFEFF/, "");
    if (text.includes("\uFFFD"))
      throw new ImportError("Salve o CSV em UTF-8 antes de importar.");
    const firstLine = text.split(/\r?\n/)[0];
    try {
      records = parse(text, {
        delimiter: firstLine.includes(";") ? ";" : ",",
        bom: true,
        relax_column_count: true,
        max_record_size: 20000,
        to: 502,
      });
    } catch {
      throw new ImportError(
        "CSV inválido. Confira as aspas e o separador das colunas.",
      );
    }
  } else throw new ImportError("Selecione um arquivo .xlsx ou .csv.");
  if (!records.length) throw new ImportError("A planilha está vazia.");
  const header = records[0].map(normalize);
  if (!header.includes("nome") || !header.includes("matricula"))
    throw new ImportError(
      "O cabeçalho deve conter nome e matricula. Baixe o modelo.",
    );
  if (
    header.some((h) => h && !importColumns.includes(h as any)) ||
    new Set(header.filter(Boolean)).size !== header.filter(Boolean).length
  )
    throw new ImportError(
      "Cabeçalho desconhecido ou repetido. Use as colunas do modelo.",
    );
  if (records.length > 501)
    throw new ImportError("Importe até 500 funcionários por arquivo.");
  const rows = records
    .slice(1)
    .map((values, i) => {
      if (values.some((v, index) => String(v).trim() && !header[index]))
        throw new ImportError(
          `Linha ${i + 2}: há dados em coluna sem cabeçalho.`,
        );
      return {
        ...Object.fromEntries(
          importColumns.map((key) => [
            key,
            String(values[header.indexOf(key)] ?? "").trim(),
          ]),
        ),
        line: i + 2,
      } as ImportRow;
    })
    .filter((row) => importColumns.some((key) => row[key]));
  if (!rows.length)
    throw new ImportError(
      "Inclua pelo menos um funcionário abaixo do cabeçalho.",
    );
  return rows;
}

export function validCpf(value: string) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  return [9, 10].every((length) => {
    let total = 0;
    for (let i = 0; i < length; i++)
      total += Number(value[i]) * (length + 1 - i);
    const digit = (total * 10) % 11;
    return Number(value[length]) === (digit === 10 ? 0 : digit);
  });
}
export function normalizeImportRow(row: ImportRow) {
  const value = { ...row, cpf: row.cpf.replace(/[.\-\s]/g, "") };
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value.admissao))
    value.admissao = value.admissao.split("/").reverse().join("-");
  return value;
}
export function rowIssues(row: ImportRow) {
  const errors: string[] = [];
  if (row.nome.length < 3 || row.nome.length > 190)
    errors.push("Nome deve ter de 3 a 190 caracteres.");
  if (!row.matricula || row.matricula.length > 50)
    errors.push(
      "Informe matrícula com até 50 caracteres, preservando os zeros iniciais.",
    );
  if (row.cpf && !validCpf(row.cpf)) errors.push("CPF inválido.");
  if (
    row.admissao &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(row.admissao) ||
      !Number.isFinite(Date.parse(row.admissao)) ||
      new Date(row.admissao).toISOString().slice(0, 10) !== row.admissao)
  )
    errors.push("Data de admissão inválida.");
  for (const key of importColumns) {
    if (/^[=+@]/.test(row[key]))
      errors.push(`${key}: use um valor, não uma fórmula.`);
    if (
      row[key].length >
      ((
        {
          nome: 190,
          matricula: 50,
          cpf: 11,
          pis: 20,
          ctps: 50,
          admissao: 10,
        } as Record<string, number>
      )[key] || 120)
    )
      errors.push(`${key}: texto muito longo.`);
  }
  return errors;
}
