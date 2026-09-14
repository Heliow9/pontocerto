import {
  RekognitionClient,
  DetectFacesCommand,
  CompareFacesCommand,
} from "@aws-sdk/client-rekognition";
import { env } from "../config/env.js";

export function faceProviderStatus() {
  return {
    enabled: env.FACE_PROVIDER === "AWS_REKOGNITION",
    provider: env.FACE_PROVIDER,
    region: env.AWS_REGION || null,
    threshold: env.FACE_MATCH_THRESHOLD,
  };
}
export function faceError(message: string, code: string, status = 422) {
  return Object.assign(new Error(message), { code, status });
}
function client() {
  if (!faceProviderStatus().enabled || !env.AWS_REGION)
    throw faceError(
      "A validação facial não está configurada no servidor. Solicite orientação ao RH.",
      "FACE_PROVIDER_NOT_CONFIGURED",
      503,
    );
  return new RekognitionClient({ region: env.AWS_REGION, maxAttempts: 2 });
}
async function send(
  command: DetectFacesCommand | CompareFacesCommand,
): Promise<any> {
  const aws = client();
  try {
    return await aws.send(command as any, {
      abortSignal: AbortSignal.timeout(12000),
    });
  } catch (error: any) {
    if (
      [
        "InvalidImageFormatException",
        "InvalidParameterException",
        "ImageTooLargeException",
      ].includes(error.name)
    )
      throw faceError(
        "Imagem inválida. Use uma foto JPG ou PNG nítida com apenas um rosto.",
        "FACE_IMAGE_INVALID",
      );
    throw faceError(
      "Não foi possível validar o rosto com a AWS. Tente novamente; o ponto não foi registrado.",
      "FACE_PROVIDER_UNAVAILABLE",
      503,
    );
  } finally {
    aws.destroy?.();
  }
}
export function validateFaceImage(image: Buffer) {
  const jpeg =
    image.length > 32 &&
    image[0] === 255 &&
    image[1] === 216 &&
    image[2] === 255;
  const png =
    image.length > 32 &&
    image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (
    (!jpeg && !png) ||
    image.length > Math.min(env.FACE_MAX_IMAGE_MB || 5, 5) * 1024 * 1024
  )
    throw faceError(
      "Envie uma imagem JPG ou PNG de até 5 MB.",
      "FACE_IMAGE_INVALID",
      400,
    );
  return jpeg ? "image/jpeg" : "image/png";
}
export async function assertSingleFace(image: Buffer) {
  validateFaceImage(image);
  const result = await send(
    new DetectFacesCommand({
      Image: { Bytes: image },
      Attributes: ["DEFAULT"],
    }),
  );
  if (!result.FaceDetails?.length)
    throw faceError(
      "Nenhum rosto encontrado. Use uma foto frontal e bem iluminada.",
      "FACE_IMAGE_NO_FACE",
    );
  if (result.FaceDetails.length !== 1)
    throw faceError(
      "A foto deve conter somente o rosto do funcionário.",
      "FACE_IMAGE_MULTIPLE_FACES",
    );
}
export async function compareEmployeeFace(reference: Buffer, selfie: Buffer) {
  await assertSingleFace(selfie);
  const threshold = env.FACE_MATCH_THRESHOLD || 95;
  const result = await send(
    new CompareFacesCommand({
      SourceImage: { Bytes: reference },
      TargetImage: { Bytes: selfie },
      SimilarityThreshold: threshold,
      QualityFilter: "AUTO",
    }),
  );
  const similarity = Number(result.FaceMatches?.[0]?.Similarity || 0);
  return {
    verified: similarity >= threshold,
    similarity,
    threshold,
    provider: "AWS_REKOGNITION",
  };
}
