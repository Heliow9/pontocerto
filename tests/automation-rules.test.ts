import { expect, it } from "vitest";
import {
  effectiveReference,
  reachedThresholds,
} from "../apps/api/src/services/overtime-rules";
import {
  encryptSession,
  decryptSession,
} from "../apps/api/src/services/whatsapp-crypto";
it("prioriza a configuração individual e usa a do grupo quando não há substituição", () => {
  expect(effectiveReference(1800, 2400)).toBe(1800);
  expect(effectiveReference(null, 2400)).toBe(2400);
  expect(effectiveReference(null, null)).toBeNull();
});
it("atinge cada marco inclusive quando o total salta vários percentuais, sem cortar o excedente", () => {
  expect(reachedThresholds(1199, 2400)).toEqual([]);
  expect(reachedThresholds(1200, 2400)).toEqual(["50"]);
  expect(reachedThresholds(2400, 2400)).toEqual(["50", "100"]);
  expect(reachedThresholds(2401, 2400)).toEqual(["50", "100", "OVER"]);
  expect(reachedThresholds(3000, null)).toEqual([]);
});
it("protege sessões WhatsApp com criptografia autenticada e rejeita alteração ou outra chave", () => {
  const k = "a".repeat(64),
    cipher = encryptSession("secret-session", k);
  expect(cipher).not.toContain("secret-session");
  expect(decryptSession(cipher, k)).toBe("secret-session");
  expect(encryptSession("secret-session", k)).not.toBe(cipher);
  expect(() => decryptSession(cipher, "b".repeat(64))).toThrow();
  const bad = Buffer.from(cipher, "base64");
  bad[30] ^= 1;
  expect(() => decryptSession(bad.toString("base64"), k)).toThrow();
});
