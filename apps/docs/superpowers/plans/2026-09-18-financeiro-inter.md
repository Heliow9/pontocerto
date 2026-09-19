# Financeiro SaaS + Banco Inter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar no Ponto Certo um módulo Financeiro SaaS completo para mensalidades, implantação e cobranças avulsas, integrado à API Cobrança (Boleto com Pix) do Banco Inter, com baixa automática, bloqueio financeiro separado da suspensão administrativa, exceções temporárias e telas SUPER_ADMIN/tenant.

**Architecture:** Preservar o comercial existente (`plans`, `subscriptions`, `tenant_contracts`, `commercial_*`, `tenants.status`) e adicionar um ledger financeiro independente. O Banco Inter será encapsulado em um cliente mTLS/OAuth2 próprio; regras financeiras e de acesso ficam em serviços separados, com rotas SUPER_ADMIN, rotas de autoatendimento e webhook público. O bloqueio será calculado por cobrança e exceção, aplicado por middleware em cada requisição operacional autenticada.

**Tech Stack:** Node.js 22+, TypeScript 5.6, Express 4, MySQL 8/mysql2, Zod, React 19, Vite 5, CSS existente, Node `https`/`fs`/`crypto`, QR Code já disponível no backend.

**Spec:** `docs/superpowers/specs/2026-09-18-financeiro-inter-design.md`

## Global Constraints

- Sem NFS-e ou automação fiscal nesta versão.
- Tipos de cobrança: `MONTHLY`, `IMPLEMENTATION`, `AD_HOC`.
- Mensalidade: vencimento exclusivamente nos dias 5, 10 ou 15, geração automática no dia 1, uma cobrança por tenant/competência.
- Bloqueio financeiro: 3 dias corridos após o vencimento, sem alterar `tenants.status`.
- Exceção administrativa: +5, +10, +30 dias ou data personalizada; cobrança permanece vencida.
- Banco Inter: API Cobrança (Boleto com Pix), OAuth2 client credentials + mTLS, scopes `boleto-cobranca.read boleto-cobranca.write`.
- Segredos do Inter ficam somente no backend e nunca em logs/API/frontend.
- Webhook não confia no payload para dar baixa: persiste, deduplica e reconcilia consultando a cobrança no Inter.
- Pagamento parcial/valor divergente não dá baixa automática.
- `tenants.status='SUSPENDED'` continua sendo suspensão administrativa independente.
- TENANT_ADMIN bloqueado pode ver apenas autoatendimento financeiro e senha; demais perfis recebem indisponibilidade genérica.
- Testar build API e web e os testes de regressão relevantes antes de empacotar.

---

### Task 1: Migration e domínio financeiro

**Files:**
- Create: `api/sql/021_financial_billing.sql`
- Create: `api/src/services/financial-rules.ts`
- Create: `api/tests/financial-rules.test.ts`
- Modify: `api/package.json`

**Interfaces:**
- Produces: `ChargeType`, `ChargeStatus`, `BillingProfile`, `calculateBlockAt(dueDate, graceDays)`, `isBlockingStatus(status)`, `validateDueDay(day)`, `monthCompetence(date)`.

- [ ] **Step 1: Write failing unit tests for due days, block date and blocking statuses**

Create `api/tests/financial-rules.test.ts` using Node test/assert and cover days 5/10/15, invalid due day, due date + 3 calendar days, and `OPEN/OVERDUE` blocking eligibility.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test:financial-rules`
Expected: FAIL because `financial-rules.ts` does not exist yet.

- [ ] **Step 3: Create migration and rules module**

Migration must create: `saas_billing_profiles`, `financial_charges`, `financial_payments`, `financial_access_exceptions`, `financial_webhook_events`, `financial_events`; include timestamps, indexes, unique monthly competence index, provider identifiers, Inter boleto/Pix fields, and no FK that prevents safe tenant deletion behavior unless existing schema style already guarantees it.

- [ ] **Step 4: Add `test:financial-rules` npm script and run it**

Run: `npm run test:financial-rules`
Expected: PASS.

### Task 2: Banco Inter client mTLS/OAuth2

**Files:**
- Create: `api/src/services/inter-billing.service.ts`
- Create: `api/tests/inter-billing-core.test.ts`
- Modify: `api/src/config/env.ts`
- Modify: `api/.env.example`
- Modify: `api/package.json`

**Interfaces:**
- Produces: `getInterConnectionStatus()`, `testInterConnection()`, `issueInterCharge(input)`, `getInterCharge(providerChargeId)`, `getInterChargePdf(providerChargeId)`, `cancelInterCharge(providerChargeId, reason)`, `configureInterWebhook(url)`, `getInterWebhook()`.
- Uses: Node `https.request` with `cert`/`key` from file paths, token cache with early-expiry margin.

- [ ] **Step 1: Write failing tests for configuration redaction, token cache helper and Inter payload mapping**
- [ ] **Step 2: Run tests and confirm failure**
- [ ] **Step 3: Implement env parsing and mTLS request helper**
- [ ] **Step 4: Implement OAuth `/oauth/v2/token` with scopes `boleto-cobranca.read boleto-cobranca.write` and 60-minute cache based on `expires_in`**
- [ ] **Step 5: Implement billing endpoints under `/cobranca/v3/cobrancas` including webhook management**
- [ ] **Step 6: Run tests and API TypeScript build**

### Task 3: Financial service, issue flow and reconciliation

**Files:**
- Create: `api/src/services/financial.service.ts`
- Create: `api/tests/financial-service-core.test.ts`
- Modify: `api/package.json`

**Interfaces:**
- Produces: `createMonthlyCharge`, `createImplementationCharge`, `createAdHocCharge`, `issueCharge`, `reconcileCharge`, `cancelCharge`, `recordFinancialEvent`, `listCharges`, `getCharge`, `listReceipts`, `getFinancialDashboard`.
- Uses: `issueInterCharge`, `getInterCharge`, `calculateBlockAt`.

- [ ] **Step 1: Write failing tests for monthly dedupe key, provider `seuNumero`, status normalization and reconciliation decision**
- [ ] **Step 2: Run tests and confirm failure**
- [ ] **Step 3: Implement pure mapping/decision helpers**
- [ ] **Step 4: Implement DB-backed create/issue/reconcile/cancel methods with transactions and no duplicate retry on unknown Inter result**
- [ ] **Step 5: Run tests and API build**

### Task 4: Blocking, exceptions and request middleware

**Files:**
- Create: `api/src/services/financial-access.service.ts`
- Create: `api/src/middlewares/financial-access.ts`
- Create: `api/tests/financial-access-core.test.ts`
- Modify: `api/src/app.ts`
- Modify: `api/src/routes/auth.routes.ts`
- Modify: `api/package.json`

**Interfaces:**
- Produces: `getTenantFinancialAccess(tenantId)`, `grantFinancialException`, `revokeFinancialException`, `financialAccessMiddleware`.
- Error contract: HTTP 402 with `{code:'FINANCIAL_BLOCKED', message, tenantAdmin:boolean}` for blocked operational requests.

- [ ] **Step 1: Write failing tests for active exception, multiple blocking charges and last-payment unlock logic**
- [ ] **Step 2: Implement access decision helpers and DB service**
- [ ] **Step 3: Implement middleware with allowlist for `/auth`, `/billing`, password/self-service, health and SUPER_ADMIN**
- [ ] **Step 4: Extend `/auth/me` response with generic `financialBlocked` plus detailed status only for TENANT_ADMIN**
- [ ] **Step 5: Run tests and API build**

### Task 5: SUPER_ADMIN finance API and tenant self-service API

**Files:**
- Create: `api/src/routes/saas-finance.routes.ts`
- Create: `api/src/routes/billing.routes.ts`
- Modify: `api/src/routes/saas.routes.ts`
- Modify: `api/src/app.ts`

**Interfaces:**
- SUPER_ADMIN endpoints exactly as the approved spec under `/saas/finance`.
- Tenant endpoints under `/billing/self`.

- [ ] **Step 1: Add Zod schemas for billing profile, charge creation, exception and filters**
- [ ] **Step 2: Add dashboard/list/detail/create/issue/cancel/reconcile/profile/exception/Inter status routes**
- [ ] **Step 3: Add tenant status/charges/PDF routes restricted to TENANT_ADMIN for financial details**
- [ ] **Step 4: Run API build**

### Task 6: Inter webhook and idempotent payment processing

**Files:**
- Create: `api/src/routes/inter-webhook.routes.ts`
- Create: `api/tests/inter-webhook-core.test.ts`
- Modify: `api/src/app.ts`
- Modify: `api/package.json`

**Interfaces:**
- Public endpoint: `POST /webhooks/inter/billing`.
- Produces deterministic `eventKey` from stable provider fields or SHA-256 of canonical payload as fallback.

- [ ] **Step 1: Write failing tests for canonical payload hash/idempotency key and payment-origin normalization**
- [ ] **Step 2: Implement raw event persistence before processing**
- [ ] **Step 3: Reconcile provider charge before recording `financial_payments`**
- [ ] **Step 4: Mark webhook `PROCESSED`/`FAILED` without exposing secrets**
- [ ] **Step 5: Run tests and API build**

### Task 7: Worker financeiro mensal e overdue reconciliation

**Files:**
- Create: `api/src/services/financial-worker.service.ts`
- Create: `api/tests/financial-worker-core.test.ts`
- Modify: `api/src/server.ts`
- Modify: `api/package.json`

**Interfaces:**
- Produces: `runFinancialWorker()` and `startFinancialWorker()`.
- Worker: start once, then safe periodic interval; generate monthly charges only on day 1; mark overdue; retry reconcile of ambiguous states; never duplicate charge/payment.

- [ ] **Step 1: Write failing tests for day-1 generation gate and competence selection**
- [ ] **Step 2: Implement worker pure scheduling helpers**
- [ ] **Step 3: Implement DB worker with per-tenant error isolation**
- [ ] **Step 4: Start worker in `server.ts` only when enabled and never crash API on worker failure**
- [ ] **Step 5: Run tests and API build**

### Task 8: SUPER_ADMIN finance UI

**Files:**
- Create: `web/src/pages/SaasFinance.tsx`
- Create: `web/src/pages/SaasFinanceInter.tsx`
- Modify: `web/src/pages/SaasPortal.tsx`
- Modify: `web/src/pages/SaasPage.tsx`
- Modify: `web/src/pages/commercial.css`
- Modify: `web/src/components/Icon.tsx` if required for finance icons

**Interfaces:**
- Routes/hash sections: `#saas/finance`, `#saas/finance-inter`.
- Uses `/saas/finance/*` APIs.

- [ ] **Step 1: Add Financeiro navigation and dashboard cards**
- [ ] **Step 2: Add charge filters and creation modals for MONTHLY/IMPLEMENTATION/AD_HOC**
- [ ] **Step 3: Add tenant billing profile editor with due day 5/10/15 and grace days fixed/default 3**
- [ ] **Step 4: Add exception modal (+5/+10/+30/custom) and revoke action**
- [ ] **Step 5: Add Inter status/test/configure webhook page with no secret fields**
- [ ] **Step 6: Add financial status summary/actions to client list**
- [ ] **Step 7: Run web build**

### Task 9: Tenant blocked experience and payment self-service

**Files:**
- Create: `web/src/pages/BillingBlockedPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/api.ts`
- Modify: `web/src/styles.css`

**Interfaces:**
- Axios emits `pc:financial-blocked` on HTTP 402 `FINANCIAL_BLOCKED`.
- TENANT_ADMIN receives invoice details and can download boleto; other roles see generic notice.

- [ ] **Step 1: Add 402 interceptor event and financial-state refresh**
- [ ] **Step 2: Render detailed TENANT_ADMIN blocked page with Pix copy action, QR generated by backend/data URL endpoint or local QR package if available, boleto download**
- [ ] **Step 3: Render generic blocked page for non-admin roles**
- [ ] **Step 4: Keep password/logout available and retry status button**
- [ ] **Step 5: Run web build**

### Task 10: Production docs, regression verification and package

**Files:**
- Modify: `api/.env.example`
- Create: `FINANCEIRO_INTER_V1.md`
- Create: `CHANGELOG_FINANCEIRO_INTER_V1.md`
- Modify: `.gitignore` if needed to protect Inter credential file patterns and secrets directory

**Interfaces:**
- Deployment guide covers migration, env vars, secure file permissions, test connection, webhook URL, PM2 restart and rollback.

- [ ] **Step 1: Document exact environment variables and secret-file placement**
- [ ] **Step 2: Document migration and webhook activation sequence**
- [ ] **Step 3: Run all financial tests**
- [ ] **Step 4: Run existing relevant regression tests**
- [ ] **Step 5: Run `npm run build` in API and web**
- [ ] **Step 6: Inspect for accidental secrets (`INTER_CLIENT_SECRET`, private-key PEM headers, `.key/.crt` files)**
- [ ] **Step 7: Zip the completed `apps` directory for delivery**
