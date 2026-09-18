import "dotenv/config";
import { z } from "zod";

const emptyToUndefined = (value: unknown) => value === "" ? undefined : value;

const schema = z.object({
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("https://pontoocerto.duckdns.org"),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  REMINDER_WORKER_ENABLED: z.enum(["0","1"]).default("1"),
  FINANCIAL_WORKER_ENABLED: z.enum(["0","1"]).default("1"),
  INTER_ENABLED: z.enum(["0","1"]).default("0"),
  INTER_ENV: z.enum(["production","sandbox"]).default("production"),
  INTER_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  INTER_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  INTER_CERT_PATH: z.preprocess(emptyToUndefined, z.string().optional()),
  INTER_KEY_PATH: z.preprocess(emptyToUndefined, z.string().optional()),
  INTER_ACCOUNT: z.preprocess(emptyToUndefined, z.string().optional()),
  INTER_BILLING_CANCEL_DAYS: z.coerce.number().int().min(0).max(60).default(30),
  INTER_WEBHOOK_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  PORT: z.coerce.number().default(3333),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MYSQL_HOST: z.string().min(1),
  MYSQL_PORT: z.coerce.number().default(3306),
  MYSQL_DATABASE: z.string().min(1),
  MYSQL_USER: z.string().min(1),
  MYSQL_PASSWORD: z.string(),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("8h"),
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:8081"),
  MAPBOX_ACCESS_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
  SELFIE_STORAGE_DIR: z.string().default("./storage/selfies"),
  SELFIE_MAX_IMAGE_MB: z.coerce.number().min(1).max(15).default(6),
  FACE_PROVIDER: z.enum(["DISABLED", "AWS_REKOGNITION"]).default("DISABLED"),
  FACE_MAX_IMAGE_MB: z.coerce.number().min(1).max(15).default(5),
  FACE_MATCH_THRESHOLD: z.coerce.number().min(80).max(100).default(95),
  AWS_REGION: z.preprocess(emptyToUndefined, z.string().optional())
});

export const env = schema.parse(process.env);
