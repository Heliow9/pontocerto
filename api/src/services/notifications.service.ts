import webpush from "web-push";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import {
  dueReminders,
  reminderEvents,
  type ReminderEvent,
} from "./reminder-times.js";

export const webPushReady = () =>
  Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
export async function employeeReminderEvents(
  employee: {
    id: number;
    tenant_id: number;
    company_id: number;
    work_schedule_id: number;
  },
  now = Date.now(),
  preview = false,
) {
  const today = new Date(now - 3 * 3600000).toISOString().slice(0, 10);
  const dateAt = (offset: number) =>
    new Date(Date.parse(`${today}T12:00:00Z`) + offset * 86400000)
      .toISOString()
      .slice(0, 10);
  const start = dateAt(-2),
    end = dateAt(preview ? 7 : 1);
  const [days] = await pool.query<any[]>(
    "SELECT weekday,is_day_off,entry_1,exit_1,entry_2,exit_2 FROM work_schedule_days WHERE tenant_id=? AND work_schedule_id=?",
    [employee.tenant_id, employee.work_schedule_id],
  );
  const [holidays] = await pool.query<any[]>(
    "SELECT holiday_date FROM holidays WHERE tenant_id=? AND (company_id IS NULL OR company_id=?) AND holiday_date BETWEEN ? AND ?",
    [employee.tenant_id, employee.company_id, start, end],
  );
  const [absences] = await pool.query<any[]>(
    "SELECT start_date,end_date FROM absences WHERE tenant_id=? AND employee_id=? AND status='APPROVED' AND start_date<=? AND end_date>=?",
    [employee.tenant_id, employee.id, end, start],
  );
  const [punches] = await pool.query<any[]>(
    "SELECT entry_type,registered_at,scheduled_work_date FROM time_entries WHERE tenant_id=? AND employee_id=? AND registered_at BETWEEN ? AND ?",
    [employee.tenant_id, employee.id, `${start} 00:00:00`, `${end} 23:59:59`],
  );
  const events: ReminderEvent[] = [];
  for (let offset = -2; offset <= (preview ? 7 : 1); offset++) {
    const date = dateAt(offset),
      weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const day = days.find((d) => Number(d.weekday) === weekday);
    if (
      !day ||
      holidays.some((h) => h.holiday_date.slice(0, 10) === date) ||
      absences.some(
        (a) =>
          a.start_date.slice(0, 10) <= date && a.end_date.slice(0, 10) >= date,
      )
    )
      continue;
    const candidates = preview
      ? reminderEvents(day, date).filter((e) => e.remindAt > now)
      : dueReminders(day, date, now);
    for (const event of candidates) {
      const done = punches.some(
        (p) =>
          p.entry_type === event.type &&
          (p.scheduled_work_date
            ? p.scheduled_work_date.slice(0, 10) === date
            : p.registered_at.slice(0, 10) ===
              new Date(event.target - 3 * 3600000).toISOString().slice(0, 10)),
      );
      if (!done) events.push(event);
    }
  }
  return events.sort((a, b) => a.target - b.target);
}
async function send(subscription: any, event: ReminderEvent) {
  const title = "Ponto Certo · lembrete de ponto",
    body = `Faltam 5 minutos para sua ${event.label}, às ${event.time}.`;
  if (subscription.kind === "WEB") {
    if (!webPushReady()) throw new Error("VAPID_NOT_CONFIGURED");
    await webpush.sendNotification(
      JSON.parse(subscription.destination),
      JSON.stringify({
        title,
        body,
        url: "/?tab=home",
        tag: event.key,
        expiresAt: event.target,
      }),
      {
        TTL: 60,
        timeout: 10000,
        urgency: "high",
        vapidDetails: {
          subject: env.VAPID_SUBJECT,
          publicKey: env.VAPID_PUBLIC_KEY!,
          privateKey: env.VAPID_PRIVATE_KEY!,
        },
      },
    );
  } else {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.EXPO_ACCESS_TOKEN
          ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        to: subscription.destination,
        title,
        body,
        sound: "default",
        priority: "high",
        channelId: "ponto-reminders",
        ttl: 60,
        data: { url: "/?tab=home", expiresAt: event.target },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`EXPO_HTTP_${response.status}`);
    const result: any = await response.json();
    if (result.data?.status !== "ok") {
      const error: any = new Error(
        result.data?.details?.error || "EXPO_REJECTED",
      );
      if (result.data?.details?.error === "DeviceNotRegistered")
        error.statusCode = 410;
      throw error;
    }
  }
}
let running = false;
export async function runReminderTick(now = Date.now()) {
  if (running) return;
  running = true;
  try {
    const [subscriptions] = await pool.query<
      any[]
    >(`SELECT n.*,e.company_id,e.work_schedule_id FROM notification_subscriptions n
      JOIN employees e ON e.id=n.employee_id AND e.tenant_id=n.tenant_id AND e.active=1
      JOIN companies c ON c.id=e.company_id AND c.tenant_id=e.tenant_id AND c.active=1
      JOIN work_schedules s ON s.id=e.work_schedule_id AND s.tenant_id=e.tenant_id AND s.company_id=e.company_id AND s.active=1
      WHERE n.enabled=1 AND EXISTS (SELECT 1 FROM users u WHERE u.tenant_id=n.tenant_id AND u.employee_id=n.employee_id AND u.active=1)`);
    const cache = new Map<string, ReminderEvent[]>();
    for (const subscription of subscriptions) {
      if (subscription.kind === "WEB" && !webPushReady()) continue;
      const key = `${subscription.tenant_id}:${subscription.employee_id}`;
      if (!cache.has(key))
        cache.set(
          key,
          await employeeReminderEvents(
            { ...subscription, id: subscription.employee_id },
            now,
          ),
        );
      for (const event of cache.get(key)!) {
        // Expired reminders are skipped rather than replayed after downtime.
        if (Date.now() >= event.target) continue;
        const [claim] = await pool.query<any>(
          `INSERT IGNORE INTO notification_deliveries(subscription_id,event_key,status,created_at) VALUES (?,?,'CLAIMED',${BRASILIA_NOW_SQL})`,
          [subscription.id, event.key],
        );
        if (!claim.affectedRows) continue;
        try {
          await send(subscription, event);
          await pool.query(
            "UPDATE notification_deliveries SET status='SENT' WHERE id=?",
            [claim.insertId],
          );
        } catch (error: any) {
          await pool.query(
            "UPDATE notification_deliveries SET status='FAILED' WHERE id=?",
            [claim.insertId],
          );
          if ([404, 410].includes(error.statusCode))
            await pool.query(
              "UPDATE notification_subscriptions SET enabled=0 WHERE id=?",
              [subscription.id],
            );
          console.warn(
            "Falha no lembrete",
            subscription.id,
            error.statusCode || "PUSH_FAILED",
          );
        }
      }
    }
    await pool.query(
      `DELETE FROM notification_deliveries WHERE created_at<DATE_SUB(${BRASILIA_NOW_SQL},INTERVAL 30 DAY)`,
    );
  } finally {
    running = false;
  }
}
export function startReminderWorker() {
  if (env.REMINDER_WORKER_ENABLED !== "1") return;
  const tick = () => {
    void runReminderTick().catch((error) =>
      console.warn(
        "Lembretes indisponíveis: confira migração 011 e configurações.",
        error.code || "PUSH_FAILED",
      ),
    );
  };
  const timer = setInterval(tick, 15000);
  timer.unref();
  tick();
  return timer;
}
