import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../apps/api/src/config/env.js", () => ({
  env: {
    FACE_PROVIDER: "AWS_REKOGNITION",
    FACE_MATCH_THRESHOLD: 90,
    AWS_REGION: "us-east-1",
    AWS_ACCESS_KEY_ID: "AKIATESTONLY",
    AWS_SECRET_ACCESS_KEY: "test-secret-access-key",
    AWS_SESSION_TOKEN: undefined,
  },
}));

import {
  collectionId,
  externalImageId,
  enrollFace,
  revokeFace,
  verifyFace,
} from "../apps/api/src/services/face.service";

function response(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/x-amz-json-1.1" },
    }),
  );
}

function operation(call: any[]) {
  const headers = call[1]?.headers as Record<string, string>;
  return headers?.["X-Amz-Target"] || headers?.["x-amz-target"];
}

function payload(call: any[]) {
  return JSON.parse(String(call[1]?.body || "{}"));
}

describe("AWS Rekognition face service", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("isola collection por tenant e identidade por funcionário", () => {
    expect(collectionId(7)).toBe("ponto-certo-tenant-7");
    expect(externalImageId(7, 11)).toBe("tenant-7-employee-11");
  });

  it("cadastra exatamente um rosto e substitui o FaceId anterior", async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      const target = (init.headers as Record<string, string>)["X-Amz-Target"];
      if (target.endsWith("CreateCollection"))
        return response(400, { __type: "ResourceAlreadyExistsException" });
      if (target.endsWith("DetectFaces"))
        return response(200, { FaceDetails: [{ Confidence: 99.9 }] });
      if (target.endsWith("IndexFaces"))
        return response(200, {
          FaceRecords: [
            {
              Face: {
                FaceId: "new-face-id",
                ExternalImageId: "tenant-7-employee-11",
              },
            },
          ],
        });
      if (target.endsWith("DeleteFaces")) return response(200, {});
      return response(500, { message: "unexpected" });
    });

    const result = await enrollFace({
      tenantId: 7,
      employeeId: 11,
      image: Buffer.from("face-image"),
      oldFaceId: "old-face-id",
    });

    expect(result).toMatchObject({
      provider: "AWS_REKOGNITION",
      collectionId: "ponto-certo-tenant-7",
      faceId: "new-face-id",
      externalImageId: "tenant-7-employee-11",
    });
    const calls = fetchMock.mock.calls;
    expect(calls.map(operation)).toEqual([
      "RekognitionService.CreateCollection",
      "RekognitionService.DetectFaces",
      "RekognitionService.IndexFaces",
      "RekognitionService.DeleteFaces",
    ]);
    expect(payload(calls[2]).ExternalImageId).toBe("tenant-7-employee-11");
    expect(payload(calls[3]).FaceIds).toEqual(["old-face-id"]);
  });

  it("rejeita cadastro quando a imagem não contém exatamente um rosto", async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      const target = (init.headers as Record<string, string>)["X-Amz-Target"];
      if (target.endsWith("CreateCollection")) return response(200, {});
      if (target.endsWith("DetectFaces"))
        return response(200, {
          FaceDetails: [{ Confidence: 99 }, { Confidence: 98 }],
        });
      return response(500, {});
    });

    await expect(
      enrollFace({ tenantId: 7, employeeId: 11, image: Buffer.from("two") }),
    ).rejects.toMatchObject({ code: "FACE_IMAGE_MULTIPLE_FACES" });
    expect(fetchMock.mock.calls.map(operation)).not.toContain(
      "RekognitionService.IndexFaces",
    );
  });

  it("aprova somente o rosto associado ao funcionário esperado", async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      const target = (init.headers as Record<string, string>)["X-Amz-Target"];
      if (target.endsWith("SearchFacesByImage"))
        return response(200, {
          FaceMatches: [
            {
              Similarity: 98.5,
              Face: {
                FaceId: "face-11",
                ExternalImageId: "tenant-7-employee-11",
              },
            },
          ],
        });
      return response(500, {});
    });

    await expect(
      verifyFace({ tenantId: 7, employeeId: 11, image: Buffer.from("selfie") }),
    ).resolves.toMatchObject({
      verified: true,
      similarity: 98.5,
      threshold: 90,
      provider: "AWS_REKOGNITION",
      matchedFaceId: "face-11",
    });
  });

  it("rejeita rosto de outro funcionário mesmo com alta similaridade", async () => {
    fetchMock.mockImplementation(() =>
      response(200, {
        FaceMatches: [
          {
            Similarity: 99.7,
            Face: {
              FaceId: "face-99",
              ExternalImageId: "tenant-7-employee-99",
            },
          },
        ],
      }),
    );

    await expect(
      verifyFace({ tenantId: 7, employeeId: 11, image: Buffer.from("selfie") }),
    ).resolves.toMatchObject({
      verified: false,
      similarity: 99.7,
      code: "FACE_MISMATCH",
    });
  });

  it("revoga o FaceId cadastrado", async () => {
    fetchMock.mockImplementation(() => response(200, {}));
    await revokeFace(7, "face-11");
    expect(operation(fetchMock.mock.calls[0])).toBe(
      "RekognitionService.DeleteFaces",
    );
    expect(payload(fetchMock.mock.calls[0])).toMatchObject({
      CollectionId: "ponto-certo-tenant-7",
      FaceIds: ["face-11"],
    });
  });
});
