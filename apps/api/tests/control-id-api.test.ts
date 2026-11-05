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

test("exposes secret URL aliases for Push, Result and Monitor", async () => {
  const { app } = await import("../src/app.js");
  const credential = "invalid-secret";
  const push = await request(app).get(
    `/control-id/device/${credential}/push?deviceId=4409419584573675&uuid=test`,
  );
  const result = await request(app)
    .post(`/control-id/device/${credential}/result?deviceId=4409419584573675&uuid=test`)
    .send({});
  const dao = await request(app)
    .post(`/control-id/device/${credential}/monitor/dao`)
    .send({ device_id: "4409419584573675", changes: [] });
  const alive = await request(app)
    .post(`/control-id/device/${credential}/monitor/device_is_alive`)
    .send({ device_id: "4409419584573675", access_logs: 0 });

  for (const response of [push, result, dao, alive]) {
    assert.equal(response.status, 401);
    assert.match(response.body.message, /credencial/i);
  }
});
