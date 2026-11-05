import test from "node:test";
import assert from "node:assert/strict";
import {
  buildControlIdPushCommand,
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
      endpoint: "create_objects",
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
