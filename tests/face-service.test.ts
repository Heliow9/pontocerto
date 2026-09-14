import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  send: vi.fn(),
  query: vi.fn(),
  enabled: "AWS_REKOGNITION",
}));
vi.mock("@aws-sdk/client-rekognition", () => ({
  RekognitionClient: class {
    send = m.send;
  },
  DetectFacesCommand: class {
    constructor(public input: any) {}
  },
  CompareFacesCommand: class {
    constructor(public input: any) {}
  },
}));
vi.mock("../apps/api/src/config/env.js", () => ({
  env: {
    get FACE_PROVIDER() {
      return m.enabled;
    },
    AWS_REGION: "us-east-1",
    FACE_MATCH_THRESHOLD: 95,
    FACE_MAX_IMAGE_MB: 5,
  },
}));
vi.mock("../apps/api/src/db/pool.js", () => ({ pool: { query: m.query } }));
import { evaluateEmployeeFace } from "../apps/api/src/services/face-verification.service";
const args = {
  tenantId: 7,
  companyId: 2,
  employeeId: 11,
  image: Buffer.from([255, 216, 255, ...Array(40).fill(0)]),
};
beforeEach(() => {
  vi.resetAllMocks();
  m.enabled = "AWS_REKOGNITION";
  m.query.mockResolvedValue([[{ image: args.image, mime_type: "image/jpeg" }]]);
  m.send
    .mockResolvedValueOnce({ FaceDetails: [{}] })
    .mockResolvedValueOnce({
      FaceMatches: [{ Similarity: 99.3 }],
      UnmatchedFaces: [],
    });
});
it("preserves existing punch flow without a registered photo even when AWS is disabled", async () => {
  m.enabled = "DISABLED";
  m.query.mockResolvedValue([[]]);
  expect(await evaluateEmployeeFace(args)).toMatchObject({
    required: false,
    verified: true,
    decision: "NOT_REQUIRED",
  });
  expect(m.send).not.toHaveBeenCalled();
});
it("compares the logged employee reference image to the punch selfie", async () => {
  expect(await evaluateEmployeeFace(args)).toMatchObject({
    required: true,
    verified: true,
    similarity: 99.3,
  });
  expect(m.send.mock.calls[1][0].input).toMatchObject({
    SourceImage: { Bytes: args.image },
    TargetImage: { Bytes: args.image },
    SimilarityThreshold: 95,
  });
  expect(m.query.mock.calls[0][1]).toEqual([7, 11]);
});
it("rejects a different person", async () => {
  m.send
    .mockReset()
    .mockResolvedValueOnce({ FaceDetails: [{}] })
    .mockResolvedValueOnce({ FaceMatches: [], UnmatchedFaces: [{}] });
  expect(await evaluateEmployeeFace(args)).toMatchObject({
    required: true,
    verified: false,
    code: "FACE_MISMATCH",
  });
});
it("rejects similarity below the configured threshold", async () => {
  m.send
    .mockReset()
    .mockResolvedValueOnce({ FaceDetails: [{}] })
    .mockResolvedValueOnce({ FaceMatches: [{ Similarity: 94 }] });
  expect(await evaluateEmployeeFace(args)).toMatchObject({ verified: false });
});
it("does not bypass a registered photo when AWS is disabled", async () => {
  m.enabled = "DISABLED";
  await expect(evaluateEmployeeFace(args)).rejects.toMatchObject({
    status: 503,
  });
});
it("does not bypass verification on AWS outage", async () => {
  m.send.mockReset().mockRejectedValue(new Error("network"));
  await expect(evaluateEmployeeFace(args)).rejects.toMatchObject({
    status: 503,
  });
});
it("rejects selfies containing multiple faces", async () => {
  m.send.mockReset().mockResolvedValue({ FaceDetails: [{}, {}] });
  await expect(evaluateEmployeeFace(args)).rejects.toMatchObject({
    status: 422,
    code: "FACE_IMAGE_MULTIPLE_FACES",
  });
  expect(m.send).toHaveBeenCalledTimes(1);
});
it("rejects selfies with no face", async () => {
  m.send.mockReset().mockResolvedValue({ FaceDetails: [] });
  await expect(evaluateEmployeeFace(args)).rejects.toMatchObject({
    status: 422,
    code: "FACE_IMAGE_NO_FACE",
  });
});
