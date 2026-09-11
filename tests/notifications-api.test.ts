import { beforeEach, afterEach, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  send: vi.fn(),
}));
vi.mock("../apps/api/src/db/pool.js", () => ({
  pool: { query: mocks.query, getConnection: async () => mocks },
}));
vi.mock("web-push", () => ({ default: { sendNotification: mocks.send } }));
vi.mock("../apps/api/src/config/env.js", () => ({
  env: {
    JWT_SECRET: "notification-test",
    VAPID_PUBLIC_KEY: "test",
    VAPID_PRIVATE_KEY: "test",
    VAPID_SUBJECT: "https://example.test",
    REMINDER_WORKER_ENABLED: "1",
  },
}));
import { notificationsRouter } from "../apps/api/src/routes/notifications.routes";
import {
  employeeReminderEvents,
  runReminderTick,
} from "../apps/api/src/services/notifications.service";
const app = express();
app.use(express.json());
app.use("/notifications", notificationsRouter);
const token = (role = "FUNCIONARIO") =>
  jwt.sign(
    { tenantId: 7, employeeId: 11, userId: 3, role },
    "notification-test",
  );
const auth = { type: "bearer" as const };
const now = Date.parse("2026-09-10T09:55:15Z");
const employee = { id: 11, tenant_id: 7, company_id: 2, work_schedule_id: 5 };
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(now);
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM work_schedule_days"))
      return [
        [
          {
            weekday: 4,
            is_day_off: 0,
            entry_1: "07:00:00",
            exit_1: "12:00:00",
            entry_2: "13:00:00",
            exit_2: "17:00:00",
          },
        ],
      ];
    if (
      sql.includes("FROM holidays") ||
      sql.includes("FROM absences") ||
      sql.includes("FROM time_entries")
    )
      return [[]];
    return [{ affectedRows: 1, insertId: 1 }];
  });
});
afterEach(() => vi.restoreAllMocks());
it("disables only the authenticated employee's device", async () => {
  const result = await request(app)
    .delete("/notifications/subscription/push-test-device-1")
    .auth(token(), auth);
  expect(result.status).toBe(200);
  expect(mocks.query.mock.calls[0][1]).toEqual([7, 11, "push-test-device-1"]);
});
it("rejects managers, unauthenticated subscriptions and untrusted push endpoints", async () => {
  expect((await request(app).get("/notifications/settings")).status).toBe(401);
  expect(
    (
      await request(app)
        .get("/notifications/settings")
        .auth(token("TENANT_ADMIN"), auth)
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .put("/notifications/subscription")
        .auth(token(), auth)
        .send({
          deviceKey: "push-test-device-1",
          kind: "WEB",
          subscription: {
            endpoint: "https://127.0.0.1/internal",
            keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) },
          },
        })
    ).status,
  ).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("skips holidays, approved absences and already registered punches", async () => {
  expect(await employeeReminderEvents(employee, now)).toHaveLength(1);
  const original = mocks.query.getMockImplementation()!;
  for (const [fragment, rows] of [
    ["FROM holidays", [{ holiday_date: "2026-09-10" }]],
    ["FROM absences", [{ start_date: "2026-09-09", end_date: "2026-09-11" }]],
    [
      "FROM time_entries",
      [
        {
          entry_type: "CLOCK_IN",
          registered_at: "2026-09-10 06:54:00",
          scheduled_work_date: "2026-09-10",
        },
      ],
    ],
  ] as const) {
    mocks.query.mockImplementation(async (sql: string, ...args: any[]) =>
      sql.includes(fragment) ? [rows] : original(sql, ...args),
    );
    expect(await employeeReminderEvents(employee, now)).toEqual([]);
  }
});
it("claims each event once across worker ticks and uses the employee id, not the subscription id", async () => {
  const original = mocks.query.getMockImplementation()!;
  let claimed = false;
  mocks.query.mockImplementation(async (sql: string, ...args: any[]) => {
    if (sql.includes("SELECT n.*"))
      return [
        [
          {
            ...employee,
            id: 90,
            employee_id: 11,
            kind: "WEB",
            destination: JSON.stringify({
              endpoint: "https://fcm.googleapis.com/test",
              keys: {},
            }),
          },
        ],
      ];
    if (sql.includes("INSERT IGNORE INTO notification_deliveries")) {
      if (claimed) return [{ affectedRows: 0 }];
      claimed = true;
      return [{ affectedRows: 1, insertId: 123 }];
    }
    return original(sql, ...args);
  });
  await runReminderTick(now);
  await runReminderTick(now);
  expect(mocks.send).toHaveBeenCalledOnce();
  expect(JSON.parse(mocks.send.mock.calls[0][1]).body).toBe(
    "Faltam 5 minutos para sua entrada, às 07:00.",
  );
  expect(
    mocks.query.mock.calls
      .find(([sql]) => sql.includes("FROM time_entries"))?.[1]
      .slice(0, 2),
  ).toEqual([7, 11]);
});
it("disables revoked subscriptions instead of sending indefinitely", async () => {
  const original = mocks.query.getMockImplementation()!;
  mocks.query.mockImplementation(async (sql: string, ...args: any[]) =>
    sql.includes("SELECT n.*")
      ? [
          [
            {
              ...employee,
              id: 90,
              employee_id: 11,
              kind: "WEB",
              destination: "{}",
            },
          ],
        ]
      : original(sql, ...args),
  );
  mocks.send.mockRejectedValueOnce({ statusCode: 410 });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await runReminderTick(now);
  expect(
    mocks.query.mock.calls.some(
      ([sql, args]) => sql.includes("SET enabled=0") && args[0] === 90,
    ),
  ).toBe(true);
});
