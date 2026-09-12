# Company Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add isolated 90-day operational logs for each company with WhatsApp and API/error observability in the web company panel.

**Architecture:** Persist structured logs in MySQL through a dedicated logging service, expose company-scoped paginated APIs, instrument WhatsApp and API errors, and render a filtered Logs panel inside the existing company modal. A cleanup worker enforces 90-day retention.

**Tech Stack:** Node.js 22, Express, MySQL 8-compatible SQL, TypeScript, React 19, Axios.

**Spec:** `docs/superpowers/specs/2026-09-12-company-logs-design.md`

## Global Constraints
- Logs retained for 90 days.
- Company isolation by tenant_id + company_id is mandatory.
- Quick filters: 24h, 7d, 30d, 90d.
- Never persist secrets, JWTs, passwords, encryption keys or WhatsApp auth blobs.
- Existing WhatsApp worker behavior and anti-flood controls must continue working.

---

### Task 1: Database schema and log service

**Files:**
- Create: `apps/api/sql/015_system_logs.sql`
- Create: `apps/api/src/services/system-log.service.ts`
- Test: `tests/company-logs.test.ts`

**Interfaces:**
- Produces: `writeSystemLog(input)`, `cleanupSystemLogs()`, `maskRecipient(value)`.

- [ ] Write a failing source-level regression test asserting migration, service and 90-day cleanup exist.
- [ ] Run the focused test and confirm failure.
- [ ] Add migration and service implementation.
- [ ] Re-run focused test.

### Task 2: Company log query API and retention worker

**Files:**
- Create: `apps/api/src/routes/logs.routes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Test: `tests/company-logs.test.ts`

**Interfaces:**
- Produces: `GET /logs/companies/:id`, `GET /logs/companies/:id/summary`, `startSystemLogCleanupWorker()`.

- [ ] Extend failing test for route registration, filters and company scoping.
- [ ] Run and confirm failure.
- [ ] Implement routes and worker registration.
- [ ] Re-run focused test.

### Task 3: Instrument WhatsApp and API errors

**Files:**
- Modify: `apps/api/src/services/whatsapp.service.ts`
- Modify: `apps/api/src/app.ts`
- Test: `tests/company-logs.test.ts`

**Interfaces:**
- Consumes: `writeSystemLog`.
- Produces structured WHATSAPP and API events.

- [ ] Extend test for required WhatsApp event logging and sanitized API error logging.
- [ ] Run and confirm failure.
- [ ] Add minimal event writes without altering delivery semantics.
- [ ] Re-run focused test.

### Task 4: Company Logs web panel

**Files:**
- Create: `apps/web/src/components/CompanyLogs.tsx`
- Modify: `apps/web/src/pages/CompaniesPage.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `tests/company-logs.test.ts`

**Interfaces:**
- Consumes the log endpoints.
- Produces company-scoped summary, filters, table, expandable details and pagination.

- [ ] Extend test for component, range controls and company page integration.
- [ ] Run and confirm failure.
- [ ] Implement UI.
- [ ] Re-run focused test.

### Task 5: Verification and packaging

**Files:**
- Modify: `CHANGELOG.md`

- [ ] Run source regression test.
- [ ] Run TypeScript syntax/transpile checks available in the environment.
- [ ] Verify no `.env`, `node_modules`, or `.git` enter the archive.
- [ ] Package full V6 and patch V6 ZIPs.
