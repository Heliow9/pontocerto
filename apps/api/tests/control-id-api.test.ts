import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.MYSQL_HOST = "127.0.0.1";
process.env.MYSQL_DATABASE = "test";
process.env.MYSQL_USER = "test";
process.env.MYSQL_PASSWORD = "test";
process.env.JWT_SECRET = "control-id-test-secret-with-at-least-32-characters";

test("exposes the native Control iD Push endpoints at the server root", async () => {
  const { app } = await import("../src/app.js");
  const push = await request(app).get("/push?deviceId=478435&uuid=test");
  const result = await request(app).post("/result?deviceId=478435&uuid=test").send({});
  assert.equal(push.status, 401);
  assert.equal(result.status, 401);
  assert.match(push.body.message, /credencial/i);
  assert.match(result.body.message, /credencial/i);
});
