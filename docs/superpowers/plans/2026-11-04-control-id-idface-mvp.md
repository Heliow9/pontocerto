# Control iD iDFace MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar hoje um fluxo testável no qual uma empresa cadastra seu iDFace, o terminal busca comandos Push, confirma resultados, envia eventos Monitor e o Ponto Certo registra batidas faciais idempotentes.

**Architecture:** O backend Express terá um adaptador puro do protocolo Control iD, tabelas multi-tenant duráveis e uma rota pública autenticada por token de terminal. A interface React terá uma página administrativa de equipamento por empresa. Este plano entrega o MVP operacional; ARP/AFD/AEJ, comprovantes PAdES, INPI e homologação comercial permanecem um plano de conformidade separado e bloqueiam a venda como REP-P.

**Tech Stack:** TypeScript, Express, Zod, MySQL 8, React/Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-04-control-id-idface-integration-design.md`

## Global Constraints

- Um terminal Control iD ativo por empresa na V1; nunca compartilhar entre tenants ou empresas.
- Somente reconhecimento facial; não implementar digital, cartão, PIN ou QR Code.
- Terminal em Modo Ponto, integração Push + Monitor.
- Não bloquear marcação válida por janela de horário ou sobrejornada.
- Credenciais armazenadas apenas como hash e nunca registradas em log.
- Preservar alterações preexistentes no worktree.
- A suíte-base possui 33 falhas preexistentes e encerra com OOM; a conclusão exige testes Control iD, builds API/Web e relato explícito dessas falhas.

## Review Focus

- Token válido usado com `deviceId` divergente deve ser rejeitado, sem alterar o pareamento.
- Evento Monitor repetido deve retornar sucesso e gerar exatamente uma marcação.
- `vendor_user_id` de outra empresa deve ir para quarentena, sem criar `time_entries`.
- Resultado Push repetido ou fora de ordem não pode regredir um mapeamento já sincronizado.
- Batida facial válida fora da janela da jornada deve ser persistida e apenas sinalizada no tratamento.

---

### Task 1: Protocolo puro e migração

**Files:**
- Create: `apps/api/src/services/control-id-core.ts`
- Create: `apps/api/tests/control-id-core.test.ts`
- Create: `apps/api/sql/033_control_id_idface.sql`

**Interfaces:**
- Produces: `hashControlIdSecret(secret, pepper)`, `readBearerToken(header)`, `normalizeControlIdSerial(value)`, `parseControlIdDao(body)`, `buildControlIdPushCommand(job)` and protocol types.

- [x] Escrever testes falhando para token Bearer, serial, parsing de lotes DAO e comandos `create_objects`, `user_set_image` e `destroy_objects`.
- [x] Executar o teste isolado e confirmar falha por módulo ausente.
- [x] Implementar o adaptador mínimo e a migração com terminais, mapeamentos, jobs, eventos e colunas `CONTROL_ID` em `time_entries`.
- [x] Reexecutar o teste e confirmar aprovação.

### Task 2: Administração e pareamento do terminal

**Files:**
- Create: `apps/api/src/routes/control-id.routes.ts`
- Create: `apps/api/src/services/control-id.service.ts`
- Create: `apps/api/tests/control-id-service.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: helpers da Task 1.
- Produces: rotas administrativas `GET /control-id/admin/companies/:companyId`, `POST /control-id/admin/terminals`, `POST /control-id/admin/terminals/:id/rotate`, `PATCH /control-id/admin/terminals/:id`; função `resolveControlIdTerminal`.

- [ ] Escrever testes falhando para criação limitada a uma empresa do tenant, segredo retornado uma vez e resolução token/deviceId.
- [ ] Confirmar a falha específica.
- [ ] Implementar serviço e rotas com `TENANT_ADMIN` para mutações e `RH` para leitura.
- [ ] Confirmar testes e build da API.

### Task 3: Fila facial e endpoints Push/Result

**Files:**
- Modify: `apps/api/src/services/control-id.service.ts`
- Modify: `apps/api/src/routes/control-id.routes.ts`
- Modify: `apps/api/src/routes/face.routes.ts`
- Modify: `apps/api/src/routes/employees.routes.ts`
- Modify: `apps/api/tests/control-id-service.test.ts`

**Interfaces:**
- Produces: `enqueueControlIdEmployeeSync`, `claimControlIdPushJob`, `completeControlIdPushJob`; rotas públicas `GET /control-id/push` e `POST /control-id/result`.

- [ ] Escrever testes falhando para ordem usuário→foto, deduplicação por versão, remoção e resultado repetido.
- [ ] Confirmar falhas.
- [ ] Implementar fila e hooks após salvar/remover foto e desativar/transferir funcionário.
- [ ] Confirmar testes e build.

### Task 4: Monitor e batida idempotente

**Files:**
- Create: `apps/api/src/services/control-id-punch.service.ts`
- Create: `apps/api/tests/control-id-punch.test.ts`
- Modify: `apps/api/src/routes/control-id.routes.ts`

**Interfaces:**
- Produces: `receiveControlIdDao`, `processControlIdEvent`; rotas `POST /control-id/monitor/dao` e `POST /control-id/monitor/device_is_alive`.

- [ ] Escrever testes falhando para evento facial autorizado, duplicidade, usuário cruzado e marcação fora de janela.
- [ ] Confirmar falhas.
- [ ] Implementar inbox idempotente, resolução histórica do mapeamento e inserção `CONTROL_ID` sob lock lógico.
- [ ] Confirmar testes e build.

### Task 5: Página Equipamentos

**Files:**
- Create: `apps/web/src/pages/ControlIdPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/Icon.tsx`
- Create: `tests/control-id-ui.source.test.mjs`

**Interfaces:**
- Consumes: API administrativa das Tasks 2–4.
- Produces: navegação `Equipamentos`, seleção de empresa, criação, token exibido uma vez, URLs de configuração, saúde e contadores de sincronização.

- [ ] Escrever teste de UI falhando para navegação e estados operacionais.
- [ ] Confirmar falha.
- [ ] Implementar a página seguindo os componentes e CSS existentes.
- [ ] Confirmar teste e build Web.

### Task 6: Verificação e runbook de teste físico

**Files:**
- Create: `docs/CONTROL_ID_IDFACE_TESTE.md`
- Modify: `docs/superpowers/plans/2026-11-04-control-id-idface-mvp.md`

**Interfaces:**
- Produces: instruções exatas para migrar, criar terminal, configurar Modo Ponto/Push/Monitor e verificar uma batida.

- [ ] Executar testes Control iD individualmente.
- [ ] Executar `npm run build --workspace apps/api` e `npm run build --workspace apps/web`.
- [ ] Executar a suíte completa com heap ampliado e registrar falhas preexistentes versus novas.
- [ ] Conferir `git diff --check` e documentar variáveis/URLs sem expor segredo real.

