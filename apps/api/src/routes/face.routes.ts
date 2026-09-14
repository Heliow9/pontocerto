import { Router } from "express";
import multer from "multer";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import {
  assertSingleFace,
  validateFaceImage,
  faceError,
} from "../services/face.service.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { writeAudit } from "../utils/audit.js";

export const faceRouter = Router();
faceRouter.use(authMiddleware, requireRole("TENANT_ADMIN", "RH"));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single("photo");
async function employee(req: any) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1)
    throw faceError("Funcionário inválido.", "EMPLOYEE_NOT_FOUND", 404);
  const [rows] = await pool.query<any[]>(
    "SELECT id,company_id FROM employees WHERE id=? AND tenant_id=? LIMIT 1",
    [id, req.auth.tenantId],
  );
  if (!rows[0])
    throw faceError("Funcionário não encontrado.", "EMPLOYEE_NOT_FOUND", 404);
  return rows[0];
}
async function withPhotoLock(
  tenantId: number,
  employeeId: number,
  operation: (db: any) => Promise<void>,
) {
  const db = await pool.getConnection();
  const key = "pc:punch:" + tenantId + ":" + employeeId;
  let locked = false;
  try {
    const [rows] = await db.query<any[]>("SELECT GET_LOCK(?,5) AS acquired", [
      key,
    ]);
    locked = Number(rows[0]?.acquired) === 1;
    if (!locked)
      throw faceError(
        "Uma marcação ou alteração de foto está em andamento. Tente novamente.",
        "FACE_BUSY",
        409,
      );
    await operation(db);
  } finally {
    if (locked) await db.query("SELECT RELEASE_LOCK(?)", [key]).catch(() => {});
    db.release();
  }
}
faceRouter.get("/employee/:id/status", async (req, res) => {
  const e = await employee(req);
  const [rows] = await pool.query<any[]>(
    "SELECT updated_at FROM employee_face_images WHERE tenant_id=? AND employee_id=?",
    [req.auth!.tenantId, e.id],
  );
  res.setHeader("Cache-Control", "no-store");
  res.json({
    enrolled: Boolean(rows[0]),
    updatedAt: rows[0]?.updated_at || null,
  });
});
faceRouter.get("/employee/:id/photo", async (req, res) => {
  const e = await employee(req);
  const [rows] = await pool.query<any[]>(
    "SELECT image,mime_type FROM employee_face_images WHERE tenant_id=? AND employee_id=?",
    [req.auth!.tenantId, e.id],
  );
  if (!rows[0])
    return res.status(404).json({ message: "Foto não cadastrada." });
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.type(rows[0].mime_type).send(rows[0].image);
});
faceRouter.post(
  "/employee/:id/photo",
  (req, res, next) =>
    upload(req, res, (error) =>
      error
        ? res
            .status(400)
            .json({ message: "Envie uma única foto JPG ou PNG de até 5 MB." })
        : next(),
    ),
  async (req, res) => {
    const e = await employee(req);
    if (!req.file)
      return res
        .status(400)
        .json({ message: "Selecione ou capture a foto do funcionário." });
    const mime = validateFaceImage(req.file.buffer);
    await assertSingleFace(req.file.buffer);
    await withPhotoLock(req.auth!.tenantId, e.id, async (db) => {
      await db.query(
        "INSERT INTO employee_face_images(tenant_id,employee_id,image,mime_type,updated_by,updated_at) VALUES(?,?,?,?,?," +
          BRASILIA_NOW_SQL +
          ") ON DUPLICATE KEY UPDATE image=VALUES(image),mime_type=VALUES(mime_type),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)",
        [req.auth!.tenantId, e.id, req.file!.buffer, mime, req.auth!.userId],
      );
    });
    await writeAudit(req, "FACE_PHOTO_SAVE", "employee", e.id, undefined, {
      enrolled: true,
    });
    res.json({
      ok: true,
      enrolled: true,
      message:
        "Foto salva. As próximas marcações serão comparadas com esta imagem.",
    });
  },
);
faceRouter.delete("/employee/:id/photo", async (req, res) => {
  const e = await employee(req);
  await withPhotoLock(req.auth!.tenantId, e.id, async (db) => {
    await db.query(
      "DELETE FROM employee_face_images WHERE tenant_id=? AND employee_id=?",
      [req.auth!.tenantId, e.id],
    );
  });
  await writeAudit(req, "FACE_PHOTO_REMOVE", "employee", e.id, undefined, {
    enrolled: false,
  });
  res.json({
    ok: true,
    enrolled: false,
    message:
      "Foto removida. O funcionário volta ao fluxo de ponto sem comparação facial.",
  });
});
