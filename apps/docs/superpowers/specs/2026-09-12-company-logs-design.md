# Company Logs Design

## Goal
Add a company-scoped Logs area to the web management system so each company can monitor WhatsApp delivery events and operational/system errors for the last 90 days.

## Access and tenancy
- Logs are isolated by `tenant_id` and `company_id`.
- Company users can only query logs for companies they are authorized to manage.
- Supported roles: SUPER_ADMIN, TENANT_ADMIN, RH.
- No secrets, JWTs, passwords, WhatsApp auth blobs, encryption keys or `.env` values are stored.

## Retention and filters
- Retain logs for 90 days.
- Quick ranges: 24 hours, 7 days, 30 days, 90 days.
- Filter by level: INFO, WARNING, ERROR.
- Filter by module: WHATSAPP, POINT, OFFLINE, SYNC, API, SYSTEM.
- Paginate server-side.

## Data model
Create `system_logs` with: id, tenant_id, company_id, level, module, event_type, message, details_json, employee_id, recipient, created_at. Add indexes for tenant/company/date, module/date and level/date.

## Logging API
Create a reusable service to write logs safely. `details_json` is sanitized before persistence and recipient numbers are masked in API responses.

## Query API
Create authenticated endpoints under `/logs/companies/:id`:
- `GET /summary?range=24h|7d|30d|90d`
- `GET /?range=...&level=...&module=...&page=1&pageSize=50`

Summary returns: errors, warnings, whatsappDelivered, whatsappPending, lastError, whatsappStatus.

## WhatsApp integration
Log connection state transitions, recipient validation failures, message queue/send/accepted/delivered/read, rate limiting, ACK timeout, reconnects and errors.

## API errors
The global Express error handler writes a company log when the authenticated request has a `companyId`. It stores sanitized route/method/error metadata only.

## Web UI
Inside the company edit modal, below automation, add a `CompanyLogs` section with:
- summary cards;
- range buttons 24h/7d/30d/90d;
- level and module filters;
- paginated table;
- expandable details;
- manual refresh.

## Retention worker
Run a daily cleanup that removes `system_logs.created_at < NOW() - INTERVAL 90 DAY`.
