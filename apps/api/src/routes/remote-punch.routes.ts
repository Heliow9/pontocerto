import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { createHash } from "node:crypto";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import {
  getEmployeeDevicePolicy,
  validateEmployeeDevice,
} from "../services/device-biometric.service.js";
import {
  saveTimeEntrySelfie,
  removeTimeEntrySelfie,
} from "../services/selfie.service.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
export const remotePunchRouter = Router();
const punchLabels: Record<
  "CLOCK_IN" | "BREAK_OUT" | "BREAK_IN" | "CLOCK_OUT",
  string
> = {
  CLOCK_IN: "Entrada",
  BREAK_OUT: "Saída para intervalo",
  BREAK_IN: "Retorno do intervalo",
  CLOCK_OUT: "Saída",
};
const safe =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
remotePunchRouter.use(
  authMiddleware,
  requireRole("FUNCIONARIO"),
  (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  },
);
async function context(req: Request) {
  const [rows] = await pool.query<any[]>(
    `SELECT e.id,e.company_id,e.work_schedule_id,a.remote_enabled,a.offline_enabled FROM employees e JOIN companies c ON c.id=e.company_id AND c.tenant_id=e.tenant_id AND c.active=1 JOIN tenants t ON t.id=e.tenant_id AND t.status='ACTIVE' LEFT JOIN company_automation a ON a.company_id=e.company_id AND a.tenant_id=e.tenant_id WHERE e.id=? AND e.tenant_id=? AND e.active=1 AND EXISTS (SELECT 1 FROM users u WHERE u.id=? AND u.tenant_id=e.tenant_id AND u.employee_id=e.id AND u.active=1 AND u.role='FUNCIONARIO')`,
    [req.auth!.employeeId, req.auth!.tenantId, req.auth!.userId],
  );
  return rows[0];
}
remotePunchRouter.get(
  "/policy",
  safe(async (req, res) => {
    const e = await context(req);
    if (!e) return res.sendStatus(403);
    const device = await getEmployeeDevicePolicy(
      req.auth!.tenantId,
      e.company_id,
      e.id,
    );
    res.json({
      enabled: Boolean(e.remote_enabled),
      offlineEnabled: Boolean(e.offline_enabled),
      device,
      companyId: Number(e.company_id),
      serverTime: new Date().toISOString(),
    });
  }),
);
const schema = z.object({
  employeeId: z.number().int().positive(),
  requestKey: z.string().regex(/^[a-zA-Z0-9-]{16,80}$/),
  type: z.enum(["CLOCK_IN", "BREAK_OUT", "BREAK_IN", "CLOCK_OUT"]),
  capturedAt: z.string().datetime(),
  offline: z.boolean(),
  source: z.enum(["WEB", "MOBILE"]),
  selfie: z.string().min(100).max(700000),
  deviceUid: z.string().max(190).nullable().optional(),
  deviceSecret: z.string().max(256).nullable().optional(),
});
remotePunchRouter.post(
  "/",
  safe(async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ message: "Marcação incompleta. Confira horário e foto." });
    const d = parsed.data,
      e = await context(req);
    if (!e) return res.sendStatus(403);
    if (d.employeeId !== Number(e.id))
      return res.status(403).json({
        message:
          "Esta marcação pertence a outra conta. Entre com o funcionário que a registrou.",
      });
    const { deviceSecret, offline, ...content } = d;
    const hash = createHash("sha256")
      .update(JSON.stringify(content))
      .digest("hex");
    const gate = await pool.getConnection();
    let locked = false,
      saved: string | null = null,
      committed = false;
    const lock = `pc:punch:${req.auth!.tenantId}:${e.id}`;
    try {
      const [locks] = await gate.query<any[]>(
        "SELECT GET_LOCK(?,5) AS acquired",
        [lock],
      );
      locked = Number(locks[0]?.acquired) === 1;
      if (!locked)
        return res.status(409).json({
          message:
            "Outra marcação está em processamento. Tente sincronizar novamente.",
        });
      const [existing] = await gate.query<any[]>(
        "SELECT r.payload_hash,t.id,t.registered_at,t.entry_type FROM remote_punches r JOIN time_entries t ON t.id=r.time_entry_id AND t.tenant_id=r.tenant_id WHERE r.tenant_id=? AND r.employee_id=? AND r.request_key=?",
        [req.auth!.tenantId, e.id, d.requestKey],
      );
      if (existing[0])
        return existing[0].payload_hash !== hash
          ? res.status(409).json({
              message: "Esta tentativa já foi usada com outro conteúdo.",
            })
          : res.json({
              id: existing[0].id,
              registered_at: existing[0].registered_at,
              entry_type: existing[0].entry_type,
              replayed: true,
            });
      if (!e.remote_enabled || (d.offline && !e.offline_enabled))
        return res.status(403).json({
          message:
            "A empresa não autoriza esta modalidade. A marcação permanece no aparelho; solicite orientação ao RH.",
        });
      const stamp = Date.parse(d.capturedAt),
        now = Date.now();
      if (stamp > now + 300000 || now - stamp > 30 * 86400000)
        return res.status(422).json({
          message:
            "Horário do aparelho fora do período aceito (até 30 dias). Solicite ajuste ao RH; a tentativa será preservada.",
        });
      if (!d.offline && now - stamp > 5 * 60000)
        return res.status(422).json({
          message: "Registro online antigo. Solicite orientação ao RH.",
        });
      const device = await validateEmployeeDevice({
        tenantId: req.auth!.tenantId,
        companyId: e.company_id,
        employeeId: e.id,
        deviceUid: d.deviceUid,
        deviceSecret,
      });
      if (!device.verified)
        return res.status(403).json({ message: device.message });
      if (d.source === "WEB" && device.policy.requireDeviceBiometric)
        return res.status(403).json({
          message:
            "Sua conta exige biometria nativa. Use o Android ou solicite ao RH a configuração de acesso pelo PWA.",
        });
      const photo = Buffer.from(d.selfie, "base64");
      if (
        photo.length > 500000 ||
        photo.length < 32 ||
        photo[0] !== 255 ||
        photo[1] !== 216 ||
        photo[2] !== 255
      )
        return res
          .status(400)
          .json({ message: "A selfie deve ser JPEG de até 500 KB." });
      const captured = new Date(stamp - 3 * 3600000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      let workDate = captured.slice(0, 10);
      // Link non-entry punches to the most recent journey date, including overnight work and retries after CLOCK_OUT.
      if (d.type !== "CLOCK_IN") {
        const [previous] = await gate.query<any[]>(
          "SELECT entry_type,scheduled_work_date,registered_at FROM time_entries WHERE tenant_id=? AND employee_id=? AND registered_at<=? AND registered_at>=DATE_SUB(?,INTERVAL 24 HOUR) ORDER BY registered_at DESC,id DESC LIMIT 1",
          [req.auth!.tenantId, e.id, captured, captured],
        );
        const p = previous[0];
        if (p)
          workDate = (p.scheduled_work_date || p.registered_at).slice(0, 10);
      }
      const [duplicate] = await gate.query<any[]>(
        `SELECT id,entry_type FROM time_entries
          WHERE tenant_id=? AND employee_id=? AND entry_type=?
            AND COALESCE(scheduled_work_date,DATE(registered_at))=?
          LIMIT 1`,
        [req.auth!.tenantId, e.id, d.type, workDate],
      );
      if (duplicate[0])
        return res.status(409).json({
          message: `${punchLabels[d.type]} já foi registrada nesta jornada. Não é permitido repetir a mesma marcação no mesmo dia de trabalho.`,
          code: "DUPLICATE_PUNCH_TYPE",
          existingId: Number(duplicate[0].id),
          workDate,
        });
      await gate.beginTransaction();
      const [result] = await gate.query<any>(
        `INSERT INTO time_entries(tenant_id,company_id,employee_id,entry_type,registered_at,source,manually_adjusted,created_by_user_id,created_at,device_id,device_binding_id,scheduled_work_date,schedule_decision) VALUES (?,?,?,?,?,?,0,?,${BRASILIA_NOW_SQL},?,?,?,'NOT_REQUIRED')`,
        [
          req.auth!.tenantId,
          e.company_id,
          e.id,
          d.type,
          captured,
          d.source,
          req.auth!.userId,
          d.deviceUid || null,
          device.device?.id || null,
          workDate,
        ],
      );
      const id = Number(result.insertId);
      const selfie = await saveTimeEntrySelfie({
        tenantId: req.auth!.tenantId,
        employeeId: e.id,
        timeEntryId: id,
        buffer: photo,
        mimeType: "image/jpeg",
      });
      saved = selfie.relativePath;
      await gate.query(
        `INSERT INTO time_entry_selfies(tenant_id,company_id,employee_id,time_entry_id,file_path,mime_type,file_size,sha256,captured_at,created_at) VALUES (?,?,?,?,?,'image/jpeg',?,?,?,${BRASILIA_NOW_SQL})`,
        [
          req.auth!.tenantId,
          e.company_id,
          e.id,
          id,
          selfie.relativePath,
          selfie.fileSize,
          selfie.sha256,
          captured,
        ],
      );
      await gate.query(
        "INSERT INTO remote_punches(tenant_id,company_id,employee_id,request_key,time_entry_id,captured_at,was_offline,payload_hash) VALUES (?,?,?,?,?,?,?,?)",
        [
          req.auth!.tenantId,
          e.company_id,
          e.id,
          d.requestKey,
          id,
          captured,
          d.offline ? 1 : 0,
          hash,
        ],
      );
      await gate.commit();
      committed = true;
      res.status(201).json({
        id,
        registered_at: captured,
        entry_type: d.type,
        remote: true,
        offline: d.offline,
      });
    } finally {
      if (!committed) {
        await gate.rollback().catch(() => {});
        if (saved) await removeTimeEntrySelfie(saved);
      }
      if (locked)
        await gate.query("SELECT RELEASE_LOCK(?)", [lock]).catch(() => {});
      gate.release();
    }
  }),
);
