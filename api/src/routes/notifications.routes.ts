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
import { env } from "../config/env.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import {
  employeeReminderEvents,
  webPushReady,
} from "../services/notifications.service.js";
import { permittedPushEndpoint } from "../services/reminder-times.js";
export const notificationsRouter = Router();
notificationsRouter.use(authMiddleware, requireRole("FUNCIONARIO"));
notificationsRouter.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!req.auth!.employeeId)
    return res.status(403).json({ message: "Funcionário não vinculado." });
  next();
});
const safe =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
notificationsRouter.get(
  "/settings",
  safe(async (req, res) => {
    const [rows] = await pool.query<any[]>(
      "SELECT device_key,kind,enabled FROM notification_subscriptions WHERE tenant_id=? AND employee_id=?",
      [req.auth!.tenantId, req.auth!.employeeId],
    );
    res.json({
      publicKey: env.VAPID_PUBLIC_KEY || null,
      webReady: webPushReady() && env.REMINDER_WORKER_ENABLED === "1",
      workerEnabled: env.REMINDER_WORKER_ENABLED === "1",
      subscriptions: rows,
      minutesBefore: 5,
    });
  }),
);
notificationsRouter.get(
  "/upcoming",
  safe(async (req, res) => {
    const [rows] = await pool.query<any[]>(
      `SELECT e.id,e.tenant_id,e.company_id,e.work_schedule_id FROM employees e JOIN work_schedules s ON s.id=e.work_schedule_id AND s.tenant_id=e.tenant_id AND s.company_id=e.company_id AND s.active=1 WHERE e.tenant_id=? AND e.id=? AND e.active=1`,
      [req.auth!.tenantId, req.auth!.employeeId],
    );
    res.json({
      events: rows[0]
        ? await employeeReminderEvents(rows[0], Date.now(), true)
        : [],
    });
  }),
);
const schema = z
  .object({
    deviceKey: z.string().regex(/^[a-zA-Z0-9_-]{16,80}$/),
    kind: z.enum(["WEB", "EXPO"]),
    subscription: z
      .object({
        endpoint: z.string().max(2048).refine(permittedPushEndpoint),
        keys: z.object({
          p256dh: z.string().regex(/^[\w-]{80,100}={0,2}$/),
          auth: z.string().regex(/^[\w-]{20,30}={0,2}$/),
        }),
      })
      .optional(),
    token: z
      .string()
      .regex(/^(ExponentPushToken|ExpoPushToken)\[[\w-]+\]$/)
      .max(300)
      .optional(),
  })
  .strict();
notificationsRouter.put(
  "/subscription",
  safe(async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ message: "Assinatura de notificação inválida." });
    const value = parsed.data;
    if (
      env.REMINDER_WORKER_ENABLED !== "1" ||
      (value.kind === "WEB" && !webPushReady())
    )
      return res
        .status(503)
        .json({
          message: "O servidor ainda precisa habilitar as notificações.",
        });
    if (
      (value.kind === "WEB" && !value.subscription) ||
      (value.kind === "EXPO" && !value.token)
    )
      return res
        .status(400)
        .json({ message: "Destino de notificação ausente." });
    const destination =
      value.kind === "WEB" ? JSON.stringify(value.subscription) : value.token!;
    const hash = createHash("sha256")
      .update(
        value.kind === "WEB" ? value.subscription!.endpoint : value.token!,
      )
      .digest("hex");
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        "DELETE FROM notification_subscriptions WHERE tenant_id=? AND employee_id=? AND device_key=? AND endpoint_hash<>?",
        [req.auth!.tenantId, req.auth!.employeeId, value.deviceKey, hash],
      );
      await conn.query(
        `INSERT INTO notification_subscriptions(tenant_id,employee_id,device_key,kind,endpoint_hash,destination,enabled,updated_at) VALUES (?,?,?,?,?,?,1,${BRASILIA_NOW_SQL}) ON DUPLICATE KEY UPDATE tenant_id=VALUES(tenant_id),employee_id=VALUES(employee_id),device_key=VALUES(device_key),kind=VALUES(kind),destination=VALUES(destination),enabled=1,updated_at=VALUES(updated_at)`,
        [
          req.auth!.tenantId,
          req.auth!.employeeId,
          value.deviceKey,
          value.kind,
          hash,
          destination,
        ],
      );
      await conn.commit();
      res.json({ enabled: true });
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }),
);
notificationsRouter.delete(
  "/subscription/:deviceKey",
  safe(async (req, res) => {
    await pool.query(
      "UPDATE notification_subscriptions SET enabled=0 WHERE tenant_id=? AND employee_id=? AND device_key=?",
      [req.auth!.tenantId, req.auth!.employeeId, req.params.deviceKey],
    );
    res.json({ enabled: false });
  }),
);
