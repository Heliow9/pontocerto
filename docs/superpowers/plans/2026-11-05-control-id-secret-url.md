# Control iD Secret URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Autenticar iDFace Push e Monitor por URL secreta quando o firmware não expõe Bearer Token.

**Architecture:** Reutilizar o mesmo segredo e hash existentes, aceitando a credencial de um parâmetro de rota ou do cabeçalho Bearer. Montar aliases de rotas sob `/control-id/device/:credential` sem remover endpoints nativos. Mostrar as URLs somente junto à credencial recém-gerada.

**Tech Stack:** TypeScript, Express, React, Node test runner, Supertest.

**Spec:** `docs/superpowers/specs/2026-11-05-control-id-secret-url-design.md`

## Global Constraints

- Preservar autenticação Bearer e endpoints existentes.
- Nunca persistir ou devolver novamente o segredo em texto puro.
- Validar credencial e `deviceId` em todas as rotas.
- Não incluir segredo em query string.

## Review Focus

- Credencial malformada na URL retorna 401 sem causar erro interno.
- Credencial válida com `deviceId` diferente retorna 403.
- Endpoints Bearer antigos continuam respondendo como antes.
- Resultado e Monitor usam a mesma resolução segura do Push.
- Painel não mostra URL secreta depois que a credencial é descartada.

---

### Task 1: Credential resolution and public routes

**Files:**
- Modify: `apps/api/src/services/control-id.service.ts`
- Modify: `apps/api/src/routes/control-id.routes.ts`
- Test: `apps/api/tests/control-id-service.test.ts`
- Test: `apps/api/tests/control-id-api.test.ts`

**Interfaces:**
- Produces: `resolveControlIdTerminal({ authorization, credential, vendorDeviceId, ... })`.
- Produces: Push/Result at `/control-id/device/:credential/push|result` and Monitor at `/control-id/device/:credential/monitor/*`.

- [ ] Write failing service and route tests for path credential, malformed secret, mismatched device and backward compatibility.
- [ ] Run focused tests and verify the new cases fail for missing behavior.
- [ ] Implement the smallest credential fallback and route aliases.
- [ ] Run focused tests and API build until green.
- [ ] Commit the task.

### Task 2: Installation UI and documentation

**Files:**
- Modify: `apps/web/src/pages/ControlIdPage.tsx`
- Modify: `docs/CONTROL_ID_IDFACE_TESTE.md`
- Test: `tests/control-id-ui.source.test.mjs`

**Interfaces:**
- Consumes: route base `/control-id/device/:credential` from Task 1.
- Produces: one-time Push, Result and Monitor configuration copy tied to the in-memory credential.

- [ ] Write a failing UI behavior/source test for the one-time secret URLs and safe guidance.
- [ ] Run the focused test and verify it fails for the missing UI.
- [ ] Implement the credential card URLs and update the runbook.
- [ ] Run focused test plus web build until green.
- [ ] Commit the task.

### Task 3: Whole change verification

**Files:**
- Verify only.

**Interfaces:**
- Consumes: Tasks 1 and 2.

- [ ] Run Control iD tests, API build, web build and full repository tests.
- [ ] Review the complete diff for secret leakage and route regressions.
- [ ] Record any unrelated pre-existing failures without modifying unrelated user files.
