import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.MYSQL_HOST = "127.0.0.1";
process.env.MYSQL_DATABASE = "test";
process.env.MYSQL_USER = "test";
process.env.MYSQL_PASSWORD = "test";
process.env.JWT_SECRET = "control-id-claim-test-secret-with-at-least-32-characters";

test("claims a facial job without sorting its large base64 payload", async () => {
  const { claimControlIdPushJobWithConnection } = await import("../src/services/control-id-sync.service.js");
  const statements: string[] = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      statements.push(normalized);
      if (normalized.startsWith("UPDATE control_id_sync_jobs")) return [{ affectedRows: 1 }];
      if (normalized.startsWith("SELECT j.id FROM control_id_sync_jobs")) {
        assert.doesNotMatch(normalized, /payload_json/i);
        return [[{ id: 91 }]];
      }
      if (normalized.startsWith("SELECT job_type,payload_json FROM control_id_sync_jobs"))
        return [[{
          job_type: "UPSERT_FACE",
          payload_json: JSON.stringify({
            vendorUserId: 14,
            imageBase64: "Zm90bw==",
            timestamp: 1793862000,
          }),
        }]];
      throw new Error(`Consulta inesperada: ${normalized}`);
    },
  };

  const command = await claimControlIdPushJobWithConnection(connection, 1, "push-uuid");

  assert.deepEqual(command, {
    verb: "POST",
    endpoint: "user_set_image",
    body: "Zm90bw==",
    queryString: "user_id=14&timestamp=1793862000&match=1",
    contentType: "application/octet-stream",
  });
  assert.equal(statements.filter((sql) => sql.includes("payload_json")).length, 1);
});
