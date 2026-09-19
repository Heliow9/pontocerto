# Financeiro Multi-Provedor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Substituir a integração ativa do Banco Inter por uma camada de pagamentos com Cora, Efí Bank e Mercado Pago, preservando todas as regras financeiras existentes e registrando provedor/método em cobranças, pagamentos e relatórios.

**Architecture:** O domínio financeiro permanece provider-agnostic. `PaymentProviderRegistry` resolve o adaptador persistido na cobrança e valida capacidades. Configuração global define provider/método padrão para mensalidade/implantação; cobrança avulsa pode sobrescrever ambos.

**Tech Stack:** Node.js/Express/TypeScript, MySQL, React/Vite, APIs REST Cora/Efí/Mercado Pago.

**Spec:** `docs/superpowers/specs/2026-09-18-financeiro-multiprovider-design.md`

## Global Constraints

- Providers ativos: `CORA`, `EFI`, `MERCADO_PAGO`; Inter somente histórico read-only.
- Métodos: `HYBRID`, `PIX`, `BOLETO`; Mercado Pago não aceita `HYBRID`.
- Mensalidade e implantação usam padrão global no momento da criação.
- Avulsa permite provider/método manual com padrão pré-selecionado.
- Provider/método ficam persistidos e imutáveis depois da emissão.
- Webhooks sempre reconciliam/confirmam no provider antes da baixa definitiva quando possível.
- Segredos nunca são persistidos em banco nem enviados ao frontend.

---

### Task 1: Persistência multi-provider
**Files:** Create `api/sql/022_financial_multi_provider.sql`.
- [ ] Criar `payment_provider_settings` com seeds Cora/Efí/MP.
- [ ] Adicionar `payment_method`, links/QR, fee/net e provider aos pagamentos.
- [ ] Remover dependência operacional de `inter_cancel_days` mantendo compatibilidade histórica.
- [ ] Adicionar índices para provider/método e relatórios.

### Task 2: Contrato e registry
**Files:** Create `api/src/services/payment-provider.types.ts`, `payment-provider-core.ts`, `payment-provider-registry.ts`, `payment-provider-settings.service.ts`.
- [ ] Definir tipos/capacidades/resultados normalizados.
- [ ] Validar combinações provider/método sem fallback silencioso.
- [ ] Implementar leitura/troca transacional do padrão global e status dos providers.

### Task 3: Adaptadores externos
**Files:** Create `cora-provider.ts`, `efi-provider.ts`, `mercadopago-provider.ts`, shared HTTP helpers.
- [ ] Cora Integração Direta com mTLS, token e `/v2/invoices`.
- [ ] Efí Cobranças para Bolix/boleto e API Pix para Pix-only.
- [ ] Mercado Pago para Pix/Boleto com Access Token/idempotência.
- [ ] Normalizar emissão, consulta, cancelamento, documento e teste de conexão.

### Task 4: Financeiro, worker e webhooks
**Files:** Modify `financial.service.ts`, `financial-worker.service.ts`, `app.ts`, `saas-finance.routes.ts`; create provider webhook routes/service.
- [ ] Persistir provider/método na criação.
- [ ] Emitir/reconciliar/cancelar via registry.
- [ ] Pagamentos armazenam provider, método confirmado, fee/net.
- [ ] Worker reconcilia provider da própria cobrança.
- [ ] Webhooks separados Cora/Efí/Mercado Pago com idempotência.

### Task 5: Administração SaaS e relatórios
**Files:** Modify `SaasFinance.tsx`, `SaasPortal.tsx`; create `SaasFinanceProviders.tsx`; styles as needed.
- [ ] Tela de providers com padrão global e método global.
- [ ] Cobrança avulsa escolhe provider/método.
- [ ] Mostrar provider/método em cobranças/recebimentos/logs e filtros.
- [ ] Remover tela/configuração operacional do Inter.

### Task 6: Verificação e entrega
**Files:** Add tests and deployment docs; update package scripts.
- [ ] Testar capabilities/registry e normalizadores de cada provider.
- [ ] Executar testes financeiros existentes compatíveis.
- [ ] Executar `tsc`/build quando dependências estiverem disponíveis.
- [ ] Scan de segredos e remoção de artefatos Inter operacionais.
- [ ] Gerar ZIP limpo sem `.env`, certificados, chaves, `.git` e `node_modules`.
