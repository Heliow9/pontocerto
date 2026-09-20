# Ponto Certo SaaS Global Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar as lacunas críticas entre a versão 0.4.x e o escopo SaaS global sem regredir a operação de ponto.

**Architecture:** Evolução incremental sobre os módulos existentes. Segurança e regras comerciais ficam no backend; UI apenas reflete capacidades resolvidas pela API. Snapshots comerciais e documentos versionados evitam alterações retroativas.

**Tech Stack:** Node 22, Express, TypeScript, React/Vite, MySQL/MariaDB, Zod, ExcelJS, PDFKit, Docxtemplater, LibreOffice Headless.

**Spec:** `docs/superpowers/specs/2026-09-13-saas-global-scope-design.md`

## Global Constraints
- Preservar funcionalidades operacionais existentes.
- Migrations incrementais e compatíveis com MariaDB.
- Supervisor fail-closed.
- SUPER_ADMIN isolado do ambiente operacional.
- Validação de segurança no backend.
- Não persistir segredos em auditoria.

---

### Task 1: Segurança e permissões
**Files:** `apps/api/src/middlewares/require-role.ts`, `apps/api/src/services/commercial-rules.ts`, `apps/web/src/components/Access.tsx`, testes.
- [ ] Criar teste falhando para supervisor sem permissões e ações sensíveis.
- [ ] Implementar fail-closed e permissões granulares.
- [ ] Validar testes.

### Task 2: Entitlements e matriz/filiais
**Files:** migration 017, `entitlements.service.ts`, `companies.routes.ts`, `tenant-provisioning.service.ts`.
- [ ] Criar testes de contrato/estrutura.
- [ ] Adicionar `company_type`, recursos ampliados e limites explícitos.
- [ ] Garantir matriz única e contagem apenas de BRANCH.

### Task 3: Auditoria administrativa
**Files:** migration 017, `utils/audit.ts`, `team.routes.ts`.
- [ ] Testar sanitização e filtros.
- [ ] Ampliar colunas/contexto/resultado.
- [ ] Adicionar CSV/XLSX/PDF e retenção.

### Task 4: Propostas e contratos
**Files:** migration 017, `proposals.routes.ts`, novo `contracts.routes.ts`, serviços de documentos.
- [ ] Testar snapshot e estados.
- [ ] Congelar snapshot da proposta.
- [ ] Criar módulo Contratos, documentos e anexo assinado.
- [ ] Preparar conversão transacional/idempotente.

### Task 5: Dashboard e UI SaaS
**Files:** `saas-commercial.routes.ts`, `SaasPortal.tsx`, nova `ContractsPage.tsx`, `App.tsx`.
- [ ] Expandir métricas SaaS.
- [ ] Expor Contratos no portal SaaS.
- [ ] Ajustar nomenclaturas, estados e responsividade sem alterar fluxos operacionais.

### Task 6: Verificação final
- [ ] Executar testes unitários.
- [ ] Executar build API/Web.
- [ ] Corrigir regressões encontradas.
- [ ] Gerar pacote final sem dependências/cache pesados.
