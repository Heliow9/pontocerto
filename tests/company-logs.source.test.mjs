import fs from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('..', import.meta.url).pathname;
const read = (p) => fs.readFileSync(root + p, 'utf8');
const exists = (p) => fs.existsSync(root + p);

assert.equal(exists('/apps/api/sql/015_system_logs.sql'), true, 'migration 015 missing');
assert.equal(exists('/apps/api/src/services/system-log.service.ts'), true, 'system log service missing');
assert.equal(exists('/apps/api/src/routes/logs.routes.ts'), true, 'logs route missing');
assert.equal(exists('/apps/web/src/components/CompanyLogs.tsx'), true, 'CompanyLogs UI missing');

const migration = read('/apps/api/sql/015_system_logs.sql');
for (const token of ['CREATE TABLE IF NOT EXISTS system_logs', 'tenant_id', 'company_id', 'created_at']) assert.ok(migration.includes(token), `migration missing ${token}`);

const service = read('/apps/api/src/services/system-log.service.ts');
for (const token of ['writeSystemLog', 'cleanupSystemLogs', 'INTERVAL 90 DAY', 'maskRecipient']) assert.ok(service.includes(token), `service missing ${token}`);

const routes = read('/apps/api/src/routes/logs.routes.ts');
for (const token of ['24h', '7d', '30d', '90d', 'tenant_id=?', 'company_id=?', '/companies/:id/summary']) assert.ok(routes.includes(token), `routes missing ${token}`);

const app = read('/apps/api/src/app.ts');
assert.ok(app.includes('logsRouter'), 'logs router not mounted');
assert.ok(app.includes('writeSystemLog'), 'API error logger not wired');

const server = read('/apps/api/src/server.ts');
assert.ok(server.includes('startSystemLogCleanupWorker'), 'cleanup worker not started');

const whatsapp = read('/apps/api/src/services/whatsapp.service.ts');
for (const event of ['WHATSAPP_CONNECTED','WHATSAPP_DELIVERED','WHATSAPP_READ','WHATSAPP_RATE_LIMITED','WHATSAPP_SEND_ERROR']) assert.ok(whatsapp.includes(event), `WhatsApp missing ${event}`);

const companyPage = read('/apps/web/src/pages/CompaniesPage.tsx');
assert.ok(companyPage.includes('CompanyLogs'), 'CompanyLogs not integrated');

const ui = read('/apps/web/src/components/CompanyLogs.tsx');
for (const token of ['24 horas','7 dias','30 dias','90 dias','WhatsApp','Erro','Atualizar']) assert.ok(ui.includes(token), `UI missing ${token}`);

console.log('company logs source regression: PASS');
