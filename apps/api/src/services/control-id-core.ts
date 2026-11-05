import { createHmac } from "node:crypto";

export type ControlIdJobType =
  | "UPSERT_USER"
  | "UPSERT_FACE"
  | "DELETE_FACE"
  | "DELETE_USER";

export type ControlIdPushJob = {
  id: number;
  jobType: ControlIdJobType;
  payload: Record<string, unknown>;
};

export type ControlIdPushCommand = {
  verb: "POST";
  endpoint: string;
  body: unknown;
  contentType: "application/json" | "application/octet-stream";
  queryString?: string;
};

export type ControlIdAccessLogChange = {
  logId: string;
  occurredAtUnix: number;
  event: number;
  userId: string;
  identifierId: number;
  logTypeId: number;
  values: Record<string, unknown>;
};

function integer(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error(`Monitor Control iD: ${field} inválido.`);
  return number;
}

function positiveIdentifier(value: unknown, field: string) {
  const normalized = String(value ?? "").trim();
  if (!/^\d{1,20}$/.test(normalized))
    throw new Error(`Monitor Control iD: ${field} inválido.`);
  return normalized;
}

export function hashControlIdSecret(secret: string, pepper: string) {
  return createHmac("sha256", pepper).update(secret).digest("hex");
}

export function readBearerToken(header: unknown) {
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+([a-fA-F0-9]{64})$/i.exec(header.trim());
  return match ? match[1].toLowerCase() : null;
}

export function normalizeControlIdSerial(value: unknown) {
  const serial = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s/-]+/g, "");
  if (!/^[A-Z0-9]{8,32}$/.test(serial))
    throw new Error("Número de série Control iD inválido.");
  return serial;
}

export function parseControlIdDao(body: unknown): {
  deviceId: string;
  changes: ControlIdAccessLogChange[];
} {
  if (!body || typeof body !== "object")
    throw new Error("Monitor Control iD: envelope inválido.");
  const envelope = body as Record<string, unknown>;
  if (!Array.isArray(envelope.object_changes))
    throw new Error("Monitor Control iD: object_changes inválido.");
  const deviceId = positiveIdentifier(envelope.device_id, "device_id");
  const changes: ControlIdAccessLogChange[] = [];
  for (const item of envelope.object_changes) {
    if (!item || typeof item !== "object") continue;
    const change = item as Record<string, unknown>;
    if (change.object !== "access_logs" || change.type !== "inserted") continue;
    if (!change.values || typeof change.values !== "object")
      throw new Error("Monitor Control iD: values inválido.");
    const values = change.values as Record<string, unknown>;
    changes.push({
      logId: positiveIdentifier(values.id, "access_logs.id"),
      occurredAtUnix: integer(values.time, "access_logs.time"),
      event: integer(values.event, "access_logs.event"),
      userId: positiveIdentifier(values.user_id, "access_logs.user_id"),
      identifierId: integer(values.identifier_id ?? 0, "access_logs.identifier_id"),
      logTypeId: integer(values.log_type_id ?? -1, "access_logs.log_type_id"),
      values,
    });
  }
  return { deviceId, changes };
}

function vendorUserId(payload: Record<string, unknown>) {
  const value = Number(payload.vendorUserId);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error("Usuário Control iD inválido.");
  return value;
}

export function buildControlIdPushCommand(
  job: ControlIdPushJob,
): ControlIdPushCommand {
  const id = vendorUserId(job.payload);
  if (job.jobType === "UPSERT_USER") {
    const name = String(job.payload.name ?? "").trim();
    const registration = String(job.payload.registration ?? "").trim();
    if (!name || !registration)
      throw new Error("Cadastro Control iD incompleto.");
    return {
      verb: "POST",
      endpoint: "create_or_modify_objects",
      body: { object: "users", values: [{ id, name, registration }] },
      contentType: "application/json",
    };
  }
  if (job.jobType === "UPSERT_FACE") {
    const imageBase64 = String(job.payload.imageBase64 ?? "");
    const timestamp = Number(job.payload.timestamp);
    if (!imageBase64 || !Number.isSafeInteger(timestamp) || timestamp < 1)
      throw new Error("Foto Control iD incompleta.");
    return {
      verb: "POST",
      endpoint: "user_set_image",
      body: imageBase64,
      queryString: `user_id=${id}&timestamp=${timestamp}&match=1`,
      contentType: "application/octet-stream",
    };
  }
  if (job.jobType === "DELETE_FACE") {
    return {
      verb: "POST",
      endpoint: "user_destroy_image",
      body: { user_id: id },
      contentType: "application/json",
    };
  }
  return {
    verb: "POST",
    endpoint: "destroy_objects",
    body: { object: "users", where: { users: { id } } },
    contentType: "application/json",
  };
}

export function controlIdResultDecision(args: {
  currentStatus: string;
  attempts: number;
  error: string | null;
}) {
  if (args.currentStatus === "SUCCEEDED")
    return { status: "SUCCEEDED" as const, retry: false };
  if (!args.error)
    return { status: "SUCCEEDED" as const, retry: false };
  if (args.attempts >= 5)
    return { status: "DEAD" as const, retry: false };
  return { status: "FAILED" as const, retry: true };
}

export function controlIdResultError(response: unknown, outerError: unknown) {
  if (outerError != null && outerError !== "") return String(outerError).slice(0, 1000);
  let parsed = response;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const result = parsed as Record<string, unknown>;
  if (result.success !== false) return null;
  if (Array.isArray(result.errors)) {
    const messages = result.errors
      .map((item) =>
        item && typeof item === "object"
          ? String((item as Record<string, unknown>).message ?? (item as Record<string, unknown>).code ?? "")
          : String(item ?? ""),
      )
      .filter(Boolean);
    if (messages.length) return messages.join("; ").slice(0, 1000);
  }
  return "O equipamento rejeitou o comando facial.";
}

export function controlIdIsFacialAccess(values: Record<string, unknown>) {
  const populated = (value: unknown) => {
    const text = String(value ?? "").trim();
    return text !== "" && text !== "0";
  };
  if (
    populated(values.card_value) ||
    populated(values.pin_value) ||
    populated(values.qrcode_value) ||
    populated(values.uhf_tag)
  )
    return false;
  return Number(values.confidence ?? 0) > 0;
}
