import { Router, type Request } from "express";
import multer from "multer";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { writeAudit } from "../utils/audit.js";
import {
  createActivationCode,
  createTerminalToken,
  hashAutoPointSecret,
  normalizeAutoPointSettings,
} from "../services/autopoint-security.service.js";
import {
  ensureCompanyFaceCollection,
  reindexCompanyFaces,
} from "../services/face-collection.service.js";
import { registerAutoPoint } from "../services/autopoint-punch.service.js";

export const autopointRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.min(env.FACE_MAX_IMAGE_MB || 5, 5) * 1024 * 1024 },
}).single("selfie");

async function company(tenantId: number, companyId: number) {
  const [rows] = await pool.query<any[]>(
    "SELECT id,legal_name,trade_name,active FROM companies WHERE id=? AND tenant_id=? LIMIT 1",
    [companyId, tenantId],
  );
  return rows[0] || null;
}

async function settings(tenantId: number, companyId: number) {
  const [rows] = await pool.query<any[]>(
    "SELECT enabled,scan_interval_seconds,result_display_seconds,cooldown_seconds FROM autopoint_settings WHERE tenant_id=? AND company_id=? LIMIT 1",
    [tenantId, companyId],
  );
  return normalizeAutoPointSettings(
    rows[0]
      ? {
          enabled: Boolean(rows[0].enabled),
          scanIntervalSeconds: rows[0].scan_interval_seconds,
          resultDisplaySeconds: rows[0].result_display_seconds,
          cooldownSeconds: rows[0].cooldown_seconds,
        }
      : {},
  );
}

async function createUniqueActivationCode() {
  for (let i = 0; i < 8; i += 1) {
    const code = createActivationCode();
    const hash = hashAutoPointSecret(code, env.JWT_SECRET);
    const [rows] = await pool.query<any[]>(
      `SELECT id FROM autopoint_terminals WHERE activation_code_hash=? AND activation_expires_at>${BRASILIA_NOW_SQL} LIMIT 1`,
      [hash],
    );
    if (!rows[0]) return { code, hash };
  }
  throw Object.assign(new Error("Não foi possível gerar um código de ativação. Tente novamente."), { status: 503, code: "AUTOPONT_CODE_UNAVAILABLE" });
}

async function terminalFromRequest(req: Request) {
  const token = String(req.header("x-autopoint-token") || "").trim();
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = hashAutoPointSecret(token, env.JWT_SECRET);
  const [rows] = await pool.query<any[]>(
    `SELECT t.id,t.tenant_id,t.company_id,t.name,c.legal_name,c.trade_name,c.active
       FROM autopoint_terminals t
       JOIN companies c ON c.id=t.company_id AND c.tenant_id=t.tenant_id
      WHERE t.token_hash=? AND t.active=1 AND c.active=1 LIMIT 1`,
    [hash],
  );
  if (!rows[0]) return null;
  await pool.query(
    `UPDATE autopoint_terminals
        SET last_seen_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL}
      WHERE id=?
        AND (last_seen_at IS NULL OR last_seen_at < DATE_SUB(${BRASILIA_NOW_SQL},INTERVAL 1 MINUTE))`,
    [rows[0].id],
  );
  return rows[0];
}

const admin = Router();
admin.use(authMiddleware, requireRole("TENANT_ADMIN", "RH"));

autopointRouter.use("/admin", admin);

admin.get("/settings/:companyId", async (req, res) => {
  const companyId = Number(req.params.companyId);
  const c = await company(req.auth!.tenantId, companyId);
  if (!c) return res.status(404).json({ message: "Empresa não encontrada." });
  const value = await settings(req.auth!.tenantId, companyId);
  const [counts] = await pool.query<any[]>(
    `SELECT
      (SELECT COUNT(*) FROM employee_face_images i JOIN employees e ON e.id=i.employee_id AND e.tenant_id=i.tenant_id WHERE e.tenant_id=? AND e.company_id=? AND e.active=1) AS photos,
      (SELECT COUNT(*) FROM employee_face_profiles p WHERE p.tenant_id=? AND p.company_id=? AND p.status='ENROLLED') AS indexed`,
    [req.auth!.tenantId, companyId, req.auth!.tenantId, companyId],
  );
  res.json({ company: c, settings: value, faces: { photos: Number(counts[0]?.photos || 0), indexed: Number(counts[0]?.indexed || 0) } });
});

admin.put("/settings/:companyId", requireRole("TENANT_ADMIN"), async (req, res) => {
  const companyId = Number(req.params.companyId);
  const c = await company(req.auth!.tenantId, companyId);
  if (!c) return res.status(404).json({ message: "Empresa não encontrada." });
  const value = normalizeAutoPointSettings(req.body || {});
  if (value.enabled) await ensureCompanyFaceCollection(req.auth!.tenantId, companyId);
  await pool.query(
    `INSERT INTO autopoint_settings
      (tenant_id,company_id,enabled,scan_interval_seconds,result_display_seconds,cooldown_seconds,updated_by,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})
     ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),scan_interval_seconds=VALUES(scan_interval_seconds),result_display_seconds=VALUES(result_display_seconds),cooldown_seconds=VALUES(cooldown_seconds),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)`,
    [req.auth!.tenantId, companyId, value.enabled ? 1 : 0, value.scanIntervalSeconds, value.resultDisplaySeconds, value.cooldownSeconds, req.auth!.userId],
  );
  await writeAudit(req, "AUTOPONT_SETTINGS_UPDATE", "company", companyId, undefined, value);
  res.json({ ok: true, settings: value });
});

admin.get("/terminals/:companyId", async (req, res) => {
  const companyId = Number(req.params.companyId);
  if (!(await company(req.auth!.tenantId, companyId))) return res.status(404).json({ message: "Empresa não encontrada." });
  const [rows] = await pool.query<any[]>(
    `SELECT id,name,active,activated_at,last_seen_at,activation_expires_at,created_at
       FROM autopoint_terminals WHERE tenant_id=? AND company_id=? ORDER BY active DESC,name`,
    [req.auth!.tenantId, companyId],
  );
  res.json(rows);
});

const terminalCreate = z.object({ companyId: z.number().int().positive(), name: z.string().trim().min(2).max(120) });
admin.post("/terminals", requireRole("TENANT_ADMIN"), async (req, res) => {
  const d = terminalCreate.parse(req.body);
  if (!(await company(req.auth!.tenantId, d.companyId))) return res.status(404).json({ message: "Empresa não encontrada." });
  const activation = await createUniqueActivationCode();
  const [result] = await pool.query<any>(
    `INSERT INTO autopoint_terminals
      (tenant_id,company_id,name,activation_code_hash,activation_expires_at,token_hash,active,created_by,created_at,updated_at)
     VALUES (?,?,?,?,DATE_ADD(${BRASILIA_NOW_SQL},INTERVAL 15 MINUTE),NULL,1,?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,
    [req.auth!.tenantId, d.companyId, d.name, activation.hash, req.auth!.userId],
  );
  await writeAudit(req, "AUTOPONT_TERMINAL_CREATE", "autopoint_terminal", Number(result.insertId), undefined, { companyId: d.companyId, name: d.name });
  res.status(201).json({ id: Number(result.insertId), name: d.name, activationCode: activation.code, expiresInMinutes: 15 });
});

admin.post("/terminals/:id/activation-code", requireRole("TENANT_ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  const activation = await createUniqueActivationCode();
  const [result] = await pool.query<any>(
    `UPDATE autopoint_terminals SET activation_code_hash=?,activation_expires_at=DATE_ADD(${BRASILIA_NOW_SQL},INTERVAL 15 MINUTE),token_hash=NULL,activated_at=NULL,active=1,updated_at=${BRASILIA_NOW_SQL} WHERE id=? AND tenant_id=?`,
    [activation.hash, id, req.auth!.tenantId],
  );
  if (!result.affectedRows) return res.status(404).json({ message: "Terminal não encontrado." });
  res.json({ id, activationCode: activation.code, expiresInMinutes: 15 });
});

admin.patch("/terminals/:id", requireRole("TENANT_ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  const body = z.object({ name: z.string().trim().min(2).max(120).optional(), active: z.boolean().optional() }).parse(req.body);
  const [rows] = await pool.query<any[]>("SELECT name,active FROM autopoint_terminals WHERE id=? AND tenant_id=? LIMIT 1", [id, req.auth!.tenantId]);
  if (!rows[0]) return res.status(404).json({ message: "Terminal não encontrado." });
  const name = body.name ?? rows[0].name;
  const active = body.active ?? Boolean(rows[0].active);
  await pool.query(`UPDATE autopoint_terminals SET name=?,active=?,token_hash=IF(?=1,token_hash,NULL),updated_at=${BRASILIA_NOW_SQL} WHERE id=? AND tenant_id=?`, [name, active ? 1 : 0, active ? 1 : 0, id, req.auth!.tenantId]);
  res.json({ ok: true, id, name, active });
});

admin.post("/reindex/:companyId", requireRole("TENANT_ADMIN"), async (req, res) => {
  const companyId = Number(req.params.companyId);
  if (!(await company(req.auth!.tenantId, companyId))) return res.status(404).json({ message: "Empresa não encontrada." });
  const result = await reindexCompanyFaces({ tenantId: req.auth!.tenantId, companyId });
  await writeAudit(req, "AUTOPONT_FACE_REINDEX", "company", companyId, undefined, result);
  res.json(result);
});

autopointRouter.post("/activate", async (req, res) => {
  const code = String(req.body?.code || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ message: "Informe o código de 6 dígitos." });
  const hash = hashAutoPointSecret(code, env.JWT_SECRET);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<any[]>(
      `SELECT t.id,t.tenant_id,t.company_id,t.name,c.legal_name,c.trade_name
         FROM autopoint_terminals t JOIN companies c ON c.id=t.company_id AND c.tenant_id=t.tenant_id
        WHERE t.activation_code_hash=? AND t.activation_expires_at>${BRASILIA_NOW_SQL} AND t.active=1 AND c.active=1 LIMIT 1 FOR UPDATE`,
      [hash],
    );
    const t = rows[0];
    if (!t) { await conn.rollback(); return res.status(404).json({ message: "Código inválido ou expirado.", code: "AUTOPONT_ACTIVATION_INVALID" }); }
    const token = createTerminalToken();
    const tokenHash = hashAutoPointSecret(token, env.JWT_SECRET);
    await conn.query(`UPDATE autopoint_terminals SET token_hash=?,activation_code_hash=NULL,activation_expires_at=NULL,activated_at=${BRASILIA_NOW_SQL},last_seen_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL} WHERE id=?`, [tokenHash, t.id]);
    await conn.commit();
    const value = await settings(Number(t.tenant_id), Number(t.company_id));
    res.json({ token, terminal: { id: Number(t.id), name: t.name }, company: { id: Number(t.company_id), name: t.trade_name || t.legal_name }, settings: value });
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
});

autopointRouter.get("/session", async (req, res) => {
  const t = await terminalFromRequest(req);
  if (!t) return res.status(401).json({ message: "Terminal não autorizado.", code: "AUTOPONT_TERMINAL_INVALID" });
  const value = await settings(Number(t.tenant_id), Number(t.company_id));
  res.json({ terminal: { id: Number(t.id), name: t.name }, company: { id: Number(t.company_id), name: t.trade_name || t.legal_name }, settings: value });
});

autopointRouter.post("/punch", (req, res, next) => upload(req, res, error => error ? res.status(400).json({ message: "Envie uma selfie JPG/PNG de até 5 MB.", code: "AUTOPONT_IMAGE_INVALID" }) : next()), async (req, res) => {
  const t = await terminalFromRequest(req);
  if (!t) return res.status(401).json({ message: "Terminal não autorizado.", code: "AUTOPONT_TERMINAL_INVALID" });
  const value = await settings(Number(t.tenant_id), Number(t.company_id));
  if (!value.enabled) return res.status(403).json({ message: "AutoPonto está desabilitado para esta empresa.", code: "AUTOPONT_DISABLED" });
  if (!req.file) return res.status(400).json({ message: "Capture o rosto para continuar.", code: "AUTOPONT_IMAGE_REQUIRED" });
  try {
    const entry = await registerAutoPoint({ tenantId: Number(t.tenant_id), companyId: Number(t.company_id), terminalId: Number(t.id), cooldownSeconds: value.cooldownSeconds, image: req.file.buffer, mimeType: req.file.mimetype || "image/jpeg" });
    res.status(201).json({ ok: true, entry, settings: value });
  } catch (error: any) {
    if (error?.status) return res.status(error.status).json({ message: error.message, code: error.code, ...(error.details || {}) });
    throw error;
  }
});
