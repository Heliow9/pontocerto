import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import jwt from "jsonwebtoken";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { requireRole } from "../middlewares/require-role.js";
import { writeAudit } from "../utils/audit.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import {
  importColumns,
  ImportError,
  normalize,
  normalizeImportRow,
  readEmployeeFile,
  rowIssues,
  type ImportRow,
} from "../services/employee-import.service.js";

export const employeeImportRouter = Router();
employeeImportRouter.use(requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"));
const safe =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch((error) =>
      error instanceof ImportError
        ? res.status(422).json({ message: error.message })
        : next(error),
    );
  };
const hash = (rows: ImportRow[]) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        rows.map((row) => [row.line, ...importColumns.map((key) => row[key])]),
      ),
    )
    .digest("hex");
async function validate(
  req: Request,
  companyId: number,
  rows: ImportRow[],
  db: any = pool,
) {
  if (
    !Number.isSafeInteger(companyId) ||
    companyId <= 0 ||
    (req.auth!.companyId && Number(req.auth!.companyId) !== companyId)
  )
    throw new ImportError("Empresa não disponível para este acesso.");
  const [companies] = await db.query(
    "SELECT id FROM companies WHERE tenant_id=? AND id=? AND active=1",
    [req.auth!.tenantId, companyId],
  );
  if (!companies.length) throw new ImportError("Empresa não encontrada.");
  const [existing] = await db.query(
    "SELECT cpf,registration_number FROM employees WHERE tenant_id=?",
    [req.auth!.tenantId],
  );
  const [groups] = await db.query(
    "SELECT id,name FROM employee_groups WHERE tenant_id=? AND company_id=?",
    [req.auth!.tenantId, companyId],
  );
  const [schedules] = await db.query(
    "SELECT id,name FROM work_schedules WHERE tenant_id=? AND company_id=? AND active=1",
    [req.auth!.tenantId, companyId],
  );
  const [locations] = await db.query(
    "SELECT id,name FROM work_locations WHERE tenant_id=? AND company_id=? AND active=1",
    [req.auth!.tenantId, companyId],
  );
  const [plans] = await db.query(
    "SELECT p.max_employees FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.tenant_id=? AND s.status IN ('TRIAL','ACTIVE') ORDER BY s.id DESC LIMIT 1",
    [req.auth!.tenantId],
  );
  const [counts] = await db.query(
    "SELECT COUNT(*) AS total FROM employees WHERE tenant_id=? AND active=1",
    [req.auth!.tenantId],
  );
  const limitError =
    plans[0]?.max_employees != null &&
    Number(counts[0].total) + rows.length > Number(plans[0].max_employees)
      ? "A importação ultrapassa o limite de funcionários do plano."
      : "";
  const cpfs = new Set<string>(
    existing
      .map((e: any) => String(e.cpf || "").replace(/\D/g, ""))
      .filter(Boolean),
  );
  const registrations = new Set<string>(
    existing
      .map((e: any) => normalize(String(e.registration_number || "")))
      .filter(Boolean),
  );
  return rows.map((row) => {
    const errors = rowIssues(row);
    if (limitError) errors.push(limitError);
    if (row.cpf && cpfs.has(row.cpf))
      errors.push("CPF repetido na planilha ou já cadastrado.");
    if (registrations.has(normalize(row.matricula)))
      errors.push("Matrícula repetida na planilha ou já cadastrada.");
    if (row.cpf) cpfs.add(row.cpf);
    registrations.add(normalize(row.matricula));
    const relation = (name: string, options: any[], label: string) => {
      if (!name) return null;
      const matches = options.filter(
        (o) => normalize(o.name) === normalize(name),
      );
      if (matches.length !== 1) {
        errors.push(
          `${label} não encontrado ou ambíguo nesta empresa: ${name}.`,
        );
        return null;
      }
      return Number(matches[0].id);
    };
    return {
      ...row,
      groupId: relation(row.grupo, groups, "Grupo"),
      scheduleId: relation(row.jornada, schedules, "Jornada"),
      locationId: relation(row.local, locations, "Local"),
      errors,
      warnings: !row.jornada
        ? [
            "Sem jornada: configure antes de registrar pontos ou exportar horas.",
          ]
        : [],
    };
  });
}
employeeImportRouter.get(
  "/template",
  safe(async (_req, res) => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Funcionarios");
    sheet.columns = importColumns.map((key) => ({
      header: key,
      key,
      width: key === "nome" ? 35 : 24,
      style: { numFmt: "@" },
    }));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF007C88" },
    };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    const help = book.addWorksheet("Instrucoes");
    help.getColumn(1).width = 115;
    [
      "Preencha Funcionarios: uma pessoa por linha, até 500. Não renomeie o cabeçalho.",
      "Obrigatórios: nome e matricula. CPF opcional, mas deve ser válido quando informado.",
      "Use texto para CPF, matrícula e PIS para manter zeros iniciais. Não utilize fórmulas.",
      "admissao: AAAA-MM-DD ou DD/MM/AAAA. grupo, jornada e local: nome exato do cadastro na empresa escolhida.",
      "Crie grupos, jornadas e locais antes de importar. Um local por funcionário nesta planilha.",
      "Importa apenas novos funcionários ativos. Não altera cadastros existentes nem cria senhas de acesso.",
      "Depois da importação, configure o acesso ao aplicativo no cadastro do funcionário.",
    ].forEach((t) => help.addRow([t]));
    res
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .attachment("modelo-funcionarios.xlsx");
    res.send(Buffer.from(await book.xlsx.writeBuffer()));
  }),
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 1 },
}).single("file");
employeeImportRouter.post(
  "/preview",
  (req, res, next) =>
    upload(req, res, (error) =>
      error
        ? res
            .status(400)
            .json({ message: "Envie um arquivo Excel ou CSV de até 2 MB." })
        : next(),
    ),
  safe(async (req, res) => {
    if (!req.file) throw new ImportError("Selecione a planilha.");
    const companyId = Number(req.body.companyId);
    const rows = (
      await readEmployeeFile(req.file.buffer, req.file.originalname)
    ).map(normalizeImportRow);
    const preview = await validate(req, companyId, rows);
    const canImport = preview.every((r) => !r.errors.length);
    res.json({
      rows,
      preview,
      canImport,
      confirmation: canImport
        ? jwt.sign(
            {
              purpose: "employee-import",
              tenantId: req.auth!.tenantId,
              userId: req.auth!.userId,
              companyId,
              hash: hash(rows),
              importId: randomUUID(),
            },
            env.JWT_SECRET,
            { expiresIn: "30m" },
          )
        : null,
    });
  }),
);
const bodySchema = z.object({
  confirmation: z.string().max(2000),
  rows: z
    .array(
      z
        .object({
          line: z.number().int().min(2),
          ...Object.fromEntries(
            importColumns.map((c) => [c, z.string().max(500)]),
          ),
        })
        .strict(),
    )
    .min(1)
    .max(500),
});
employeeImportRouter.post(
  "/confirm",
  safe(async (req, res) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success)
      throw new ImportError("Dados inválidos. Envie a planilha novamente.");
    let payload: any;
    try {
      payload = jwt.verify(parsed.data.confirmation, env.JWT_SECRET);
    } catch {
      throw new ImportError("A prévia expirou. Envie a planilha novamente.");
    }
    const rows = parsed.data.rows as ImportRow[];
    if (
      payload.purpose !== "employee-import" ||
      payload.tenantId !== req.auth!.tenantId ||
      payload.userId !== req.auth!.userId ||
      payload.hash !== hash(rows)
    )
      throw new ImportError(
        "A prévia foi alterada. Envie a planilha novamente.",
      );
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("SELECT id FROM tenants WHERE id=? FOR UPDATE", [
        req.auth!.tenantId,
      ]);
      const [done] = await conn.query<any[]>(
        "SELECT imported_count FROM employee_imports WHERE id=? AND tenant_id=? AND user_id=?",
        [payload.importId, req.auth!.tenantId, req.auth!.userId],
      );
      if (done.length) {
        await conn.commit();
        return res.json({
          imported: done[0].imported_count,
          alreadyImported: true,
        });
      }
      const preview = await validate(req, payload.companyId, rows, conn);
      if (preview.some((r) => r.errors.length)) {
        await conn.rollback();
        return res
          .status(409)
          .json({
            message:
              "Os cadastros mudaram desde a prévia. Corrija os erros e envie novamente.",
            preview,
          });
      }
      for (const row of preview) {
        const [created] = await conn.query<any>(
          `INSERT INTO employees (tenant_id,company_id,name,cpf,registration_number,pis,admission_date,ctps,position_name,department_name,group_id,work_schedule_id,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,
          [
            req.auth!.tenantId,
            payload.companyId,
            row.nome,
            row.cpf || null,
            row.matricula,
            row.pis || null,
            row.admissao || null,
            row.ctps || null,
            row.cargo || null,
            row.setor || null,
            row.groupId,
            row.scheduleId,
          ],
        );
        if (row.locationId)
          await conn.query(
            "INSERT INTO employee_locations (tenant_id,employee_id,work_location_id) VALUES (?,?,?)",
            [req.auth!.tenantId, created.insertId, row.locationId],
          );
      }
      await conn.query(
        `INSERT INTO employee_imports (id,tenant_id,company_id,user_id,imported_count,created_at) VALUES (?,?,?,?,?,${BRASILIA_NOW_SQL})`,
        [
          payload.importId,
          req.auth!.tenantId,
          payload.companyId,
          req.auth!.userId,
          rows.length,
        ],
      );
      await conn.commit();
      await writeAudit(
        req,
        "EMPLOYEES_IMPORTED",
        "company",
        payload.companyId,
        undefined,
        { importId: payload.importId, count: rows.length },
      );
      res.json({ imported: rows.length });
    } catch (error: any) {
      await conn.rollback();
      if (error.code === "ER_DUP_ENTRY")
        throw new ImportError(
          "Há CPF ou matrícula já cadastrado. Gere uma nova prévia.",
        );
      throw error;
    } finally {
      conn.release();
    }
  }),
);
