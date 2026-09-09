import "dotenv/config";
import { z } from "zod";

const emptyToUndefined = (value: unknown) => value === "" ? undefined : value;

const schema = z.object({
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
  // Compatibilidade com rotas antigas de reconhecimento facial. Nesta versão o provedor fica desativado.
  FACE_PROVIDER: z.string().default("DISABLED"),
  FACE_MAX_IMAGE_MB: z.coerce.number().min(1).max(15).default(6)
});

export const env = schema.parse(process.env);
