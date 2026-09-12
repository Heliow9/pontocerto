import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import "dotenv/config";
const file = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.env",
);
const content = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
if (process.env.WHATSAPP_ENCRYPTION_KEY) {
  if (!/^[a-f0-9]{64}$/i.test(process.env.WHATSAPP_ENCRYPTION_KEY))
    throw new Error(
      "WHATSAPP_ENCRYPTION_KEY inválida; preserve/restaure a chave original.",
    );
  console.log("Chave de sessão WhatsApp existente preservada.");
} else {
  const cleaned = content.replace(/^WHATSAPP_ENCRYPTION_KEY=.*\r?\n?/gm, "");
  fs.writeFileSync(
    file,
    `${cleaned}\n# Preserve esta chave para conseguir ler as sessões WhatsApp.\nWHATSAPP_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\n`,
    { mode: 0o600 },
  );
  console.log(
    "Chave de sessão WhatsApp criada no .env. Nenhum segredo foi exibido.",
  );
}
