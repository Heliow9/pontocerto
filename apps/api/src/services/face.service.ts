/**
 * Reconhecimento facial em nuvem desativado.
 *
 * A versão atual do Ponto Certo usa:
 * - selfie obrigatória no momento do ponto;
 * - geolocalização/geofence;
 * - vínculo do aparelho;
 * - biometria nativa/WebAuthn no cliente quando habilitada.
 *
 * Este serviço permanece apenas para manter compatibilidade com as rotas e
 * estruturas de banco das versões anteriores, sem depender de AWS Rekognition.
 */

export function collectionId(tenantId: number) {
  return `ponto-certo-tenant-${tenantId}`;
}

export function externalImageId(tenantId: number, employeeId: number) {
  return `tenant-${tenantId}-employee-${employeeId}`;
}

export async function enrollFace(_args: {
  tenantId: number;
  employeeId: number;
  image: Buffer;
  oldFaceId?: string | null;
}): Promise<{
  provider: string;
  collectionId: string | null;
  faceId: string | null;
  externalImageId: string | null;
}> {
  throw new Error(
    "Reconhecimento facial em nuvem está desativado. Use a selfie obrigatória e a biometria do dispositivo."
  );
}

export async function verifyFace(_args: {
  tenantId: number;
  employeeId: number;
  image: Buffer;
}) {
  return {
    verified: false,
    similarity: 0,
    threshold: 0,
    provider: "DISABLED",
    collectionId: null
  };
}

export async function revokeFace(
  _tenantId: number,
  _faceId: string | null | undefined
) {
  return;
}
