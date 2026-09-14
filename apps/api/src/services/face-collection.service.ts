import {
  RekognitionClient,
  CreateCollectionCommand,
  IndexFacesCommand,
  DeleteFacesCommand,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { faceError, faceProviderStatus, validateFaceImage } from "./face.service.js";

export function companyFaceCollectionId(tenantId: number, companyId: number) {
  return `ponto-certo-t${tenantId}-c${companyId}`;
}

export function employeeFaceExternalImageId(employeeId: number) {
  return `employee_${employeeId}`;
}

function client() {
  if (!faceProviderStatus().enabled || !env.AWS_REGION) {
    throw faceError(
      "O reconhecimento facial não está configurado no servidor.",
      "FACE_PROVIDER_NOT_CONFIGURED",
      503,
    );
  }
  return new RekognitionClient({ region: env.AWS_REGION, maxAttempts: 2 });
}

async function send(command: any) {
  const aws = client();
  try {
    return await aws.send(command, { abortSignal: AbortSignal.timeout(12000) });
  } catch (error: any) {
    if (error?.name === "ResourceAlreadyExistsException") return { alreadyExists: true };
    throw error;
  } finally {
    aws.destroy?.();
  }
}

function providerFailure(error: any): never {
  if (
    ["InvalidImageFormatException", "ImageTooLargeException"].includes(
      error?.name,
    )
  ) {
    throw faceError(
      "Imagem facial inválida. Use uma foto JPG ou PNG nítida.",
      "FACE_IMAGE_INVALID",
      422,
    );
  }
  throw faceError(
    "Não foi possível acessar o reconhecimento facial da AWS neste momento.",
    "FACE_PROVIDER_UNAVAILABLE",
    503,
  );
}

export async function ensureCompanyFaceCollection(
  tenantId: number,
  companyId: number,
) {
  const collectionId = companyFaceCollectionId(tenantId, companyId);
  try {
    await send(new CreateCollectionCommand({ CollectionId: collectionId }));
  } catch (error: any) {
    if (error?.name !== "ResourceAlreadyExistsException") providerFailure(error);
  }
  return collectionId;
}

export async function indexEmployeeFace(args: {
  tenantId: number;
  companyId: number;
  employeeId: number;
  image: Buffer;
  db?: any;
}) {
  validateFaceImage(args.image);
  const db = args.db || pool;
  const collectionId = await ensureCompanyFaceCollection(
    args.tenantId,
    args.companyId,
  );
  const externalImageId = employeeFaceExternalImageId(args.employeeId);

  const [oldRows] = await db.query<any[]>(
    "SELECT provider_face_id FROM employee_face_profiles WHERE tenant_id=? AND employee_id=? LIMIT 1",
    [args.tenantId, args.employeeId],
  );
  const oldFaceId = oldRows[0]?.provider_face_id || null;

  let result: any;
  try {
    result = await send(
      new IndexFacesCommand({
        CollectionId: collectionId,
        Image: { Bytes: args.image },
        ExternalImageId: externalImageId,
        MaxFaces: 1,
        QualityFilter: "AUTO",
        DetectionAttributes: ["DEFAULT"],
      }),
    );
  } catch (error: any) {
    providerFailure(error);
  }

  const faceId = result?.FaceRecords?.[0]?.Face?.FaceId;
  if (!faceId) {
    throw faceError(
      "A AWS não conseguiu indexar este rosto. Use uma foto frontal, nítida e bem iluminada.",
      "FACE_INDEX_REJECTED",
      422,
    );
  }

  try {
    await db.query(
      `INSERT INTO employee_face_profiles
       (tenant_id,company_id,employee_id,provider,collection_id,provider_face_id,external_image_id,status,enrolled_at,last_verified_at,updated_at)
       VALUES (?,?,?,'AWS_REKOGNITION',?,?,?,'ENROLLED',${BRASILIA_NOW_SQL},NULL,${BRASILIA_NOW_SQL})
       ON DUPLICATE KEY UPDATE company_id=VALUES(company_id),provider=VALUES(provider),collection_id=VALUES(collection_id),provider_face_id=VALUES(provider_face_id),external_image_id=VALUES(external_image_id),status='ENROLLED',enrolled_at=VALUES(enrolled_at),updated_at=VALUES(updated_at)`,
      [
        args.tenantId,
        args.companyId,
        args.employeeId,
        collectionId,
        faceId,
        externalImageId,
      ],
    );
  } catch (error) {
    try {
      await send(
        new DeleteFacesCommand({ CollectionId: collectionId, FaceIds: [faceId] }),
      );
    } catch {}
    throw error;
  }

  if (oldFaceId && oldFaceId !== faceId) {
    try {
      await send(
        new DeleteFacesCommand({
          CollectionId: collectionId,
          FaceIds: [oldFaceId],
        }),
      );
    } catch {
      // O novo FaceId já está ativo no banco; o antigo não pode autenticar porque
      // o AutoPonto sempre confirma o FaceId contra employee_face_profiles.
    }
  }

  return { collectionId, faceId, externalImageId };
}

export async function removeEmployeeFaceIndex(args: {
  tenantId: number;
  companyId: number;
  employeeId: number;
  db?: any;
}) {
  const db = args.db || pool;
  const [rows] = await db.query<any[]>(
    "SELECT collection_id,provider_face_id FROM employee_face_profiles WHERE tenant_id=? AND employee_id=? LIMIT 1",
    [args.tenantId, args.employeeId],
  );
  const profile = rows[0];
  if (profile?.provider_face_id && profile?.collection_id) {
    try {
      await send(
        new DeleteFacesCommand({
          CollectionId: profile.collection_id,
          FaceIds: [profile.provider_face_id],
        }),
      );
    } catch {
      // A revogação local impede uso do FaceId mesmo se a AWS estiver indisponível.
    }
  }
  await db.query(
    `UPDATE employee_face_profiles SET status='REVOKED',updated_at=${BRASILIA_NOW_SQL} WHERE tenant_id=? AND employee_id=?`,
    [args.tenantId, args.employeeId],
  );
}

export async function identifyEmployeeFace(args: {
  tenantId: number;
  companyId: number;
  image: Buffer;
}) {
  validateFaceImage(args.image);
  const collectionId = companyFaceCollectionId(args.tenantId, args.companyId);
  const threshold = env.FACE_MATCH_THRESHOLD || 95;
  let result: any;
  try {
    result = await send(
      new SearchFacesByImageCommand({
        CollectionId: collectionId,
        Image: { Bytes: args.image },
        FaceMatchThreshold: threshold,
        MaxFaces: 1,
        QualityFilter: "AUTO",
      }),
    );
  } catch (error: any) {
    if (
      error?.name === "ResourceNotFoundException" ||
      error?.name === "InvalidParameterException"
    ) {
      return {
        recognized: false as const,
        code:
          error?.name === "InvalidParameterException"
            ? "AUTOPONT_NO_FACE"
            : "AUTOPONT_COLLECTION_EMPTY",
        similarity: 0,
        threshold,
      };
    }
    providerFailure(error);
  }

  const match = result?.FaceMatches?.[0];
  const faceId = match?.Face?.FaceId;
  const similarity = Number(match?.Similarity || 0);
  if (!faceId || similarity < threshold) {
    return {
      recognized: false as const,
      code: "AUTOPONT_FACE_NOT_RECOGNIZED",
      similarity,
      threshold,
    };
  }

  const [rows] = await pool.query<any[]>(
    `SELECT p.employee_id,e.name,e.registration_number
       FROM employee_face_profiles p
       JOIN employees e ON e.id=p.employee_id AND e.tenant_id=p.tenant_id AND e.company_id=p.company_id AND e.active=1
       JOIN employee_face_images i ON i.tenant_id=p.tenant_id AND i.employee_id=p.employee_id
      WHERE p.tenant_id=? AND p.company_id=? AND p.provider_face_id=? AND p.status='ENROLLED'
      LIMIT 1`,
    [args.tenantId, args.companyId, faceId],
  );
  if (!rows[0]) {
    return {
      recognized: false as const,
      code: "AUTOPONT_FACE_NOT_RECOGNIZED",
      similarity,
      threshold,
    };
  }

  await pool
    .query(
      `UPDATE employee_face_profiles SET last_verified_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL} WHERE tenant_id=? AND employee_id=?`,
      [args.tenantId, rows[0].employee_id],
    )
    .catch(() => {});

  return {
    recognized: true as const,
    employeeId: Number(rows[0].employee_id),
    name: String(rows[0].name),
    registration: rows[0].registration_number || null,
    similarity,
    threshold,
    faceId,
    collectionId,
  };
}

export async function reindexCompanyFaces(args: {
  tenantId: number;
  companyId: number;
}) {
  await ensureCompanyFaceCollection(args.tenantId, args.companyId);
  const [rows] = await pool.query<any[]>(
    `SELECT e.id AS employee_id,i.image
       FROM employees e
       JOIN employee_face_images i ON i.tenant_id=e.tenant_id AND i.employee_id=e.id
      WHERE e.tenant_id=? AND e.company_id=? AND e.active=1
      ORDER BY e.id`,
    [args.tenantId, args.companyId],
  );
  let indexed = 0;
  const failed: Array<{ employeeId: number; message: string }> = [];
  for (const row of rows) {
    try {
      await indexEmployeeFace({
        tenantId: args.tenantId,
        companyId: args.companyId,
        employeeId: Number(row.employee_id),
        image: row.image,
      });
      indexed += 1;
    } catch (error: any) {
      failed.push({
        employeeId: Number(row.employee_id),
        message: error?.message || "Falha ao indexar rosto.",
      });
    }
  }
  return { total: rows.length, indexed, failed };
}
