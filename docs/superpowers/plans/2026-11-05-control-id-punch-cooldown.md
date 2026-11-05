# Control iD Punch Cooldown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ignorar novas batidas Control iD do mesmo funcionário ocorridas menos de 60 minutos após a última batida Control iD aceita.

**Architecture:** Uma função pura decide a janela usando segundos decorridos. O processador transacional consulta a última `time_entry` Control iD do funcionário sob o lock existente e rejeita o evento bruto sem criar outra marcação quando estiver na janela.

**Tech Stack:** TypeScript, Node.js test runner, MySQL.

**Spec:** `docs/superpowers/specs/2026-11-05-control-id-punch-cooldown-design.md`

## Global Constraints

- Janela fixa de 60 minutos.
- Exatamente 60 minutos é permitido.
- Apenas marcações com `source='CONTROL_ID'` participam da regra.
- Eventos ignorados permanecem auditáveis e não reiniciam a janela.

## Review Focus

- Limite de 59:59 deve bloquear e 60:00 deve permitir.
- Ausência de marcação anterior deve permitir.
- Uma marcação de outra origem não deve iniciar cooldown.
- Eventos concorrentes do mesmo funcionário devem continuar protegidos pelo lock existente.
- O evento ignorado não pode alterar a sequência da jornada.

---

### Task 1: Enforce Control iD cooldown

**Files:**
- Modify: `apps/api/src/services/control-id-punch-core.ts`
- Modify: `apps/api/src/services/control-id-punch.service.ts`
- Test: `apps/api/tests/control-id-punch.test.ts`

**Interfaces:**
- Produces: `controlIdPunchCooldownDecision(elapsedSeconds: number | null): { action: "ALLOW" | "IGNORE"; reason: "PUNCH_COOLDOWN" | null }`

- [x] Add failing boundary tests for no previous punch, 3599 seconds and 3600 seconds.
- [x] Run the focused test and confirm RED because the decision function does not exist.
- [x] Implement the pure decision function.
- [x] Query the latest accepted Control iD entry and classify a sub-60-minute event as duplicate with `PUNCH_COOLDOWN` before sequence calculation/insertion.
- [x] Run all Control iD tests and the API build.
- [x] Commit and publish the implementation.
