# AutoPonto Facial Online Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um terminal AutoPonto online que identifica funcionários por AWS Rekognition Collection e registra automaticamente a próxima marcação, com ativação segura e parâmetros configuráveis por empresa.

**Architecture:** O backend terá um serviço de Collection facial e um módulo AutoPonto separado do ponto individual. O terminal PWA recebe um token restrito após código de ativação e usa uma tela de câmera permanente; o painel web administra settings, reindexação e terminais.

**Tech Stack:** Node/Express/TypeScript, MySQL, AWS SDK Rekognition, React/Vite, Expo/React Native Web/PWA, Expo Camera.

**Spec:** `docs/superpowers/specs/2026-09-14-autoponto-design.md`

## Global Constraints

- AutoPonto V1 é somente online.
- Ponto individual e offline existentes não podem ser alterados funcionalmente.
- Funcionário sem foto facial continua usando ponto individual sem comparação facial.
- AutoPonto só identifica funcionários com rosto indexado na Collection da própria empresa.
- Credenciais AWS ficam exclusivamente no servidor.
- Escaneamento, exibição de resultado e cooldown são configuráveis por empresa.

---

### Task 1: Persistência e domínio AutoPonto

**Files:**
- Create: `api/sql/020_autoponto.sql`
- Create: `api/src/services/autopoint-security.service.ts`
- Test: `api/tests/autopoint-core.test.ts`

**Interfaces:**
- Produces: tabelas `autopoint_settings`, `autopoint_terminals`, coluna `time_entries.autopoint_terminal_id`, origem `AUTO_POINT`, helpers de geração/hash de código e token.

- [ ] Escrever testes que validem defaults, limites e hash determinístico de código/token.
- [ ] Rodar o teste e confirmar falha por funções ausentes.
- [ ] Criar migration idempotente e helpers mínimos.
- [ ] Rodar novamente e confirmar teste verde.

### Task 2: AWS Collection por empresa e indexação de funcionário

**Files:**
- Modify: `api/src/services/face.service.ts`
- Create: `api/src/services/face-collection.service.ts`
- Modify: `api/src/routes/face.routes.ts`
- Test: `api/tests/autopoint-core.test.ts`

**Interfaces:**
- Produces: `ensureCompanyFaceCollection`, `indexEmployeeFace`, `removeEmployeeFaceIndex`, `identifyEmployeeFace`.

- [ ] Escrever teste estrutural para Collection ID, external image id e integração do cadastro/remoção facial.
- [ ] Confirmar falha.
- [ ] Implementar comandos CreateCollection/IndexFaces/DeleteFaces/SearchFacesByImage e perfil DB.
- [ ] Integrar cadastro/remoção facial sem alterar regra do ponto individual.
- [ ] Confirmar testes verdes.

### Task 3: API administrativa de settings e terminais

**Files:**
- Create: `api/src/routes/autopoint.routes.ts`
- Modify: `api/src/app.ts`
- Test: `api/tests/autopoint-core.test.ts`

**Interfaces:**
- Produces endpoints administrativos para settings, terminais, ativação e reindexação.

- [ ] Escrever testes de contrato/estrutura dos endpoints.
- [ ] Confirmar falha.
- [ ] Implementar CRUD restrito a TENANT_ADMIN/RH conforme operação.
- [ ] Implementar geração de código temporário e revogação de terminal.
- [ ] Implementar reindexação de fotos existentes.
- [ ] Confirmar testes verdes.

### Task 4: Endpoint público de ativação, sessão e marcação AutoPonto

**Files:**
- Modify: `api/src/routes/autopoint.routes.ts`
- Create: `api/src/services/autopoint-punch.service.ts`
- Test: `api/tests/autopoint-core.test.ts`

**Interfaces:**
- Produces: `/autopoint/activate`, `/autopoint/session`, `/autopoint/punch`.

- [ ] Escrever testes para terminal inválido, identificação, cooldown e escolha do próximo tipo.
- [ ] Confirmar falha.
- [ ] Implementar autenticação por token de terminal.
- [ ] Implementar SearchFacesByImage + vínculo de employee + lock + schedule + cooldown.
- [ ] Persistir `time_entries`, face check, schedule check, selfie e terminal.
- [ ] Confirmar testes verdes.

### Task 5: Painel administrativo AutoPonto

**Files:**
- Create: `web/src/pages/AutoPointPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/Icon.tsx`
- Modify: `web/src/styles.css` ou folha de estilo principal equivalente.

**Interfaces:**
- Produces: menu AutoPonto com empresa, settings, lista de terminais, código de ativação e reindexação.

- [ ] Adicionar verificação estática que procure rota/menu/campos obrigatórios.
- [ ] Confirmar falha.
- [ ] Criar página e integração à navegação.
- [ ] Adicionar feedback de código temporário, revogação e sincronização de rostos.
- [ ] Rodar `npm run build` do web.

### Task 6: Tela AutoPonto no login do PWA/app

**Files:**
- Create: `mobile/src/AutoPoint.tsx`
- Modify: `mobile/app/index.tsx`
- Modify: `mobile/src/api.ts` se necessário.

**Interfaces:**
- Produces: ativação persistente, câmera automática e estados idle/scanning/success/error/offline.

- [ ] Adicionar teste/verificação estrutural para botão no login, chave local, timers e endpoint de punch.
- [ ] Confirmar falha.
- [ ] Implementar fluxo de ativação e restauração do terminal.
- [ ] Implementar loop de captura respeitando `scanIntervalSeconds`.
- [ ] Exibir nome, matrícula, tipo e horário por `resultDisplaySeconds` e depois retomar câmera.
- [ ] Tratar offline/revogação sem afetar login individual.
- [ ] Rodar `npm run check` e build web do mobile quando disponível.

### Task 7: Verificação final e pacote Git

**Files:**
- Create: `AUTOPONTO_V1.md`

**Interfaces:**
- Produces: pacote sem segredos/artefatos temporários e instruções de deploy/migration.

- [ ] Rodar testes específicos AutoPonto.
- [ ] Rodar build/check dos projetos modificados.
- [ ] Inspecionar `.env`, chaves AWS, `node_modules`, dist e arquivos temporários.
- [ ] Criar ZIP limpo com código-fonte e documentação.
- [ ] Conferir lista interna e hash SHA-256.
