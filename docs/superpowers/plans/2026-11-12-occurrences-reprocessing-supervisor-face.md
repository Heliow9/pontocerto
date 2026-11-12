# Occurrences, Reprocessing and Supervisor Face Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit period reprocessing, reliable supervisor facial-photo permissions, and auditable full-day and hourly absence credits.

**Architecture:** Extend the existing `absences` workflow instead of creating a parallel module. Calculation keeps real worked minutes separate from excused minutes, merges declaration intervals, limits credits to scheduled deficit, and exposes both in reports. Existing module and sensitive permissions remain authoritative.

**Tech Stack:** TypeScript, Express, React, MySQL, Zod, Vitest, Supertest.

**Spec:** `docs/superpowers/specs/2026-11-12-occurrences-reprocessing-supervisor-face-design.md`

## Global Constraints

- Vacation and medical certificates cover complete days; declarations cover one date and a same-day time interval.
- Every new occurrence requires an audit observation.
- Occurrences never create, change, or delete real punches.
- Declaration credit cannot create overtime or a positive time bank.
- Supervisor access must be tenant- and company-scoped.
- No medical-document upload is included.

## Review Focus

- Overlapping declarations must be merged so the same minute is never credited twice; pin in Task 2 calculation tests.
- A declaration outside scheduled segments must credit zero minutes; pin in Task 2 calculation tests.
- A supervisor from another company must receive 404/403 for an employee photo; pin in Task 1 route tests.
- Saving or deleting an occurrence must recalculate only its employee and affected dates; pin in Task 3 API tests.
- Existing approved occurrences created before the migration may have no observation or times and must remain readable; pin in Task 3 API tests.

---

### Task 1: Supervisor facial-photo authorization

**Files:**
- Modify: `apps/api/src/routes/face.routes.ts`
- Modify: `apps/api/src/services/commercial-rules.ts`
- Modify: `apps/web/src/components/EmployeeFacePhoto.tsx`
- Test: `tests/supervisor-face-access.test.ts`
- Test: `tests/commercial.test.ts`

**Interfaces:**
- Consumes: `permissionModule(baseUrl)` and the authenticated `tenantId`, `companyId`, `role`.
- Produces: company-scoped face status/photo/save/delete routes for supervisors with `employees=write`.

- [ ] **Step 1: Write failing middleware and route tests**

Add tests proving a supervisor with `employees=write` can GET and POST `/face/employee/:id`, read-only cannot POST, and a supervisor cannot access an employee outside `auth.companyId`.

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- tests/supervisor-face-access.test.ts tests/commercial.test.ts`

Expected: FAIL because the current route lookup does not enforce supervisor company scope and the real middleware path is not covered.

- [ ] **Step 3: Implement scoped authorization**

Update the employee lookup in `face.routes.ts` to include the supervisor company boundary while retaining tenant-wide access for tenant administrators and RH. Preserve detailed API messages and have `EmployeeFacePhoto` display permission/provider/synchronization errors without hiding the photo controls.

- [ ] **Step 4: Run the focused tests and API/web builds**

Run: `npm test -- tests/supervisor-face-access.test.ts tests/commercial.test.ts && npm --workspace apps/api run build && npm --workspace apps/web run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/face.routes.ts apps/api/src/services/commercial-rules.ts apps/web/src/components/EmployeeFacePhoto.tsx tests/supervisor-face-access.test.ts tests/commercial.test.ts
git commit -m "fix: allow scoped supervisor face management"
```

### Task 2: Occurrence schema and declaration calculation

**Files:**
- Create: `apps/api/sql/036_occurrence_declarations.sql`
- Modify: `apps/api/src/services/calculation.service.ts`
- Test: `tests/occurrence-calculation.test.ts`

**Interfaces:**
- Produces: `declarationCreditMinutes(day, declarations, deficitMinutes): number` and persisted `excused_minutes` in `daily_time_calculations`.
- Consumes later: Task 3 API and Task 4 reports use the migration columns and calculated value.

- [ ] **Step 1: Write failing calculation tests**

Cover a 10:00–12:00 declaration inside an 08:00–12:00/13:00–18:00 schedule, a declaration outside the schedule, overlapping declarations, credit limited to the day's deficit, four real punches with no deficit, and full-day atestado/férias with no absence minutes.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/occurrence-calculation.test.ts`

Expected: FAIL because `declarationCreditMinutes` and declaration columns do not exist.

- [ ] **Step 3: Add migration 036**

Extend the absence type enum with `DECLARACAO`, add nullable `start_time`, `end_time`, and `created_by_user_id`, and add `excused_minutes INT NOT NULL DEFAULT 0` to `daily_time_calculations`. Existing rows remain valid.

- [ ] **Step 4: Implement declaration credit calculation**

Extend schedule-day loading to `entry_1`, `exit_1`, `entry_2`, `exit_2`. Merge overlapping declaration intervals, intersect them with scheduled work segments, and cap credit at `max(0, expectedMinutes - workedMinutes)`. Persist real `worked_minutes` unchanged, use worked plus credit for normal/late calculations, and never feed credit into overtime.

- [ ] **Step 5: Run focused tests and API build**

Run: `npm test -- tests/occurrence-calculation.test.ts tests/overtime-calculation.test.ts && npm --workspace apps/api run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/sql/036_occurrence_declarations.sql apps/api/src/services/calculation.service.ts tests/occurrence-calculation.test.ts
git commit -m "feat: calculate hourly declaration credits"
```

### Task 3: Auditable occurrence API with immediate recalculation

**Files:**
- Modify: `apps/api/src/routes/absences.routes.ts`
- Modify: `apps/api/src/utils/audit.ts` only if the existing audit sanitizer needs the new fields
- Test: `tests/occurrences-api.test.ts`

**Interfaces:**
- Consumes: Task 2 migration columns and `processPeriod({ tenantId, employeeId, start, end })`.
- Produces: validated list/create/delete APIs returning recalculation information.

- [ ] **Step 1: Write failing API tests**

Test required observation, full-day date ranges, a same-date declaration with valid start/end, rejection of declaration spanning dates or start after end, supervisor write/read permissions, company scope, legacy row listing, audit events, and exact recalculation ranges on create/delete.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/occurrences-api.test.ts`

Expected: FAIL on missing declaration validation, scope, audit, and recalculation.

- [ ] **Step 3: Implement discriminated validation and scoped queries**

Use a Zod discriminated union: `DECLARACAO` requires `startDate === endDate`, `startTime`, `endTime`, and `reason` length 3–500; other types require date range and the same reason length. Scope employee and occurrence queries by tenant plus supervisor company.

- [ ] **Step 4: Add audit and immediate recalculation**

After create, call `processPeriod` for the inserted employee/range and write `OCCURRENCE_CREATE`. Before delete, load the row, delete it, recalculate its original range, and write `OCCURRENCE_DELETE` with the prior values.

- [ ] **Step 5: Run focused tests and API build**

Run: `npm test -- tests/occurrences-api.test.ts tests/occurrence-calculation.test.ts && npm --workspace apps/api run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/absences.routes.ts apps/api/src/utils/audit.ts tests/occurrences-api.test.ts
git commit -m "feat: add auditable occurrence periods"
```

### Task 4: Occurrence, report and permission UX

**Files:**
- Modify: `apps/web/src/pages/OccurrencesPage.tsx`
- Modify: `apps/web/src/pages/ReportsPage.tsx`
- Modify: `apps/web/src/report-overtime.ts`
- Modify: `apps/api/src/routes/reports.routes.ts`
- Test: `tests/occurrence-ui-rules.test.ts`
- Test: `tests/report-overtime-actions.test.ts`

**Interfaces:**
- Consumes: occurrence fields `type`, `start_time`, `end_time`, `reason`, and report field `excused_minutes`.
- Produces: explicit reprocessing, declaration form, audit observation UI, and report/PDF annotations.

- [ ] **Step 1: Write failing UI-rule tests**

Test that declaration selection requires one date plus start/end times, full-day types use start/end dates, observation is required, reprocessing is available with report write permission, and overtime correction explains the missing `overtime.manage` permission.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/occurrence-ui-rules.test.ts tests/report-overtime-actions.test.ts`

Expected: FAIL because declaration form rules and reprocessing visibility do not exist.

- [ ] **Step 3: Implement the occurrence form and list**

Add `DECLARACAO` to labels. Render a single date plus start/end time for declarations; render start/end dates for full-day types. Rename and require `Observação para auditoria`, show credited time in the list, and report successful recalculation after create/delete.

- [ ] **Step 4: Implement explicit reprocessing and permission guidance**

After a report exists, show `Reprocessar período` to users with report write access, reuse the selected employee/date range, and reload the report. When a supervisor has report write access but lacks `overtime.manage`, render a concise notice with the exact sensitive permission name.

- [ ] **Step 5: Expose excused minutes in HTML and PDF reports**

Select `excused_minutes` in report data, show declaration/full-day annotations per row, add a total for aboned hours without modifying real points, and add the same annotation to the PDF.

- [ ] **Step 6: Run focused tests and builds**

Run: `npm test -- tests/occurrence-ui-rules.test.ts tests/report-overtime-actions.test.ts tests/occurrences-api.test.ts tests/occurrence-calculation.test.ts tests/supervisor-face-access.test.ts && npm --workspace apps/api run build && npm --workspace apps/web run build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/OccurrencesPage.tsx apps/web/src/pages/ReportsPage.tsx apps/web/src/report-overtime.ts apps/api/src/routes/reports.routes.ts tests/occurrence-ui-rules.test.ts tests/report-overtime-actions.test.ts
git commit -m "feat: expose occurrence credits and reprocessing"
```

### Task 5: Final verification and delivery

**Files:**
- Modify only if verification finds a regression in changed scope.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: deployable main branch and server instructions.

- [ ] **Step 1: Verify migrations and changed files**

Run: `git diff --check && npm --workspace apps/api run db:status`

Expected: no whitespace errors; migration status recognizes `036_occurrence_declarations.sql` (database connectivity permitting).

- [ ] **Step 2: Run the focused regression suite**

Run: `npm test -- tests/commercial.test.ts tests/supervisor-face-access.test.ts tests/overtime-calculation.test.ts tests/occurrence-calculation.test.ts tests/occurrences-api.test.ts tests/occurrence-ui-rules.test.ts tests/report-overtime-actions.test.ts`

Expected: PASS.

- [ ] **Step 3: Build production API and web**

Run: `npm --workspace apps/api run build && npm --workspace apps/web run build`

Expected: PASS.

- [ ] **Step 4: Review final diff and push**

Confirm the worktree contains no unrelated changes, then push `HEAD` to `origin/main` as explicitly requested by the user.
