import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { BRASILIA_DATE_SQL, BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { writeAudit } from "../utils/audit.js";
import {
  evaluateEmployeeGeofence,
  getCompanySecurityPolicy,
} from "../services/geofence.service.js";
import {
  getEmployeeDevicePolicy,
  validateEmployeeDevice,
} from "../services/device-biometric.service.js";
import { evaluateEmployeeSchedule } from "../services/schedule-guard.service.js";
import { env } from "../config/env.js";
import {
  readTimeEntrySelfie,
  removeTimeEntrySelfie,
  saveTimeEntrySelfie,
} from "../services/selfie.service.js";

export const timeEntriesRouter = Router();
timeEntriesRouter.use(authMiddleware);

const entryTypes = [
  "CLOCK_IN",
  "BREAK_OUT",
  "BREAK_IN",
  "CLOCK_OUT",
  "OTHER",
] as const;

const selfieUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.SELFIE_MAX_IMAGE_MB * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (["image/jpeg", "image/png"].includes(file.mimetype))
      return cb(null, true);
    cb(new Error("A foto do ponto deve ser JPG ou PNG."));
  },
});

const nullableNumber = z.preprocess(
  (v: unknown) =>
    v === undefined || v === null || v === "" ? null : Number(v),
  z.number().nullable(),
);
const booleanField = z.preprocess(
  (v: unknown) => v === true || v === 1 || v === "1" || v === "true",
  z.boolean(),
);

const clockSchema = z.object({
  employeeId: z.number().int().positive().optional(),
  type: z.enum(entryTypes).default("OTHER"),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  accuracy: z.number().optional().nullable(),
  locationMocked: z.boolean().optional().nullable(),
  deviceId: z.string().max(190).optional().nullable(),
  source: z.enum(["MOBILE", "WEB"]).default("MOBILE"),
});

const geofencePreviewSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).optional().nullable(),
  locationMocked: z.boolean().optional().nullable(),
});

const secureSchema = z.object({
  source: z.enum(["MOBILE", "WEB"]).default("MOBILE"),
  requestKey: z
    .string()
    .regex(/^[a-zA-Z0-9-]{16,80}$/)
    .optional(),
  // Mantido por compatibilidade. Quando existe jornada válida, a API define o tipo esperado.
  type: z.enum(entryTypes).default("OTHER"),
  latitude: nullableNumber,
  longitude: nullableNumber,
  accuracy: nullableNumber.optional(),
  locationMocked: booleanField.default(false),
  deviceUid: z.preprocess(
    (v: unknown) => (v === "" ? null : v),
    z.string().min(8).max(190).optional().nullable(),
  ),
  deviceSecret: z.preprocess(
    (v: unknown) => (v === "" ? null : v),
    z.string().min(32).max(256).optional().nullable(),
  ),
  biometricType: z
    .preprocess(
      (v: unknown) => (v === "" ? null : v),
      z.string().min(3).max(80).optional().nullable(),
    )
    .default("DEVICE_BIOMETRIC"),
});

async function getEmployeeForClock(req: any, requestedEmployeeId?: number) {
  const employeeId =
    req.auth.role === "FUNCIONARIO" ? req.auth.employeeId : requestedEmployeeId;
  if (!employeeId) return null;
  const [rows] = await pool.query<any[]>(
    "SELECT id,company_id FROM employees WHERE id=? AND tenant_id=? AND active=1 LIMIT 1",
    [employeeId, req.auth.tenantId],
  );
  return rows[0] || null;
}

async function logAttempt(args: {
  tenantId: number;
  companyId: number;
  employeeId: number;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  mocked?: boolean | null;
  geoDecision?: string | null;
  distance?: number | null;
  biometricDecision?: string | null;
  scheduleDecision?: string | null;
  deviceUid?: string | null;
  success: boolean;
  reason?: string | null;
}) {
  try {
    await pool.query(
      `INSERT INTO punch_attempts
       (tenant_id,company_id,employee_id,attempted_at,latitude,longitude,accuracy,location_mocked,
        geo_decision,distance_meters,biometric_decision,schedule_decision,device_uid,success,reason,created_at)
       VALUES (?,?,?,${BRASILIA_NOW_SQL},?,?,?,?,?,?,?,?,?,?,?,${BRASILIA_NOW_SQL})`,
      [
        args.tenantId,
        args.companyId,
        args.employeeId,
        args.latitude ?? null,
        args.longitude ?? null,
        args.accuracy ?? null,
        args.mocked == null ? null : args.mocked ? 1 : 0,
        args.geoDecision || null,
        args.distance == null ? null : Math.round(args.distance * 100) / 100,
        args.biometricDecision || null,
        args.scheduleDecision || null,
        args.deviceUid || null,
        args.success ? 1 : 0,
        args.reason || null,
      ],
    );
  } catch (error) {
    console.error("Falha ao gravar tentativa de ponto", error);
  }
}

// Diagnóstico de GPS/geofence: usa exatamente a mesma regra do registro real.
timeEntriesRouter.post("/geofence-preview", async (req, res) => {
  if (req.auth!.role !== "FUNCIONARIO" || !req.auth!.employeeId) {
    return res.status(403).json({ message: "Usuário funcionário necessário." });
  }

  const parsed = geofencePreviewSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: "Coordenadas inválidas." });

  const employee = await getEmployeeForClock(req);
  if (!employee)
    return res.status(404).json({ message: "Funcionário não encontrado." });

  const d = parsed.data;
  const geo = await evaluateEmployeeGeofence({
    tenantId: req.auth!.tenantId,
    companyId: employee.company_id,
    employeeId: employee.id,
    latitude: d.latitude,
    longitude: d.longitude,
    accuracy: d.accuracy,
    mocked: d.locationMocked,
  });

  res.json({
    decision: geo.decision,
    message: geo.message,
    withinRadius: geo.withinRadius,
    distanceMeters: geo.distanceMeters,
    current: {
      latitude: d.latitude,
      longitude: d.longitude,
      accuracy: d.accuracy ?? null,
      mocked: Boolean(d.locationMocked),
    },
    reference: geo.location
      ? {
          id: geo.location.id,
          name: geo.location.name,
          source: geo.location.source,
          latitude: geo.location.latitude,
          longitude: geo.location.longitude,
          radiusMeters: geo.location.radiusMeters,
          mode: geo.location.mode,
        }
      : null,
    policy: {
      companyLatitude: geo.policy.latitude,
      companyLongitude: geo.policy.longitude,
      punchRadiusMeters: geo.policy.punchRadiusMeters,
      maxGpsAccuracyMeters: geo.policy.maxGpsAccuracyMeters,
      companyAddress: geo.policy.address,
    },
  });
});

// Contexto do botão de ponto: jornada do servidor + próxima marcação esperada.
timeEntriesRouter.get("/my/context", async (req, res) => {
  if (req.auth!.role !== "FUNCIONARIO" || !req.auth!.employeeId) {
    return res.status(403).json({ message: "Usuário funcionário necessário." });
  }
  const employee = await getEmployeeForClock(req);
  if (!employee)
    return res.status(404).json({ message: "Funcionário não encontrado." });
  const schedule = await evaluateEmployeeSchedule({
    tenantId: req.auth!.tenantId,
    companyId: employee.company_id,
    employeeId: employee.id,
  });
  res.json(schedule);
});

// Registro principal do app: jornada + GPS/geofence + aparelho vinculado + credencial protegida por biometria nativa.
timeEntriesRouter.post(
  "/secure",
  selfieUpload.single("selfie"),
  async (req, res, next) => {
    try {
      if (req.auth!.role !== "FUNCIONARIO" || !req.auth!.employeeId) {
        return res.status(403).json({
          message: "Registro seguro disponível para usuário funcionário.",
        });
      }
      const parsed = secureSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({
          message: "Dados do registro inválidos.",
          issues: parsed.error.flatten(),
        });
      if (!req.file) {
        return res.status(400).json({
          message:
            "A foto do funcionário é obrigatória antes do registro de ponto.",
          code: "SELFIE_REQUIRED",
        });
      }

      const d = parsed.data;
      const employee = await getEmployeeForClock(req);
      if (!employee)
        return res.status(404).json({ message: "Funcionário não encontrado." });

      const gate = await pool.getConnection();
      const lockName = `pc:punch:${req.auth!.tenantId}:${employee.id}`;
      let locked = false;
      try {
        const [lockRows] = await gate.query<any[]>(
          "SELECT GET_LOCK(?,5) AS acquired",
          [lockName],
        );
        locked = Number(lockRows[0]?.acquired) === 1;
        if (!locked)
          return res.status(409).json({
            message:
              "Uma marcação já está sendo processada. Consulte o histórico antes de tentar novamente.",
            code: "PUNCH_BUSY",
          });
        if (d.requestKey) {
          const [existing] = await gate.query<any[]>(
            "SELECT te.* FROM punch_requests pr JOIN time_entries te ON te.id=pr.time_entry_id AND te.tenant_id=pr.tenant_id WHERE pr.tenant_id=? AND pr.employee_id=? AND pr.request_key=? LIMIT 1",
            [req.auth!.tenantId, employee.id, d.requestKey],
          );
          if (existing[0])
            return res.json({
              ...existing[0],
              replayed: true,
              selfie: { captured: true },
            });
        }
        const schedule = await evaluateEmployeeSchedule({
          tenantId: req.auth!.tenantId,
          companyId: employee.company_id,
          employeeId: employee.id,
        });

        if (schedule.decision === "BLOCKED") {
          await logAttempt({
            tenantId: req.auth!.tenantId,
            companyId: employee.company_id,
            employeeId: employee.id,
            latitude: d.latitude,
            longitude: d.longitude,
            accuracy: d.accuracy,
            mocked: d.locationMocked,
            scheduleDecision: schedule.decision,
            biometricDecision: "NOT_CHECKED",
            deviceUid: d.deviceUid,
            success: false,
            reason: schedule.message,
          });
          return res.status(403).json({
            message: schedule.message,
            code: "SCHEDULE_BLOCKED",
            schedule,
          });
        }

        if (schedule.complete) {
          const message =
            "A jornada de hoje já possui todas as marcações previstas. Solicite um ajuste ao RH se precisar corrigir o ponto.";
          await logAttempt({
            tenantId: req.auth!.tenantId,
            companyId: employee.company_id,
            employeeId: employee.id,
            latitude: d.latitude,
            longitude: d.longitude,
            accuracy: d.accuracy,
            mocked: d.locationMocked,
            scheduleDecision: "BLOCKED",
            biometricDecision: "NOT_CHECKED",
            deviceUid: d.deviceUid,
            success: false,
            reason: message,
          });
          return res
            .status(409)
            .json({ message, code: "SCHEDULE_COMPLETE", schedule });
        }

        const geo = await evaluateEmployeeGeofence({
          tenantId: req.auth!.tenantId,
          companyId: employee.company_id,
          employeeId: employee.id,
          latitude: d.latitude,
          longitude: d.longitude,
          accuracy: d.accuracy,
          mocked: d.locationMocked,
        });
        if (geo.decision === "BLOCKED") {
          await logAttempt({
            tenantId: req.auth!.tenantId,
            companyId: employee.company_id,
            employeeId: employee.id,
            latitude: d.latitude,
            longitude: d.longitude,
            accuracy: d.accuracy,
            mocked: d.locationMocked,
            geoDecision: geo.decision,
            distance: geo.distanceMeters,
            scheduleDecision: schedule.decision,
            biometricDecision: "NOT_CHECKED",
            deviceUid: d.deviceUid,
            success: false,
            reason: geo.message,
          });
          return res.status(403).json({
            message: geo.message,
            code: "GEOFENCE_BLOCKED",
            geo,
            schedule,
          });
        }

        const device = await validateEmployeeDevice({
          tenantId: req.auth!.tenantId,
          companyId: employee.company_id,
          employeeId: employee.id,
          deviceUid: d.deviceUid,
          deviceSecret: d.deviceSecret,
        });
        if (!device.verified) {
          await logAttempt({
            tenantId: req.auth!.tenantId,
            companyId: employee.company_id,
            employeeId: employee.id,
            latitude: d.latitude,
            longitude: d.longitude,
            accuracy: d.accuracy,
            mocked: d.locationMocked,
            geoDecision: geo.decision,
            distance: geo.distanceMeters,
            scheduleDecision: schedule.decision,
            biometricDecision: "REJECTED",
            deviceUid: d.deviceUid,
            success: false,
            reason: device.message,
          });
          return res.status(403).json({
            message: device.message,
            code: device.code || "DEVICE_REJECTED",
            schedule,
          });
        }

        const entryType = (schedule.nextType ||
          d.type ||
          "OTHER") as (typeof entryTypes)[number];
        const biometricVerified = device.policy.requireDeviceBiometric
          ? true
          : null;
        const conn = gate;
        let savedSelfiePath: string | null = null;
        let committed = false;
        try {
          await conn.beginTransaction();
          const [result] = await conn.query<any>(
            `INSERT INTO time_entries
       (tenant_id,company_id,employee_id,entry_type,registered_at,latitude,longitude,accuracy,device_id,source,
        manually_adjusted,created_by_user_id,created_at,location_mocked,device_biometric_verified,
        device_biometric_type,device_binding_id,schedule_decision,scheduled_work_date)
       VALUES (?,?,?, ?,${BRASILIA_NOW_SQL},?,?,?,?, ?,0,?,${BRASILIA_NOW_SQL},?,?,?,?,?,?)`,
            [
              req.auth!.tenantId,
              employee.company_id,
              employee.id,
              entryType,
              d.latitude,
              d.longitude,
              d.accuracy ?? null,
              d.deviceUid,
              d.source,
              req.auth!.userId,
              d.locationMocked ? 1 : 0,
              biometricVerified == null ? null : 1,
              device.policy.requireDeviceBiometric ? d.biometricType : null,
              device.device?.id || null,
              schedule.decision,
              schedule.workDate || null,
            ],
          );
          const timeEntryId = Number(result.insertId);

          await conn.query(
            `INSERT INTO time_entry_geo_checks
       (tenant_id,time_entry_id,work_location_id,distance_meters,within_radius,decision,created_at)
       VALUES (?,?,?,?,?,?,${BRASILIA_NOW_SQL})`,
            [
              req.auth!.tenantId,
              timeEntryId,
              geo.location?.id || null,
              geo.distanceMeters == null
                ? null
                : Math.round(geo.distanceMeters * 100) / 100,
              geo.withinRadius == null ? null : geo.withinRadius ? 1 : 0,
              geo.decision,
            ],
          );

          await conn.query(
            `INSERT INTO time_entry_device_checks
       (tenant_id,time_entry_id,employee_id,device_id,device_uid,biometric_verified,biometric_type,decision,created_at)
       VALUES (?,?,?,?,?,?,?,?,${BRASILIA_NOW_SQL})`,
            [
              req.auth!.tenantId,
              timeEntryId,
              employee.id,
              device.device?.id || null,
              d.deviceUid || null,
              device.policy.requireDeviceBiometric ? 1 : 0,
              device.policy.requireDeviceBiometric ? d.biometricType : null,
              device.required ? "VERIFIED" : "NOT_REQUIRED",
            ],
          );

          await conn.query(
            `INSERT INTO time_entry_schedule_checks
       (tenant_id,time_entry_id,employee_id,work_schedule_id,work_date,weekday,schedule_text,expected_entry_type,decision,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,${BRASILIA_NOW_SQL})`,
            [
              req.auth!.tenantId,
              timeEntryId,
              employee.id,
              schedule.scheduleId || null,
              schedule.workDate || null,
              schedule.weekday ?? null,
              schedule.scheduleText || null,
              entryType,
              schedule.decision,
            ],
          );

          const selfie = await saveTimeEntrySelfie({
            tenantId: req.auth!.tenantId,
            employeeId: employee.id,
            timeEntryId,
            buffer: req.file!.buffer,
            mimeType: req.file!.mimetype,
          });
          savedSelfiePath = selfie.relativePath;

          await conn.query(
            `INSERT INTO time_entry_selfies
       (tenant_id,company_id,employee_id,time_entry_id,file_path,mime_type,file_size,sha256,captured_at,created_at)
       VALUES (?,?,?,?,?,?,?,?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,
            [
              req.auth!.tenantId,
              employee.company_id,
              employee.id,
              timeEntryId,
              selfie.relativePath,
              req.file!.mimetype,
              selfie.fileSize,
              selfie.sha256,
            ],
          );

          if (d.requestKey)
            await conn.query(
              "INSERT INTO punch_requests (tenant_id,employee_id,request_key,time_entry_id) VALUES (?,?,?,?)",
              [req.auth!.tenantId, employee.id, d.requestKey, timeEntryId],
            );
          await conn.commit();
          committed = true;

          await logAttempt({
            tenantId: req.auth!.tenantId,
            companyId: employee.company_id,
            employeeId: employee.id,
            latitude: d.latitude,
            longitude: d.longitude,
            accuracy: d.accuracy,
            mocked: d.locationMocked,
            geoDecision: geo.decision,
            distance: geo.distanceMeters,
            scheduleDecision: schedule.decision,
            biometricDecision: device.policy.requireDeviceBiometric
              ? "VERIFIED"
              : device.policy.employeeBiometricExempt
                ? "EXEMPT"
                : "NOT_REQUIRED",
            deviceUid: d.deviceUid,
            success: true,
          });

          const [rows] = await pool.query<any[]>(
            "SELECT id,registered_at,entry_type,latitude,longitude,accuracy,device_biometric_verified,device_biometric_type,schedule_decision,scheduled_work_date FROM time_entries WHERE id=? AND tenant_id=?",
            [timeEntryId, req.auth!.tenantId],
          );
          res.status(201).json({
            ...rows[0],
            geo,
            schedule,
            device: {
              verified: true,
              deviceUid: d.deviceUid || null,
              biometricVerified: Boolean(biometricVerified),
              biometricExempt: Boolean(device.policy.employeeBiometricExempt),
            },
            selfie: { captured: true },
          });
        } catch (error) {
          if (!committed) {
            await conn.rollback();
            await removeTimeEntrySelfie(savedSelfiePath);
          }
          throw error;
        }
      } finally {
        if (locked)
          await gate
            .query("SELECT RELEASE_LOCK(?)", [lockName])
            .catch(() => {});
        gate.release();
      }
    } catch (error) {
      next(error);
    }
  },
);

timeEntriesRouter.get("/my/requests/:key", async (req, res, next) => {
  try {
    if (!req.auth!.employeeId)
      return res
        .status(403)
        .json({ message: "Usuário funcionário necessário." });
    const [rows] = await pool.query<any[]>(
      "SELECT te.id,te.entry_type,te.registered_at FROM punch_requests pr JOIN time_entries te ON te.id=pr.time_entry_id AND te.tenant_id=pr.tenant_id WHERE pr.tenant_id=? AND pr.employee_id=? AND pr.request_key=? LIMIT 1",
      [req.auth!.tenantId, req.auth!.employeeId, String(req.params.key)],
    );
    if (!rows[0])
      return res.status(404).json({
        message: "Confirmação ainda não encontrada. Tente consultar novamente.",
      });
    res.json({ ...rows[0], selfie: { captured: true } });
  } catch (error) {
    next(error);
  }
});

// Endpoint auxiliar/legado para registros sem segurança obrigatória.
timeEntriesRouter.post("/", async (req, res) => {
  const parsed = clockSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: "Dados inválidos." });
  const d = parsed.data;
  const employee = await getEmployeeForClock(req, d.employeeId);
  if (!employee)
    return res.status(404).json({ message: "Funcionário não encontrado." });

  const policy = await getEmployeeDevicePolicy(
    req.auth!.tenantId,
    employee.company_id,
    employee.id,
  );
  if (
    req.auth!.role === "FUNCIONARIO" &&
    (policy.requireDeviceBiometric || policy.requireRegisteredDevice)
  ) {
    return res.status(403).json({
      message:
        "Esta empresa exige biometria e aparelho vinculado. Use o registro seguro do aplicativo.",
      code: "SECURE_PUNCH_REQUIRED",
    });
  }

  const geo = await evaluateEmployeeGeofence({
    tenantId: req.auth!.tenantId,
    companyId: employee.company_id,
    employeeId: employee.id,
    latitude: d.latitude,
    longitude: d.longitude,
    accuracy: d.accuracy,
    mocked: d.locationMocked,
  });
  if (geo.decision === "BLOCKED")
    return res.status(403).json({ message: geo.message, geo });

  const [result] = await pool.query<any>(
    `INSERT INTO time_entries
     (tenant_id,company_id,employee_id,entry_type,registered_at,latitude,longitude,accuracy,device_id,source,manually_adjusted,created_by_user_id,created_at,location_mocked)
     VALUES (?,?,?, ?,${BRASILIA_NOW_SQL},?,?,?,?,?,0,?,${BRASILIA_NOW_SQL},?)`,
    [
      req.auth!.tenantId,
      employee.company_id,
      employee.id,
      d.type,
      d.latitude || null,
      d.longitude || null,
      d.accuracy || null,
      d.deviceId || null,
      d.source,
      req.auth!.userId,
      d.locationMocked == null ? null : d.locationMocked ? 1 : 0,
    ],
  );
  await pool.query(
    `INSERT INTO time_entry_geo_checks (tenant_id,time_entry_id,work_location_id,distance_meters,within_radius,decision,created_at)
     VALUES (?,?,?,?,?,?,${BRASILIA_NOW_SQL})`,
    [
      req.auth!.tenantId,
      result.insertId,
      geo.location?.id || null,
      geo.distanceMeters == null
        ? null
        : Math.round(geo.distanceMeters * 100) / 100,
      geo.withinRadius == null ? null : geo.withinRadius ? 1 : 0,
      geo.decision,
    ],
  );
  const [rows] = await pool.query<any[]>(
    "SELECT id,registered_at,entry_type,latitude,longitude FROM time_entries WHERE id=? AND tenant_id=?",
    [result.insertId, req.auth!.tenantId],
  );
  res.status(201).json({ ...rows[0], geo });
});

timeEntriesRouter.get("/my/today", async (req, res) => {
  if (!req.auth!.employeeId)
    return res
      .status(400)
      .json({ message: "Usuário não vinculado a funcionário." });
  const [rows] = await pool.query<any[]>(
    `SELECT te.id,te.entry_type,te.registered_at,te.latitude,te.longitude,te.accuracy,te.source,
            te.manually_adjusted,te.device_biometric_verified,te.device_biometric_type,te.device_id,
            te.schedule_decision,te.scheduled_work_date,gc.decision AS geo_decision,gc.distance_meters,
            sc.schedule_text,CASE WHEN sf.id IS NULL THEN 0 ELSE 1 END AS has_selfie
       FROM time_entries te
       LEFT JOIN time_entry_geo_checks gc ON gc.time_entry_id=te.id AND gc.tenant_id=te.tenant_id
       LEFT JOIN time_entry_schedule_checks sc ON sc.time_entry_id=te.id AND sc.tenant_id=te.tenant_id
       LEFT JOIN time_entry_selfies sf ON sf.time_entry_id=te.id AND sf.tenant_id=te.tenant_id
      WHERE te.tenant_id=? AND te.employee_id=? AND DATE(te.registered_at)=${BRASILIA_DATE_SQL}
      ORDER BY te.registered_at`,
    [req.auth!.tenantId, req.auth!.employeeId],
  );
  res.json(rows);
});

timeEntriesRouter.get("/my/history", async (req, res) => {
  if (!req.auth!.employeeId)
    return res
      .status(400)
      .json({ message: "Usuário não vinculado a funcionário." });
  const days = Math.min(60, Math.max(1, Number(req.query.days || 15)));
  const [rows] = await pool.query<any[]>(
    `SELECT te.id,te.entry_type,te.registered_at,te.latitude,te.longitude,te.source,te.manually_adjusted,
            te.device_biometric_verified,te.device_biometric_type,te.device_id,te.schedule_decision,
            te.scheduled_work_date,gc.decision AS geo_decision,gc.distance_meters,sc.schedule_text,
            CASE WHEN sf.id IS NULL THEN 0 ELSE 1 END AS has_selfie
       FROM time_entries te
       LEFT JOIN time_entry_geo_checks gc ON gc.time_entry_id=te.id AND gc.tenant_id=te.tenant_id
       LEFT JOIN time_entry_schedule_checks sc ON sc.time_entry_id=te.id AND sc.tenant_id=te.tenant_id
       LEFT JOIN time_entry_selfies sf ON sf.time_entry_id=te.id AND sf.tenant_id=te.tenant_id
      WHERE te.tenant_id=? AND te.employee_id=?
        AND te.registered_at>=DATE_SUB(${BRASILIA_NOW_SQL},INTERVAL ? DAY)
      ORDER BY te.registered_at DESC`,
    [req.auth!.tenantId, req.auth!.employeeId, days],
  );
  res.json(rows);
});

timeEntriesRouter.get(
  "/",
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH", "GESTOR", "SUPERVISOR"),
  async (req, res) => {
    const start = String(req.query.start || ""),
      end = String(req.query.end || start),
      employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
    const params: any[] = [req.auth!.tenantId],
      clauses: string[] = [];
    if (start) {
      clauses.push("DATE(te.registered_at)>=?");
      params.push(start);
    }
    if (end) {
      clauses.push("DATE(te.registered_at)<=?");
      params.push(end);
    }
    if (employeeId) {
      clauses.push("te.employee_id=?");
      params.push(employeeId);
    }
    const [rows] = await pool.query<any[]>(
      `SELECT te.id,te.employee_id,te.registered_at,te.entry_type,te.latitude,te.longitude,te.accuracy,
            te.source,te.manually_adjusted,te.adjustment_reason,te.location_mocked,
            te.device_biometric_verified,te.device_biometric_type,te.device_id,te.schedule_decision,
            te.scheduled_work_date,e.name AS employee_name,e.registration_number,
            gc.decision AS geo_decision,gc.distance_meters,gc.within_radius,
            COALESCE(wl.name,IF(gc.work_location_id IS NULL AND gc.id IS NOT NULL,'Endereço padrão da empresa',NULL)) AS geo_location_name,
            dc.decision AS device_decision,d.model AS device_model,d.manufacturer AS device_manufacturer,
            sc.schedule_text,CASE WHEN sf.id IS NULL THEN 0 ELSE 1 END AS has_selfie
       FROM time_entries te
       JOIN employees e ON e.id=te.employee_id AND e.tenant_id=te.tenant_id
       LEFT JOIN time_entry_geo_checks gc ON gc.time_entry_id=te.id AND gc.tenant_id=te.tenant_id
       LEFT JOIN work_locations wl ON wl.id=gc.work_location_id AND wl.tenant_id=gc.tenant_id
       LEFT JOIN time_entry_device_checks dc ON dc.time_entry_id=te.id AND dc.tenant_id=te.tenant_id
       LEFT JOIN devices d ON d.id=dc.device_id AND d.tenant_id=dc.tenant_id
       LEFT JOIN time_entry_schedule_checks sc ON sc.time_entry_id=te.id AND sc.tenant_id=te.tenant_id
       LEFT JOIN time_entry_selfies sf ON sf.time_entry_id=te.id AND sf.tenant_id=te.tenant_id
      WHERE te.tenant_id=? ${clauses.length ? "AND " + clauses.join(" AND ") : ""}
      ORDER BY te.registered_at DESC LIMIT 2000`,
      params,
    );
    res.json(rows);
  },
);

timeEntriesRouter.get("/:id/selfie", async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await pool.query<any[]>(
    `SELECT sf.file_path,sf.mime_type,sf.employee_id
       FROM time_entry_selfies sf
       JOIN time_entries te ON te.id=sf.time_entry_id AND te.tenant_id=sf.tenant_id
      WHERE sf.tenant_id=? AND sf.time_entry_id=?
      LIMIT 1`,
    [req.auth!.tenantId, id],
  );
  const selfie = rows[0];
  if (!selfie)
    return res
      .status(404)
      .json({ message: "Foto da marcação não encontrada." });

  if (
    req.auth!.role === "FUNCIONARIO" &&
    Number(req.auth!.employeeId) !== Number(selfie.employee_id)
  ) {
    return res
      .status(403)
      .json({ message: "Sem permissão para visualizar esta foto." });
  }

  const file = await readTimeEntrySelfie(selfie.file_path);
  res.setHeader("Content-Type", selfie.mime_type || "image/jpeg");
  res.setHeader("Cache-Control", "private, no-store");
  res.send(file);
});

const manualSchema = z.object({
  employeeId: z.number().int().positive(),
  registeredAt: z.string().min(16),
  type: z.enum(entryTypes).default("OTHER"),
  reason: z.string().min(3).max(500),
});
timeEntriesRouter.post(
  "/manual",
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH", "GESTOR"),
  async (req, res) => {
    const parsed = manualSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: "Dados inválidos." });
    const d = parsed.data;
    const [employees] = await pool.query<any[]>(
      "SELECT id,company_id FROM employees WHERE id=? AND tenant_id=? AND active=1 LIMIT 1",
      [d.employeeId, req.auth!.tenantId],
    );
    if (!employees[0])
      return res.status(404).json({ message: "Funcionário não encontrado." });
    const normalized = d.registeredAt.replace("T", " ").slice(0, 19);
    const [result] = await pool.query<any>(
      `INSERT INTO time_entries (tenant_id,company_id,employee_id,entry_type,registered_at,source,manually_adjusted,adjustment_reason,created_by_user_id,created_at)
     VALUES (?,?,?,?,?,'MANUAL',1,?,?,${BRASILIA_NOW_SQL})`,
      [
        req.auth!.tenantId,
        employees[0].company_id,
        d.employeeId,
        d.type,
        normalized,
        d.reason,
        req.auth!.userId,
      ],
    );
    await writeAudit(
      req,
      "MANUAL_CREATE",
      "time_entry",
      Number(result.insertId),
      undefined,
      d,
    );
    res.status(201).json({ id: Number(result.insertId) });
  },
);

timeEntriesRouter.delete(
  "/:id",
  requireRole("SUPER_ADMIN", "TENANT_ADMIN", "RH"),
  async (req, res) => {
    const id = Number(req.params.id);
    const [rows] = await pool.query<any[]>(
      "SELECT * FROM time_entries WHERE id=? AND tenant_id=? LIMIT 1",
      [id, req.auth!.tenantId],
    );
    if (!rows[0])
      return res.status(404).json({ message: "Registro não encontrado." });
    await pool.query("DELETE FROM time_entries WHERE id=? AND tenant_id=?", [
      id,
      req.auth!.tenantId,
    ]);
    await writeAudit(req, "DELETE", "time_entry", id, rows[0]);
    res.json({ ok: true });
  },
);

// Read-only: the employee sees only their own latest payroll calculations.
timeEntriesRouter.get("/my/summary", async (req, res, next) => {
  if (req.auth!.role !== "FUNCIONARIO" || !req.auth!.employeeId) return res.status(403).json({ message: "Usuário funcionário necessário." });
  const days = Number(req.query.days || 15);
  if (!Number.isInteger(days) || days < 1 || days > 60) return res.status(400).json({ message: "Consulte de 1 a 60 dias." });
  try {
    const [rows] = await pool.query<any[]>(`SELECT work_date,expected_minutes,worked_minutes,time_bank_minutes,processed_at
      FROM daily_time_calculations WHERE tenant_id=? AND employee_id=?
      AND work_date >= DATE_SUB(${BRASILIA_DATE_SQL}, INTERVAL ? DAY) AND work_date <= ${BRASILIA_DATE_SQL} ORDER BY work_date DESC`, [req.auth!.tenantId, req.auth!.employeeId, days - 1]);
    res.setHeader("Cache-Control", "no-store"); res.json(rows);
  } catch (error) { next(error); }
});
