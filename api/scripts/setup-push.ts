import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import webpush from "web-push";
import "dotenv/config";
const directory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const file = path.join(directory, ".env");
const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const publicPresent = Boolean(
  process.env.VAPID_PUBLIC_KEY || /^VAPID_PUBLIC_KEY=.+/m.test(current),
);
const privatePresent = Boolean(
  process.env.VAPID_PRIVATE_KEY || /^VAPID_PRIVATE_KEY=.+/m.test(current),
);
if (publicPresent && privatePresent)
  console.log("Chaves de notificação já configuradas; preservadas.");
else if (publicPresent || privatePresent)
  throw new Error(
    "Configuração VAPID incompleta. Restaure o par original antes de continuar.",
  );
else {
  const keys = webpush.generateVAPIDKeys();
  const cleaned = current.replace(/^VAPID_(PUBLIC|PRIVATE)_KEY=.*\r?\n?/gm, "");
  fs.writeFileSync(
    file,
    `${cleaned}\n# Chaves de Web Push: preserve este par entre atualizações.\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`,
    { mode: 0o600 },
  );
  console.log(
    "Chaves Web Push gravadas no .env da API. Nenhuma chave privada é exibida.",
  );
}
