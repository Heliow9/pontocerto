import { startReminderWorker } from "./services/notifications.service.js";
import { startWhatsAppWorker } from "./services/whatsapp.service.js";
import { app } from "./app.js";
import { env } from "./config/env.js";

app.listen(env.PORT, () => {
  startReminderWorker();
  startWhatsAppWorker();
  console.log(`Ponto Certo API rodando na porta ${env.PORT}`);
});
