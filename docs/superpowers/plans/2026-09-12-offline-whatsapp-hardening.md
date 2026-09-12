# Offline Punch and WhatsApp Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir marcações offline duplicadas, exibir/confirmar selfie offline e estabilizar conexão/estado do WhatsApp da empresa.

**Architecture:** A fila mobile ganha validação semântica e detecção explícita de conectividade; a API aplica a mesma regra sob lock antes do insert. O WhatsApp passa a manter estado de conexão mais preciso e a UI deriva habilitação dos botões do estado real da sessão.

**Tech Stack:** TypeScript, React Native/Expo, React, Express, MySQL, Baileys, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-12-offline-whatsapp-hardening-design.md`

## Global Constraints

- Preservar idempotência por requestKey.
- Preservar jornadas noturnas que atravessam meia-noite.
- Preservar os lembretes de 5 minutos.
- Não gravar marcação offline antes da confirmação visual da selfie.
- Servidor permanece autoridade final contra duplicação.

---

### Task 1: Endurecer a fila offline

**Files:**

- Modify: `apps/mobile/src/remote-queue.ts`
- Test: `tests/remote-queue.test.ts`

**Interfaces:**

- Produces: validação que rejeita duplicata semântica do mesmo tipo na mesma data lógica local e mantém idempotência por requestKey.

- [ ] Escrever testes de duplicidade semântica e tipos diferentes.
- [ ] Rodar testes e confirmar falha.
- [ ] Implementar validação mínima em `addToQueue`.
- [ ] Rodar testes e confirmar aprovação.

### Task 2: Conectividade e selfie offline explícita

**Files:**

- Modify: `apps/mobile/src/RemoteClock.tsx`
- Modify: `apps/mobile/package.json` only if required by existing dependencies.

**Interfaces:**

- Consumes: fila endurecida da Task 1.
- Produces: UI que distingue online/offline e fluxo câmera -> prévia -> confirmar/refazer antes do enqueue.

- [ ] Mapear conectividade por evento web e `expo-network`/estado nativo disponível.
- [ ] Mostrar ação offline apenas quando sem conexão e autorizada por política cacheada.
- [ ] Garantir que foto sempre tenha preview e confirmação antes de enfileirar.
- [ ] Preservar sincronização automática quando a conexão volta.
- [ ] Rodar typecheck/build mobile.

### Task 3: Bloqueio servidor de marcação duplicada

**Files:**

- Modify: `apps/api/src/routes/remote-punch.routes.ts`
- Test: `tests/remote-punch.test.ts`

**Interfaces:**

- Produces: rejeição 409/422 de segundo punch do mesmo `entry_type` na mesma `scheduled_work_date`, sob o lock já existente.

- [ ] Escrever teste API para segundo CLOCK_IN e para sequência válida.
- [ ] Rodar teste e confirmar falha.
- [ ] Implementar consulta de conflito dentro do lock antes do insert.
- [ ] Rodar teste e confirmar aprovação.

### Task 4: Corrigir máquina de estados WhatsApp

**Files:**

- Modify: `apps/api/src/services/whatsapp.service.ts`
- Modify: `apps/api/src/routes/automation.routes.ts` if needed for status/validation.
- Test: `tests/whatsapp-worker.test.ts`

**Interfaces:**

- Produces: status persistente/coerente e reconexão após QR sem spinner infinito.

- [ ] Escrever testes de QR -> CONNECTED, close reconnectable, loggedOut e persistência de creds.
- [ ] Rodar testes e confirmar falha.
- [ ] Implementar transições e reconexão controlada.
- [ ] Rodar testes e confirmar aprovação.

### Task 5: Corrigir botões WhatsApp no painel

**Files:**

- Modify: `apps/web/src/components/CompanyAutomation.tsx`

**Interfaces:**

- Consumes: estados da Task 4.
- Produces: Connect/Disconnect habilitados apenas quando semanticamente válidos.

- [ ] Derivar `canConnect` e `canDisconnect` do status real.
- [ ] Ajustar rótulos/estado de carregamento sem alterar layout geral.
- [ ] Rodar build web.

### Task 6: Regressão e pacote de deploy

**Files:**

- Verify: `tests/reminders.test.ts`
- Verify: full test/build scripts.
- Create: `docs/DEPLOY_2026-09-12.md`

**Interfaces:**

- Produces: versão testada e roteiro de atualização para servidor.

- [ ] Rodar testes unitários relevantes.
- [ ] Rodar suite completa possível.
- [ ] Rodar `npm run check`/builds possíveis.
- [ ] Documentar comandos exatos de banco/build/PM2/PWA conforme scripts existentes.
- [ ] Gerar ZIP corrigido para entrega.
