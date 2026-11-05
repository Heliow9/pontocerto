import test from "node:test";
import assert from "node:assert/strict";
import { buildControlIdEmployeeDiagnostic } from "../src/services/control-id-diagnostics.js";

const base = {
  employeeId: 13,
  name: "Jesse Batista Ferreira",
  registration: "13",
  active: true,
  hasFace: true,
  mappingStatus: null,
  jobType: null,
  jobStatus: null,
  attempts: 0,
  lastErrorCode: null,
  lastErrorMessage: null,
  jobError: null,
  updatedAt: "2026-11-05 00:49:00",
};

test("explains that an inactive employee must be activated before synchronization", () => {
  const result = buildControlIdEmployeeDiagnostic({ ...base, active: false });
  assert.equal(result.status, "ACTION_REQUIRED");
  assert.equal(result.code, "EMPLOYEE_INACTIVE");
  assert.match(result.summary, /inativo/i);
  assert.match(result.action, /Funcionários.*Ativo/i);
});

test("explains that an active employee without a saved face needs a facial photo", () => {
  const result = buildControlIdEmployeeDiagnostic({ ...base, hasFace: false });
  assert.equal(result.status, "ACTION_REQUIRED");
  assert.equal(result.code, "FACE_REQUIRED");
  assert.match(result.action, /Salvar foto/i);
});

test("shows the current synchronization stage and attempt while processing", () => {
  const result = buildControlIdEmployeeDiagnostic({
    ...base,
    mappingStatus: "ERROR",
    jobType: "UPSERT_FACE",
    jobStatus: "FAILED",
    attempts: 3,
  });
  assert.equal(result.status, "PROCESSING");
  assert.equal(result.stage, "Envio da foto facial");
  assert.equal(result.attempts, 3);
  assert.match(result.summary, /nova tentativa/i);
});

test("preserves the device error and gives a manual correction for a rejected face", () => {
  const result = buildControlIdEmployeeDiagnostic({
    ...base,
    mappingStatus: "ERROR",
    jobType: "UPSERT_FACE",
    jobStatus: "DEAD",
    attempts: 5,
    lastErrorCode: "PUSH_FAILED",
    lastErrorMessage: "Face não detectada na imagem",
    jobError: "Face não detectada na imagem",
  });
  assert.equal(result.status, "ACTION_REQUIRED");
  assert.equal(result.code, "PUSH_FAILED");
  assert.equal(result.technicalMessage, "Face não detectada na imagem");
  assert.match(result.action, /foto frontal.*Salvar foto.*Sincronizar funcionários/i);
});

test("reports a completed facial synchronization", () => {
  const result = buildControlIdEmployeeDiagnostic({
    ...base,
    mappingStatus: "SYNCED",
    jobType: "UPSERT_FACE",
    jobStatus: "SUCCEEDED",
    attempts: 1,
  });
  assert.equal(result.status, "SYNCED");
  assert.equal(result.summary, "Funcionário e foto sincronizados.");
  assert.equal(result.action, "Nenhuma ação necessária.");
});
