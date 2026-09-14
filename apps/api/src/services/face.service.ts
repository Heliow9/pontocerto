import { createHash, createHmac } from "node:crypto";
import { env } from "../config/env.js";

const PROVIDER = "AWS_REKOGNITION" as const;
const SERVICE = "rekognition";
const CONTENT_TYPE = "application/x-amz-json-1.1";

export type FaceVerificationResult = {
  verified: boolean;
  similarity: number;
  threshold: number;
  provider: string;
  collectionId: string | null;
  matchedFaceId?: string | null;
  matchedExternalImageId?: string | null;
  code?: string;
};

class FaceServiceError extends Error {
  code: string;
  status: number;
  providerCode?: string;

  constructor(message: string, code: string, status = 503, providerCode?: string) {
    super(message);
    this.name = "FaceServiceError";
    this.code = code;
    this.status = status;
    this.providerCode = providerCode;
  }
}

export function collectionId(tenantId: number) {
  return `ponto-certo-tenant-${tenantId}`;
}

export function externalImageId(tenantId: number, employeeId: number) {
  return `tenant-${tenantId}-employee-${employeeId}`;
}

export function faceProviderStatus() {
  const enabled = env.FACE_PROVIDER === PROVIDER;
  const configured = Boolean(
    enabled &&
      env.AWS_REGION &&
      env.AWS_ACCESS_KEY_ID &&
      env.AWS_SECRET_ACCESS_KEY,
  );
  return {
    provider: env.FACE_PROVIDER,
    enabled,
    configured,
    region: env.AWS_REGION || null,
    threshold: Number(env.FACE_MATCH_THRESHOLD || 90),
  };
}

function assertConfigured() {
  const status = faceProviderStatus();
  if (env.FACE_PROVIDER !== PROVIDER) {
    throw new FaceServiceError(
      "Reconhecimento facial está desativado no servidor.",
      "FACE_PROVIDER_DISABLED",
      503,
    );
  }
  if (!status.configured) {
    throw new FaceServiceError(
      "AWS Rekognition não está configurado. Informe região, Access Key e Secret Access Key no servidor.",
      "FACE_PROVIDER_NOT_CONFIGURED",
      503,
    );
  }
  return {
    region: env.AWS_REGION!,
    accessKeyId: env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: env.AWS_SESSION_TOKEN,
  };
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function signingKey(secret: string, date: string, region: string) {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, SERVICE);
  return hmac(serviceKey, "aws4_request");
}

function amzDate(now: Date) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function normalizeProviderCode(value: unknown) {
  const raw = String(value || "AWS_REKOGNITION_ERROR");
  const parts = raw.split(/[#:]/);
  return parts[parts.length - 1] || raw;
}

async function rekognitionRequest<T extends Record<string, any>>(
  operation: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const credentials = assertConfigured();
  const host = `rekognition.${credentials.region}.amazonaws.com`;
  const endpoint = `https://${host}/`;
  const body = JSON.stringify(payload);
  const now = new Date();
  const timestamp = amzDate(now);
  const date = timestamp.slice(0, 8);
  const target = `RekognitionService.${operation}`;
  const headersToSign: Record<string, string> = {
    "content-type": CONTENT_TYPE,
    host,
    "x-amz-date": timestamp,
    "x-amz-target": target,
  };
  if (credentials.sessionToken)
    headersToSign["x-amz-security-token"] = credentials.sessionToken;

  const signedHeaderNames = Object.keys(headersToSign).sort();
  const canonicalHeaders = signedHeaderNames
    .map((key) => `${key}:${headersToSign[key].trim()}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256(body),
  ].join("\n");
  const scope = `${date}/${credentials.region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    timestamp,
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  const signature = createHmac(
    "sha256",
    signingKey(credentials.secretAccessKey, date, credentials.region),
  )
    .update(stringToSign)
    .digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": CONTENT_TYPE,
        Host: host,
        "X-Amz-Date": timestamp,
        "X-Amz-Target": target,
        ...(credentials.sessionToken
          ? { "X-Amz-Security-Token": credentials.sessionToken }
          : {}),
        Authorization: authorization,
      },
      body,
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error: any) {
    throw new FaceServiceError(
      "Não foi possível comunicar com o AWS Rekognition. Tente novamente.",
      "FACE_PROVIDER_UNAVAILABLE",
      503,
      error?.code || error?.name,
    );
  }

  const text = await response.text();
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!response.ok) {
    const providerCode = normalizeProviderCode(
      data.__type || data.code || data.Code || data.errorCode,
    );
    const error = new FaceServiceError(
      data.message || data.Message || "AWS Rekognition recusou a operação.",
      "FACE_PROVIDER_ERROR",
      response.status >= 500 ? 503 : 422,
      providerCode,
    );
    throw error;
  }
  return data as T;
}

async function ensureCollection(tenantId: number) {
  const id = collectionId(tenantId);
  try {
    await rekognitionRequest("CreateCollection", { CollectionId: id });
  } catch (error: any) {
    if (error?.providerCode !== "ResourceAlreadyExistsException") throw error;
  }
  return id;
}

async function deleteFace(tenantId: number, faceId: string) {
  await rekognitionRequest("DeleteFaces", {
    CollectionId: collectionId(tenantId),
    FaceIds: [faceId],
  });
}

export async function enrollFace(args: {
  tenantId: number;
  employeeId: number;
  image: Buffer;
  oldFaceId?: string | null;
}): Promise<{
  provider: string;
  collectionId: string;
  faceId: string;
  externalImageId: string;
}> {
  const id = await ensureCollection(args.tenantId);
  const bytes = args.image.toString("base64");
  const detected = await rekognitionRequest<{ FaceDetails?: unknown[] }>(
    "DetectFaces",
    {
      Image: { Bytes: bytes },
      Attributes: ["DEFAULT"],
    },
  );
  const count = detected.FaceDetails?.length || 0;
  if (count === 0) {
    throw new FaceServiceError(
      "Nenhum rosto foi identificado. Use uma foto frontal, nítida e bem iluminada.",
      "FACE_IMAGE_NO_FACE",
      422,
    );
  }
  if (count !== 1) {
    throw new FaceServiceError(
      "A imagem deve conter somente o rosto do funcionário.",
      "FACE_IMAGE_MULTIPLE_FACES",
      422,
    );
  }

  const externalId = externalImageId(args.tenantId, args.employeeId);
  const indexed = await rekognitionRequest<{
    FaceRecords?: Array<{
      Face?: { FaceId?: string; ExternalImageId?: string };
    }>;
    UnindexedFaces?: Array<{ Reasons?: string[] }>;
  }>("IndexFaces", {
    CollectionId: id,
    Image: { Bytes: bytes },
    ExternalImageId: externalId,
    MaxFaces: 1,
    QualityFilter: "AUTO",
    DetectionAttributes: ["DEFAULT"],
  });
  const faceId = indexed.FaceRecords?.[0]?.Face?.FaceId;
  if (!faceId) {
    const reasons = (indexed.UnindexedFaces || [])
      .flatMap((face) => face.Reasons || [])
      .join(", ");
    throw new FaceServiceError(
      reasons
        ? `A foto não atingiu a qualidade necessária para o reconhecimento (${reasons}).`
        : "A foto não atingiu a qualidade necessária para o reconhecimento. Tire outra foto frontal e bem iluminada.",
      "FACE_IMAGE_LOW_QUALITY",
      422,
    );
  }

  if (args.oldFaceId && args.oldFaceId !== faceId) {
    try {
      await deleteFace(args.tenantId, args.oldFaceId);
    } catch (error) {
      await deleteFace(args.tenantId, faceId).catch(() => {});
      throw error;
    }
  }

  return {
    provider: PROVIDER,
    collectionId: id,
    faceId,
    externalImageId: externalId,
  };
}

export async function verifyFace(args: {
  tenantId: number;
  employeeId: number;
  image: Buffer;
}): Promise<FaceVerificationResult> {
  const threshold = Number(env.FACE_MATCH_THRESHOLD || 90);
  const id = collectionId(args.tenantId);
  let searched: {
    FaceMatches?: Array<{
      Similarity?: number;
      Face?: { FaceId?: string; ExternalImageId?: string };
    }>;
  };
  try {
    searched = await rekognitionRequest("SearchFacesByImage", {
      CollectionId: id,
      Image: { Bytes: args.image.toString("base64") },
      FaceMatchThreshold: threshold,
      MaxFaces: 5,
    });
  } catch (error: any) {
    if (
      ["InvalidParameterException", "InvalidImageFormatException"].includes(
        error?.providerCode,
      )
    ) {
      return {
        verified: false,
        similarity: 0,
        threshold,
        provider: PROVIDER,
        collectionId: id,
        code: "FACE_NOT_RECOGNIZED",
      };
    }
    if (error?.providerCode === "ResourceNotFoundException") {
      return {
        verified: false,
        similarity: 0,
        threshold,
        provider: PROVIDER,
        collectionId: id,
        code: "FACE_NOT_ENROLLED",
      };
    }
    throw error;
  }

  const matches = searched.FaceMatches || [];
  const expected = externalImageId(args.tenantId, args.employeeId);
  const match = matches.find(
    (item) => item.Face?.ExternalImageId === expected,
  );
  if (match) {
    return {
      verified: true,
      similarity: Number(match.Similarity || 0),
      threshold,
      provider: PROVIDER,
      collectionId: id,
      matchedFaceId: match.Face?.FaceId || null,
      matchedExternalImageId: match.Face?.ExternalImageId || null,
    };
  }

  const strongest = matches[0];
  return {
    verified: false,
    similarity: Number(strongest?.Similarity || 0),
    threshold,
    provider: PROVIDER,
    collectionId: id,
    matchedFaceId: strongest?.Face?.FaceId || null,
    matchedExternalImageId: strongest?.Face?.ExternalImageId || null,
    code: strongest ? "FACE_MISMATCH" : "FACE_NOT_RECOGNIZED",
  };
}

export async function revokeFace(
  tenantId: number,
  faceId: string | null | undefined,
) {
  if (!faceId) return;
  await deleteFace(tenantId, faceId);
}
