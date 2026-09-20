# SaaS Admin UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a consistent, responsive, professional SaaS Admin UI across all commercial and administrative screens while preserving current behavior.

**Architecture:** Keep the existing React page structure and API flows. Centralize the redesign in `commercial.css`, enhance the SaaS shell markup in `SaasPortal.tsx`, and add small semantic classes/status badges in commercial pages only where CSS alone is insufficient.

**Tech Stack:** React 19, TypeScript, Vite, existing CSS, existing Ponto Certo components.

**Spec:** `docs/superpowers/specs/2026-09-13-saas-admin-uiux-redesign-design.md`

## Global Constraints
- Do not change API routes or payloads.
- Do not add npm dependencies.
- Preserve all current SaaS Admin functionality.
- Keep responsive behavior for desktop, tablet and mobile.
- Keep keyboard focus visibility and modal accessibility.

---

### Task 1: SaaS shell and navigation
**Files:** `apps/web/src/pages/SaasPortal.tsx`, `apps/web/src/components/Icon.tsx`, `apps/web/src/pages/commercial.css`
- [ ] Add a structured SaaS sidebar/topbar shell using current hash navigation.
- [ ] Add relevant existing inline SVG icon names.
- [ ] Verify TypeScript compilation.

### Task 2: Shared commercial visual system
**Files:** `apps/web/src/pages/commercial.css`, `apps/web/src/pages/CommercialUi.tsx`
- [ ] Define design tokens and shared styles for cards, filters, fields, buttons, badges, tables, forms, empty/error/loading states and responsive behavior.
- [ ] Improve shared field/features/save states without changing behavior.
- [ ] Verify TypeScript compilation.

### Task 3: Dashboard, clients, plans and subscriptions
**Files:** `apps/web/src/pages/SaasPortal.tsx`, `apps/web/src/pages/SaasPage.tsx`, `apps/web/src/pages/SaasPlans.tsx`
- [ ] Apply page headers, metric cards, status treatment and panel layout.
- [ ] Improve plan cards and subscription table.
- [ ] Verify TypeScript compilation.

### Task 4: Proposals and contracts
**Files:** `apps/web/src/pages/ProposalsPage.tsx`, `apps/web/src/pages/ContractsPage.tsx`, `apps/web/src/pages/commercial.css`
- [ ] Move filters into professional filter panels.
- [ ] Add status badges and clearer table/action hierarchy.
- [ ] Improve proposal/contract modal sections and document/history presentation.
- [ ] Verify TypeScript compilation.

### Task 5: Audit, SaaS settings, email and password
**Files:** `apps/web/src/pages/AuditPage.tsx`, `apps/web/src/pages/SaasGeneral.tsx`, `apps/web/src/pages/SaasEmail.tsx`, `apps/web/src/pages/PasswordPage.tsx`
- [ ] Standardize headers and content panels.
- [ ] Improve audit filters/export/pagination and status visibility.
- [ ] Improve settings forms and credential status presentation.
- [ ] Verify TypeScript compilation.

### Task 6: Verification and packaging
**Files:** all changed frontend files and docs
- [ ] Run `npx tsc --noEmit -p apps/web/tsconfig.json`.
- [ ] Run the available web build when native dependencies permit it.
- [ ] Inspect changed files for accidental backend/API changes.
- [ ] Package a clean ZIP excluding `node_modules`, `.git`, build artifacts and real `.env` files.
