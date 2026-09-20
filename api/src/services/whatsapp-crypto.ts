import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export function encryptSession(value: string, keyHex: string) {
  if (!/^[a-f0-9]{64}$/i.test(keyHex))
    throw new Error("WHATSAPP_KEY_NOT_CONFIGURED");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
export function decryptSession(value: string, keyHex: string) {
  const data = Buffer.from(value, "base64"),
    decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(keyHex, "hex"),
      data.subarray(0, 12),
    );
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    decipher.update(data.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
