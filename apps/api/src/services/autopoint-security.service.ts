import { createHmac, randomBytes, randomInt } from "node:crypto";

export type AutoPointSettingsInput = {
  enabled?: boolean;
  scanIntervalSeconds?: number;
  resultDisplaySeconds?: number;
  cooldownSeconds?: number;
};

export type AutoPointSettings = {
  enabled: boolean;
  scanIntervalSeconds: number;
  resultDisplaySeconds: number;
  cooldownSeconds: number;
};

function bounded(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function normalizeAutoPointSettings(
  input: AutoPointSettingsInput,
): AutoPointSettings {
  return {
    enabled: Boolean(input.enabled),
    scanIntervalSeconds: bounded(input.scanIntervalSeconds, 3, 1, 10),
    resultDisplaySeconds: bounded(input.resultDisplaySeconds, 3, 1, 10),
    cooldownSeconds: bounded(input.cooldownSeconds, 10, 5, 120),
  };
}

export function hashAutoPointSecret(value: string, serverSecret: string) {
  return createHmac("sha256", serverSecret).update(value).digest("hex");
}

export function createActivationCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function createTerminalToken() {
  return randomBytes(32).toString("hex");
}
