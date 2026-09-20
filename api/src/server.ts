import { startReminderWorker } from "./services/notifications.service.js";
import { startWhatsAppWorker } from "./services/whatsapp.service.js";
import { startOvertimeAlertWorker } from "./services/overtime.service.js";
import { startSystemLogCleanupWorker } from "./services/system-log.service.js";
import { app } from "./app.js";
import { startAuditRetentionWorker } from "./services/audit-retention.service.js";
import { env } from "./config/env.js";
import { startFinancialWorker } from "./services/financial-worker.service.js";
import { startProductSyncWorker } from "./services/product-sync-worker.service.js";

app.listen(env.PORT, () => {
  startReminderWorker();
  startOvertimeAlertWorker();
  startWhatsAppWorker();
  startSystemLogCleanupWorker();
  startAuditRetentionWorker();
  startFinancialWorker();
  startProductSyncWorker();
  console.log(`Ponto Certo API rodando na porta ${env.PORT}`);
});
