# Control iD Sync Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar e atualizar automaticamente o diagnóstico detalhado da sincronização de cada funcionário.

**Architecture:** A API consulta funcionários, mapeamentos e o job atual, e uma função pura converte esses dados em um diagnóstico seguro. A página consome o mesmo endpoint existente, faz polling de 5 segundos e oferece atualização manual.

**Tech Stack:** TypeScript, Express, MySQL, React.

**Spec:** `docs/superpowers/specs/2026-11-05-control-id-sync-diagnostics-design.md`

## Global Constraints

- Não criar migração.
- Não retornar credencial, foto ou payload do job.
- Toda consulta deve restringir tenant, empresa e terminal.

## Review Focus

- Funcionário inativo deve mostrar correção manual, sem ser tratado como falha do equipamento.
- Funcionário ativo sem foto deve explicar como cadastrar a foto.
- Erro do iDFace deve preservar a mensagem técnica e identificar a etapa.
- Polling não pode continuar após desmontagem ou mudança de empresa.
- Falha silenciosa do polling não deve gerar notificações repetidas.

### Task 1: Contrato de diagnóstico da API

**Files:**
- Create: `apps/api/src/services/control-id-diagnostics.ts`
- Create: `apps/api/tests/control-id-diagnostics.test.ts`
- Modify: `apps/api/src/routes/control-id.routes.ts`

- [ ] Escrever testes falhando para inativo, sem foto, pendente, sincronizado e erro facial.
- [ ] Executar os testes e confirmar falha pela ausência da função.
- [ ] Implementar `buildControlIdEmployeeDiagnostic` e integrar a consulta administrativa.
- [ ] Executar os testes e o build da API.

### Task 2: Acompanhamento na tela

**Files:**
- Modify: `apps/web/src/pages/ControlIdPage.tsx`

- [ ] Consumir `diagnostics`, renderizar tabela detalhada e botão de atualização.
- [ ] Fazer polling a cada 5 segundos com limpeza no unmount/mudança de empresa.
- [ ] Executar o build web e validar tipos.

### Task 3: Entrega

- [ ] Executar testes e builds relevantes.
- [ ] Revisar o diff para dados sensíveis e isolamento multiempresa.
- [ ] Commitar e enviar ao GitHub.

