import { pool } from "../db/pool.js";
import { verifyFace, faceProviderStatus } from "./face.service.js";

export type EmployeeFacePolicy = {
  companyRequired: boolean;
  employeeBiometricExempt: boolean;
  required: boolean;
  enrolled: boolean;
  provider: string | null;
  status: string | null;
  enrolledAt: string | null;
  lastVerifiedAt: string | null;
  providerStatus: ReturnType<typeof faceProviderStatus>;
};

export type EmployeeFaceEvaluation = {
  required: boolean;
  verified: boolean;
  decision: "VERIFIED" | "NOT_REQUIRED" | "EXEMPT" | "NOT_ENROLLED" | "REJECTED";
  code: string | null;
  message: string | null;
  similarity: number | null;
  threshold: number;
  provider: string | null;
  collectionId: string | null;
  matchedFaceId?: string | null;
  policy: EmployeeFacePolicy;
};

export async function getEmployeeFacePolicy(
  tenantId: number,
  companyId: number,
  employeeId: number,
): Promise<EmployeeFacePolicy> {
  const [rows] = await pool.query<any[]>(
    `SELECT COALESCE(cp.require_face_recognition,0) AS require_face_recognition,
            e.biometric_exempt,
            fp.provider,fp.status,fp.enrolled_at,fp.last_verified_at
       FROM employees e
       LEFT JOIN company_profiles cp
         ON cp.tenant_id=e.tenant_id AND cp.company_id=e.company_id
       LEFT JOIN employee_face_profiles fp
         ON fp.tenant_id=e.tenant_id AND fp.employee_id=e.id
      WHERE e.tenant_id=? AND e.company_id=? AND e.id=? AND e.active=1
      LIMIT 1`,
    [tenantId, companyId, employeeId],
  );
  const row = rows[0];
  if (!row) {
    throw Object.assign(new Error("Funcionário não encontrado."), {
      code: "EMPLOYEE_NOT_FOUND",
      status: 404,
    });
  }
  const companyRequired = Boolean(row.require_face_recognition);
  const employeeBiometricExempt = Boolean(row.biometric_exempt);
  return {
    companyRequired,
    employeeBiometricExempt,
    required: companyRequired && !employeeBiometricExempt,
    enrolled: row.status === "ENROLLED",
    provider: row.provider || null,
    status: row.status || null,
    enrolledAt: row.enrolled_at || null,
    lastVerifiedAt: row.last_verified_at || null,
    providerStatus: faceProviderStatus(),
  };
}

export async function evaluateEmployeeFace(args: {
  tenantId: number;
  companyId: number;
  employeeId: number;
  image: Buffer;
}): Promise<EmployeeFaceEvaluation> {
  const policy = await getEmployeeFacePolicy(
    args.tenantId,
    args.companyId,
    args.employeeId,
  );
  const threshold = Number(policy.providerStatus.threshold || 90);

  if (!policy.required) {
    return {
      required: false,
      verified: true,
      decision: policy.employeeBiometricExempt ? "EXEMPT" : "NOT_REQUIRED",
      code: null,
      message: null,
      similarity: null,
      threshold,
      provider: policy.providerStatus.enabled
        ? policy.providerStatus.provider
        : null,
      collectionId: null,
      policy,
    };
  }

  if (!policy.providerStatus.enabled || !policy.providerStatus.configured) {
    throw Object.assign(
      new Error(
        "O reconhecimento facial está obrigatório para esta empresa, mas o AWS Rekognition não está configurado no servidor.",
      ),
      { code: "FACE_PROVIDER_NOT_CONFIGURED", status: 503 },
    );
  }

  if (!policy.enrolled) {
    return {
      required: true,
      verified: false,
      decision: "NOT_ENROLLED",
      code: "FACE_NOT_ENROLLED",
      message:
        "Seu rosto ainda não foi cadastrado. Solicite ao RH o cadastro facial antes de registrar o ponto.",
      similarity: null,
      threshold,
      provider: policy.providerStatus.provider,
      collectionId: null,
      policy,
    };
  }

  const result = await verifyFace({
    tenantId: args.tenantId,
    employeeId: args.employeeId,
    image: args.image,
  });
  if (result.verified) {
    return {
      required: true,
      verified: true,
      decision: "VERIFIED",
      code: null,
      message: null,
      similarity: result.similarity,
      threshold: result.threshold,
      provider: result.provider,
      collectionId: result.collectionId,
      matchedFaceId: result.matchedFaceId || null,
      policy,
    };
  }

  const mismatch = result.code === "FACE_MISMATCH";
  return {
    required: true,
    verified: false,
    decision: "REJECTED",
    code: mismatch ? "FACE_MISMATCH" : "FACE_NOT_RECOGNIZED",
    message: mismatch
      ? "O rosto capturado não corresponde ao usuário logado. Tente novamente com o seu próprio rosto."
      : "Rosto não reconhecido. Posicione o rosto de frente, com boa iluminação, e tente novamente.",
    similarity: result.similarity,
    threshold: result.threshold,
    provider: result.provider,
    collectionId: result.collectionId,
    matchedFaceId: result.matchedFaceId || null,
    policy,
  };
}
