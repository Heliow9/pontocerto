# Ponto Certo 2.0 Facial Recognition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reativar reconhecimento facial com AWS Rekognition no cadastro do funcionário e bloquear marcações de ponto cujo rosto não corresponda ao usuário autenticado.

**Architecture:** A API mantém uma collection Rekognition por tenant e usa `ExternalImageId` determinístico por funcionário. O painel administrativo cadastra/revoga o rosto; os dois fluxos de ponto reutilizam a selfie existente e executam a verificação antes de criar `time_entries`, gravando somente metadados e evidências da comparação.

**Tech Stack:** Node.js 22, TypeScript, Express, MySQL, React/Vite, Expo, Vitest, AWS SDK for JavaScript v3 (`@aws-sdk/client-rekognition`).

**Spec:** `docs/superpowers/specs/2026-09-14-face-recognition-2-design.md`

## Global Constraints

- Credenciais AWS somente no backend.
- Uma collection por tenant e `ExternalImageId` por funcionário.
- Threshold padrão 90% via ambiente.
- Cadastro facial administrativo; autoenrollment do funcionário bloqueado.
- `biometric_exempt` dispensa reconhecimento facial individual.
- Ponto offline é validado facialmente apenas na sincronização.
- Face Liveness fica fora do escopo.

---

### Task 1: Serviço AWS Rekognition e configuração

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/src/services/face.service.ts`
- Test: `tests/face-service.test.ts`

**Interfaces:**
- Produces: `enrollFace`, `verifyFace`, `revokeFace`, `faceProviderStatus`, `collectionId`, `externalImageId`.

- [ ] Escrever testes falhando para identificação determinística, enrollment, mismatch e revogação.
- [ ] Rodar os testes e confirmar RED.
- [ ] Adicionar o SDK Rekognition e configuração AWS/threshold.
- [ ] Implementar criação idempotente de collection, `DetectFaces`, `IndexFaces`, `SearchFacesByImage` e `DeleteFaces`.
- [ ] Rodar os testes e confirmar GREEN.

### Task 2: Política facial compartilhada e rotas administrativas

**Files:**
- Create: `apps/api/src/services/face-verification.service.ts`
- Modify: `apps/api/src/routes/face.routes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/routes/employees.routes.ts`
- Test: `tests/face-policy.test.ts`
- Test: `tests/face-routes.source.test.mjs`

**Interfaces:**
- Produces: `evaluateEmployeeFace({ tenantId, companyId, employeeId, image })`.
- HTTP: `GET /faces/employee/:id/status`, `POST /faces/employee/:id/enroll`, `DELETE /faces/employee/:id`, `GET /faces/my/status`.

- [ ] Escrever testes falhando para política exigida/dispensada e proteção administrativa.
- [ ] Confirmar RED.
- [ ] Implementar política e rotas, bloquear autoenrollment e montar `/faces` no app.
- [ ] Expor status facial no cadastro/lista de funcionário.
- [ ] Confirmar GREEN.

### Task 3: Verificação facial no ponto seguro

**Files:**
- Modify: `apps/api/src/routes/time-entries.routes.ts`
- Modify: `tests/api.test.ts`

**Interfaces:**
- Consumes: `evaluateEmployeeFace`.
- Persists: `time_entries.face_verified`, `face_similarity`, `face_provider`, `time_entry_face_checks`.

- [ ] Criar testes falhando para mismatch, ausência de enrollment e sucesso com evidência.
- [ ] Confirmar RED.
- [ ] Executar verificação antes da transação e persistir resultado aprovado.
- [ ] Registrar decisão facial em `punch_attempts`.
- [ ] Confirmar GREEN.

### Task 4: Verificação facial no ponto remoto/offline

**Files:**
- Modify: `apps/api/src/routes/remote-punch.routes.ts`
- Modify: `tests/remote-punch.test.ts`

**Interfaces:**
- Consumes: `evaluateEmployeeFace`.
- Persists: os mesmos campos/evidências do ponto seguro.

- [ ] Criar testes falhando para sincronização rejeitada/aprovada.
- [ ] Confirmar RED.
- [ ] Validar selfie antes de `time_entries` e persistir evidência aprovada.
- [ ] Confirmar GREEN.

### Task 5: Política facial da empresa

**Files:**
- Modify: `apps/api/src/routes/companies.routes.ts`
- Modify: `apps/web/src/pages/CompaniesPage.tsx`
- Modify: `apps/web/src/types.ts`
- Test: `tests/face-company.source.test.mjs`

**Interfaces:**
- HTTP company payload: `requireFaceRecognition: boolean`.

- [ ] Criar teste de fonte falhando para leitura/gravação do campo e checkbox.
- [ ] Confirmar RED.
- [ ] Remover hardcode `require_face_recognition=0` e tornar a política editável.
- [ ] Confirmar GREEN.

### Task 6: Cadastro facial no painel de funcionários

**Files:**
- Create: `apps/web/src/components/EmployeeFaceEnrollment.tsx`
- Modify: `apps/web/src/pages/EmployeesPage.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/types.ts`
- Test: `tests/face-ui.source.test.mjs`

**Interfaces:**
- Consumes endpoints `/faces/employee/:id/*`.

- [ ] Criar teste de fonte falhando para câmera, upload, atualização e remoção.
- [ ] Confirmar RED.
- [ ] Implementar captura com `getUserMedia`, fallback de arquivo, prévia e ações.
- [ ] Integrar status facial à tabela e ao modal do funcionário.
- [ ] Confirmar GREEN.

### Task 7: Documentação, versão e verificação final

**Files:**
- Create: `docs/PONTO_CERTO_2_RECONHECIMENTO_FACIAL.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Documenta setup AWS, IAM mínimo, deploy e teste operacional.

- [ ] Documentar configuração sem colocar segredos reais.
- [ ] Rodar testes faciais e regressões.
- [ ] Rodar `npm run check` e `npm test`.
- [ ] Gerar ZIP final excluindo `node_modules`, `dist`, `.git`, relatórios e segredos `.env`.
