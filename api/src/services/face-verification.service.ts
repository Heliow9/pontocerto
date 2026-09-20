import { pool } from "../db/pool.js";
import { compareEmployeeFace } from "./face.service.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";

// Caller authenticates the employee and holds the same pc:punch lock used by photo replacement/removal.
export async function evaluateEmployeeFace(
  args: {
    tenantId: number;
    companyId: number;
    employeeId: number;
    image: Buffer;
  },
  db: any = pool,
) {
  const [rows] = await db.query(
    "SELECT image,mime_type FROM employee_face_images WHERE tenant_id=? AND employee_id=? LIMIT 1",
    [args.tenantId, args.employeeId],
  );
  if (!rows[0])
    return {
      required: false,
      verified: true,
      decision: "NOT_REQUIRED",
      code: null,
      similarity: null,
      threshold: null,
      provider: null,
    };
  const result = await compareEmployeeFace(rows[0].image, args.image);
  return {
    ...result,
    required: true,
    decision: result.verified ? "VERIFIED" : "REJECTED",
    code: result.verified ? null : "FACE_MISMATCH",
  };
}
export async function requireEmployeeFace(
  args: {
    tenantId: number;
    companyId: number;
    employeeId: number;
    image: Buffer;
  },
  db: any,
) {
  const face = await evaluateEmployeeFace(args, db);
  if (!face.verified)
    throw Object.assign(
      new Error(
        "O rosto da selfie não corresponde à foto cadastrada deste funcionário. Tire outra foto ou procure o RH.",
      ),
      { status: 403, code: "FACE_MISMATCH" },
    );
  return face;
}
export async function saveFaceCheck(
  db: any,
  tenantId: number,
  employeeId: number,
  timeEntryId: number,
  face: Awaited<ReturnType<typeof evaluateEmployeeFace>>,
) {
  if (!face.required) return;
  await db.query(
    "UPDATE time_entries SET face_verified=1,face_similarity=?,face_provider=? WHERE id=? AND tenant_id=?",
    [face.similarity, face.provider, timeEntryId, tenantId],
  );
  await db.query(
    "INSERT INTO time_entry_face_checks(tenant_id,time_entry_id,employee_id,provider,similarity,threshold_value,verified,created_at) VALUES(?,?,?,?,?,?,1," +
      BRASILIA_NOW_SQL +
      ")",
    [
      tenantId,
      timeEntryId,
      employeeId,
      face.provider,
      face.similarity,
      face.threshold,
    ],
  );
}
