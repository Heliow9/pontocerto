import test from "node:test";
import assert from "node:assert/strict";
import {
  buildControlIdPushCommand,
  controlIdResultDecision,
  controlIdResultError,
  controlIdIsFacialAccess,
  hashControlIdSecret,
  normalizeControlIdSerial,
  parseControlIdDao,
  readBearerToken,
} from "../src/services/control-id-core.js";

test("hashes terminal secrets without exposing the credential", () => {
  const hash = hashControlIdSecret("a".repeat(64), "pepper-123");
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash, hashControlIdSecret("a".repeat(64), "pepper-123"));
  assert.notEqual(hash, "a".repeat(64));
});

test("accepts only a 64 hexadecimal character Bearer credential", () => {
  const credential = "ab".repeat(32);
  assert.equal(readBearerToken(`Bearer ${credential}`), credential);
  assert.equal(readBearerToken(`bearer ${credential.toUpperCase()}`), credential);
  assert.equal(readBearerToken(credential), null);
  assert.equal(readBearerToken("Bearer short"), null);
});

test("normalizes the Control iD serial printed on the device", () => {
  assert.equal(normalizeControlIdSerial(" 0m0600/0110eb "), "0M06000110EB");
  assert.throws(() => normalizeControlIdSerial("../invalid"), /série/i);
});

test("parses only inserted access logs and keeps complete vendor evidence", () => {
  const parsed = parseControlIdDao({
    device_id: 478435,
    object_changes: [
      {
        object: "access_logs",
        type: "inserted",
        values: {
          id: "519",
          time: "1793831400",
          event: "7",
          user_id: "42",
          identifier_id: "1",
          log_type_id: "-1",
          portal_id: "1",
        },
      },
      { object: "users", type: "inserted", values: { id: "42" } },
    ],
  });
  assert.deepEqual(parsed, {
    deviceId: "478435",
    changes: [
      {
        logId: "519",
        occurredAtUnix: 1793831400,
        event: 7,
        userId: "42",
        identifierId: 1,
        logTypeId: -1,
        values: {
          id: "519",
          time: "1793831400",
          event: "7",
          user_id: "42",
          identifier_id: "1",
          log_type_id: "-1",
          portal_id: "1",
        },
      },
    ],
  });
  assert.throws(
    () => parseControlIdDao({ device_id: 478435, object_changes: "bad" }),
    /Monitor/i,
  );
});

test("builds the user, face and removal commands executed by Push", () => {
  assert.deepEqual(
    buildControlIdPushCommand({
      id: 10,
      jobType: "UPSERT_USER",
      payload: { vendorUserId: 42, name: "Ana Lima", registration: "MAT-42" },
    }),
    {
      verb: "POST",
      endpoint: "create_or_modify_objects",
      body: {
        object: "users",
        values: [{ id: 42, name: "Ana Lima", registration: "MAT-42" }],
      },
      contentType: "application/json",
    },
  );
  assert.deepEqual(
    buildControlIdPushCommand({
      id: 11,
      jobType: "UPSERT_FACE",
      payload: { vendorUserId: 42, imageBase64: "/9j/test", timestamp: 1793831400 },
    }),
    {
      verb: "POST",
      endpoint: "user_set_image",
      body: "/9j/test",
      queryString: "user_id=42&timestamp=1793831400&match=1",
      contentType: "application/octet-stream",
    },
  );
  assert.deepEqual(
    buildControlIdPushCommand({
      id: 12,
      jobType: "DELETE_USER",
      payload: { vendorUserId: 42 },
    }),
    {
      verb: "POST",
      endpoint: "destroy_objects",
      body: { object: "users", where: { users: { id: 42 } } },
      contentType: "application/json",
    },
  );
});

test("retries transient Push failures without regressing successful results", () => {
  assert.deepEqual(controlIdResultDecision({ currentStatus: "CLAIMED", attempts: 1, error: "timeout" }), {
    status: "FAILED",
    retry: true,
  });
  assert.deepEqual(controlIdResultDecision({ currentStatus: "CLAIMED", attempts: 5, error: "invalid image" }), {
    status: "DEAD",
    retry: false,
  });
  assert.deepEqual(controlIdResultDecision({ currentStatus: "CLAIMED", attempts: 1, error: null }), {
    status: "SUCCEEDED",
    retry: false,
  });
  assert.deepEqual(controlIdResultDecision({ currentStatus: "SUCCEEDED", attempts: 1, error: "late duplicate" }), {
    status: "SUCCEEDED",
    retry: false,
  });
});

test("treats a rejected facial enrollment response as a Push failure", () => {
  assert.equal(
    controlIdResultError(
      { success: false, errors: [{ code: 8, message: "Low sharpness" }] },
      null,
    ),
    "Low sharpness",
  );
  assert.equal(controlIdResultError({ success: true }, null), null);
  assert.equal(controlIdResultError({}, "timeout"), "timeout");
});

test("accepts facial evidence and rejects explicit card, PIN or QR evidence", () => {
  assert.equal(controlIdIsFacialAccess({ confidence: 1230, card_value: "0" }), true);
  assert.equal(controlIdIsFacialAccess({ confidence: 0, card_value: "123" }), false);
  assert.equal(controlIdIsFacialAccess({ pin_value: "1234" }), false);
  assert.equal(controlIdIsFacialAccess({ qrcode_value: "ABC" }), false);
});
