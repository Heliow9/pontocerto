# Supervisor Permissions and Overtime Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Liberar a gestão de funcionários para supervisores e adicionar desconto automático de intervalo mais exceção diária auditável de hora extra.

**Architecture:** As dependências da tela de funcionários serão servidas pelo próprio módulo `/employees`, enquanto `/face` e `/devices` herdarão sua permissão. O cálculo ganhará uma função pura para dedução do intervalo e consultará exceções diárias persistentes antes de gravar o saldo. A interface exporá a flag no funcionário e comandos auditáveis no espelho mensal.

**Tech Stack:** TypeScript, Express, React, MySQL, Vitest, Supertest.

**Spec:** `docs/superpowers/specs/2026-11-10-supervisor-permissions-and-overtime-overrides-design.md`

## Global Constraints

- Preservar todas as marcações originais.
- A nova flag de funcionário deve iniciar desativada.
- Deduzir intervalo somente em dia normal, com exatamente duas marcações e intervalo completo na escala.
- Exceção diária zera somente horas extras e deve ser reversível e auditável.
- Aplicar TDD: cada alteração de produção nasce após teste falhando pelo motivo esperado.

## Review Focus

- Supervisor com leitura não pode executar escrita em foto, grupos ou funcionário; cobrir no Task 1.
- Tela de funcionários não pode exigir permissão geral de empresas/escalas/locais; cobrir no Task 1.
- Quatro marcações não podem sofrer segunda dedução de intervalo; cobrir no Task 2.
- Exceção deve sobreviver a novo processamento; cobrir no Task 3.
- Restauração deve recuperar o cálculo original e manter histórico; cobrir no Task 3.

---

### Task 1: Permissões completas de funcionário para supervisor

**Files:**
- Modify: `apps/api/src/services/commercial-rules.ts`
- Modify: `apps/api/src/routes/employees.routes.ts`
- Modify: `apps/web/src/pages/EmployeesPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `tests/commercial.test.ts`
- Test: `tests/employees-api.test.ts`

**Interfaces:**
- Produces: `GET /employees/options`, `GET /employees/:id/locations`; `permissionModule('/face'|'/devices'|'/groups') === 'employees'`.

- [ ] Write failing permission tests proving `/face` and `/devices` use `employees`, read cannot write, and employee options are returned through `/employees`.
- [ ] Run `npm test -- tests/commercial.test.ts tests/employees-api.test.ts` and verify the new assertions fail for missing mappings/endpoints.
- [ ] Implement mappings, endpoints, frontend consumption and session permission refresh on focus/visibility/navigation.
- [ ] Run the focused tests and `npm run build --workspace apps/api && npm run build --workspace apps/web`.
- [ ] Commit `fix: honor supervisor employee permissions`.

### Task 2: Regra automática de intervalo por funcionário

**Files:**
- Create: `apps/api/sql/035_employee_break_and_overtime_overrides.sql`
- Modify: `apps/api/src/routes/employees.routes.ts`
- Modify: `apps/api/src/services/calculation.service.ts`
- Modify: `apps/web/src/pages/EmployeesPage.tsx`
- Test: `tests/overtime-calculation.test.ts`

**Interfaces:**
- Produces: `scheduledBreakMinutes(day): number`, `adjustWorkedMinutesForScheduledBreak(entries, day, enabled): { workedMinutes:number; deductedMinutes:number }`; employee field `autoDeductScheduledBreak`.

- [ ] Add failing unit cases for two punches with a 60-minute interval, disabled flag, four punches, missing interval and overnight-safe interval math.
- [ ] Run `npm test -- tests/overtime-calculation.test.ts` and verify failure because the adjustment API does not exist.
- [ ] Add migration column/table foundation, employee API field, calculation helper and checkbox in the employee form.
- [ ] Run focused tests and API/web builds.
- [ ] Commit `feat: deduct scheduled breaks for selected employees`.

### Task 3: Exceção diária auditável de hora extra

**Files:**
- Modify: `apps/api/sql/035_employee_break_and_overtime_overrides.sql`
- Modify: `apps/api/src/services/calculation.service.ts`
- Modify: `apps/api/src/routes/reports.routes.ts`
- Test: `tests/overtime-override-api.test.ts`
- Test: `tests/overtime-calculation.test.ts`

**Interfaces:**
- Produces: `PUT /reports/overtime-override/:employeeId/:workDate`, `DELETE /reports/overtime-override/:employeeId/:workDate`; report day fields `overtime_ignored`, `overtime_ignore_reason`, `break_deducted_minutes`.

- [ ] Add failing API/calculation tests for required reason, tenant isolation, persistence after recalculation and reversible restore.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement soft-deleted override storage, authorization with `overtime.manage`, audit events, recalculation and report/PDF data exposure.
- [ ] Run focused tests and API build.
- [ ] Commit `feat: add auditable daily overtime overrides`.

### Task 4: Controles no relatório e integração final

**Files:**
- Modify: `apps/web/src/pages/ReportsPage.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `tests/ui.e2e.ts`

**Interfaces:**
- Consumes: endpoints e campos produzidos pelo Task 3.

- [ ] Add a failing UI scenario for ignore-with-reason, immediate total refresh, visible indicator and restore.
- [ ] Run the focused Playwright scenario or component-level Vitest path and verify the missing controls fail.
- [ ] Implement the daily action modal/controls and automatic-break indicator with permission-aware visibility.
- [ ] Run UI verification, API/web builds and the full `npm test` suite; record any pre-existing unrelated failures explicitly.
- [ ] Commit `feat: manage overtime exceptions from monthly report`.

### Task 5: Branch verification and delivery

**Files:**
- Review all files changed since the design commit.

**Interfaces:**
- Consumes: all prior task outputs.

- [ ] Run database migration status validation, focused tests, `npm run check`, and `npm test`.
- [ ] Review tenant isolation, authorization, audit payloads and calculation boundaries against the spec.
- [ ] Fix Critical/Important findings using RED→GREEN tests and commit the fix pass.
- [ ] Prepare deployment commands and Git handoff without pushing unless explicitly requested.
