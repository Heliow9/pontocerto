import { Router } from "express";
import multer from "multer";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { env } from "../config/env.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import {
  enrollFace,
  faceProviderStatus,
  revokeFace,
} from "../services/face.service.js";
import { getEmployeeFacePolicy } from "../services/face-verification.service.js";
import { writeAudit } from "../utils/audit.js";

export const faceRouter = Router();
faceRouter.use(authMiddleware);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.FACE_MAX_IMAGE_MB * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (["image/jpeg", "image/png"].includes(file.mimetype)) return cb(null, true);
    cb(new Error("Envie uma imagem JPG ou PNG."));
  },
});

async function employeeById(tenantId: number, id: number) {
  const [rows] = await pool.query<any[]>(
    "SELECT id,company_id,name,active FROM employees WHERE id=? AND tenant_id=? LIMIT 1",
    [id, tenantId],
  );
  return rows[0] || null;
}

async function myEmployee(req: any) {
  if (!req.auth?.employeeId) return null;
  return employeeById(req.auth.tenantId, req.auth.employeeId);
}

function sendFaceError(res: any, error: any, fallback: string) {
  return res.status(Number(error?.status || 503)).json({
    message: error?.message || fallback,
    code: error?.code || "FACE_PROVIDER_ERROR",
  });
}

faceRouter.get(
  "/provider/status",
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"),
  async (_req, res) => res.json(faceProviderStatus()),
);

faceRouter.get("/my/status", async (req, res) => {
  const employee = await myEmployee(req);
  if (!employee)
    return res.status(400).json({ message: "Usuário não vinculado a funcionário." });
  const policy = await getEmployeeFacePolicy(
    req.auth!.tenantId,
    employee.company_id,
    employee.id,
  );
  res.json(policy);
});

faceRouter.post("/my/enroll", async (_req, res) =>
  res.status(403).json({
    message:
      "Cadastro facial deve ser realizado pelo RH ou administrador da empresa.",
    code: "FACE_ADMIN_ENROLL_REQUIRED",
  }),
);

faceRouter.get(
  "/employee/:id/status",
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH", "GESTOR", "SUPERVISOR"),
  async (req, res) => {
    const id = Number(req.params.id);
    const employee = await employeeById(req.auth!.tenantId, id);
    if (!employee)
      return res.status(404).json({ message: "Funcionário não encontrado." });
    const policy = await getEmployeeFacePolicy(
      req.auth!.tenantId,
      employee.company_id,
      id,
    );
    res.json({ employeeId: id, employeeName: employee.name, ...policy });
  },
);

faceRouter.post(
  "/employee/:id/enroll",
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"),
  upload.single("faceImage"),
  async (req, res) => {
    const id = Number(req.params.id);
    const employee = await employeeById(req.auth!.tenantId, id);
    if (!employee || !employee.active)
      return res.status(404).json({ message: "Funcionário ativo não encontrado." });
    if (!req.file)
      return res.status(400).json({
        message: "Tire ou selecione uma foto frontal para cadastrar o rosto.",
        code: "FACE_IMAGE_REQUIRED",
      });
    const [old] = await pool.query<any[]>(
      "SELECT provider_face_id,status FROM employee_face_profiles WHERE tenant_id=? AND employee_id=? LIMIT 1",
      [req.auth!.tenantId, id],
    );
    try {
      const enrolled = await enrollFace({
        tenantId: req.auth!.tenantId,
        employeeId: id,
        image: req.file.buffer,
        oldFaceId: old[0]?.provider_face_id,
      });
      await pool.query(
        `INSERT INTO employee_face_profiles
         (tenant_id,company_id,employee_id,provider,collection_id,provider_face_id,external_image_id,status,enrolled_at,last_verified_at,updated_at)
         VALUES (?,?,?,?,?,?,?,'ENROLLED',${BRASILIA_NOW_SQL},NULL,${BRASILIA_NOW_SQL})
         ON DUPLICATE KEY UPDATE
           company_id=VALUES(company_id),provider=VALUES(provider),collection_id=VALUES(collection_id),
           provider_face_id=VALUES(provider_face_id),external_image_id=VALUES(external_image_id),
           status='ENROLLED',enrolled_at=${BRASILIA_NOW_SQL},last_verified_at=NULL,updated_at=${BRASILIA_NOW_SQL}`,
        [
          req.auth!.tenantId,
          employee.company_id,
          id,
          enrolled.provider,
          enrolled.collectionId,
          enrolled.faceId,
          enrolled.externalImageId,
        ],
      );
      await writeAudit(req, "FACE_ENROLL", "employee", id, old[0], {
        provider: enrolled.provider,
        status: "ENROLLED",
      });
      res.json({
        ok: true,
        message: old[0]?.status === "ENROLLED"
          ? "Rosto atualizado com sucesso."
          : "Rosto cadastrado com sucesso.",
        enrolled: true,
        provider: enrolled.provider,
      });
    } catch (error: any) {
      return sendFaceError(
        res,
        error,
        "Não foi possível cadastrar o reconhecimento facial.",
      );
    }
  },
);

faceRouter.delete(
  "/employee/:id",
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"),
  async (req, res) => {
    const id = Number(req.params.id);
    const employee = await employeeById(req.auth!.tenantId, id);
    if (!employee)
      return res.status(404).json({ message: "Funcionário não encontrado." });
    const [profiles] = await pool.query<any[]>(
      "SELECT provider_face_id,status,provider FROM employee_face_profiles WHERE tenant_id=? AND employee_id=? LIMIT 1",
      [req.auth!.tenantId, id],
    );
    if (!profiles[0] || profiles[0].status !== "ENROLLED")
      return res.status(404).json({ message: "Rosto não cadastrado." });
    try {
      await revokeFace(req.auth!.tenantId, profiles[0].provider_face_id);
      await pool.query(
        `UPDATE employee_face_profiles
            SET status='REVOKED',last_verified_at=NULL,updated_at=${BRASILIA_NOW_SQL}
          WHERE tenant_id=? AND employee_id=?`,
        [req.auth!.tenantId, id],
      );
      await writeAudit(req, "FACE_REVOKE", "employee", id, profiles[0], {
        status: "REVOKED",
      });
      res.json({ ok: true, message: "Cadastro facial removido." });
    } catch (error: any) {
      return sendFaceError(res, error, "Não foi possível remover o rosto cadastrado.");
    }
  },
);
