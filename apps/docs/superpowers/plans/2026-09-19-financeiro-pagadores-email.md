# Financeiro — Pagadores, Cadastro Financeiro e Envio de Cobranças por E-mail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o Ponto Certo emita cobranças para Clientes SaaS ou pagadores externos, persista um snapshot imutável do pagador, use dados financeiros completos do tenant, envie/reenvie cobranças por e-mail e mantenha cobranças externas fora das regras de bloqueio do SaaS.

**Architecture:** `saas_billing_profiles` será o cadastro mestre financeiro de cada tenant. `financial_charges` passa a conter o snapshot do pagador e aceitar `tenant_id=NULL` somente para `AD_HOC` externo. A emissão usa exclusivamente o snapshot persistido; SMTP e histórico de entrega ficam em um serviço financeiro próprio reutilizando a configuração `saas_settings(setting_key='email')` já existente.

**Tech Stack:** Node.js 22, TypeScript 5.6, Express 4, Zod 3, MySQL 8/InnoDB, Nodemailer 7, React + Vite, testes `node:test` e source tests `.mjs`.

**Spec:** `docs/superpowers/specs/2026-09-19-financeiro-pagadores-email.md`

## Global Constraints

- `tenant` continua sendo cliente SaaS; pagador externo não cria tenant, empresa, usuário, assinatura ou contrato.
- `MONTHLY` e `IMPLEMENTATION` exigem tenant; apenas `AD_HOC` pode ser externo e usar `tenant_id=NULL`.
- Cobrança externa nunca participa do bloqueio financeiro nem da sincronização `PAST_DUE`/`ACTIVE`.
- O snapshot do pagador é imutável após a criação da cobrança; mudanças no perfil financeiro afetam apenas cobranças futuras.
- O provider da cobrança é sempre o provider armazenado em `financial_charges`; não aplicar fallback silencioso.
- Envio automático vem habilitado por padrão, mas pode ser desmarcado na criação.
- E-mail só é disparado após emissão bem-sucedida; falha SMTP não cancela nem reemite a cobrança.
- Reenvio manual reutiliza a mesma cobrança e nunca cria nova cobrança no provider.
- Reutilizar `saas_settings(setting_key='email')`; não introduzir segunda configuração SMTP nem segredos no banco/frontend além do mecanismo já existente.
- CPF/CNPJ, telefone e CEP são normalizados no backend e apresentados mascarados no frontend com os componentes compartilhados existentes.
- Cora, Efí e Mercado Pago devem continuar operando com o provider/método gravado na cobrança.

## Review Focus

1. **Cobrança externa vencida:** precisa continuar com `tenant_id=NULL` e nunca bloquear/suspender nenhum tenant — coberto nos testes das Tasks 3 e 5.
2. **Boleto Mercado Pago sem endereço completo:** a API deve falhar antes da chamada externa com lista de campos faltantes, mantendo a cobrança em estado controlado — coberto na Task 3.
3. **Alteração do cadastro após emissão:** cobrança antiga deve manter nome/documento/endereço snapshotados — coberto na Task 3.
4. **SMTP indisponível depois que o provider criou a cobrança:** cobrança permanece emitida e a tentativa fica `FAILED`, sem segunda emissão — coberto nas Tasks 4 e 5.
5. **Reenvio manual repetido:** cada clique gera nova linha de `financial_charge_deliveries`, mas nenhum novo `provider_charge_id` — coberto nas Tasks 4 e 6.

---

## File Structure

**Create**
- `api/sql/023_financial_payers_and_delivery.sql` — evolução de schema, backfill e tabela de entregas.
- `api/src/services/financial-payer-core.ts` — normalização, snapshot e validação de requisitos do pagador.
- `api/src/services/financial-email-core.ts` — conteúdo seguro do e-mail e regras puras de destinatário/envio.
- `api/src/services/financial-email.service.ts` — SMTP, histórico de entrega e reenvio.
- `api/tests/financial-payer-core.test.ts` — testes do modelo de pagador.
- `api/tests/financial-email-core.test.ts` — testes do conteúdo/regras de e-mail.
- `tests/finance-payer-ui.source.test.mjs` — contrato source-level da UI de tenant/pagador externo/reenvio.

**Modify**
- `api/src/services/tenant-provisioning.service.ts` — criar perfil financeiro com dados iniciais.
- `api/src/routes/saas.routes.ts` — aceitar dados financeiros ao criar tenant e expor completude na listagem.
- `api/src/services/financial.service.ts` — perfil completo, criação com snapshot, emissão, pagamentos/eventos nullable, listagens/relatórios.
- `api/src/services/financial-access.service.ts` — garantir bloqueio apenas para cobranças com tenant.
- `api/src/services/financial-worker.service.ts` — mensalidade automática + envio após emissão sem reemissão.
- `api/src/routes/saas-finance.routes.ts` — schemas/rotas de pagador externo, perfil, delivery e reenvio.
- `api/src/services/payment-provider.types.ts` — manter `ProviderPayer` como contrato único do snapshot normalizado.
- `api/src/services/commercial-email.service.ts` — extrair primitive SMTP genérica reutilizável sem alterar envio comercial existente.
- `api/src/services/commercial-email-core.ts` — somente se necessário para exportar helpers genéricos já usados pelo financeiro.
- `api/package.json` — scripts dos novos testes.
- `web/src/pages/SaasPage.tsx` — cadastro de Cliente SaaS com dados financeiros/endereço/responsável.
- `web/src/pages/SaasFinance.tsx` — perfil financeiro, pagador externo, auto envio, reenvio e histórico.
- `web/src/styles/commercial.css` — seções visuais dos novos formulários e histórico.
- `tests/finance-multiprovider.test.mjs` — regressão provider/método + pagador snapshotado.
- `tests/masked-forms.source.test.mjs` — regressão das máscaras nos novos campos.

---

### Task 1: Migration 023 e modelo persistente de pagador

**Files:**
- Create: `api/sql/023_financial_payers_and_delivery.sql`
- Modify: `api/src/services/tenant-provisioning.service.ts:34-38`
- Test: `tests/finance-payer-ui.source.test.mjs` (checagens estruturais do schema entram nesta task)

**Interfaces:**
- Produces: colunas de perfil `billing_*`, `financial_contact_*`, `auto_email_charges`; snapshot `payer_*`; `send_email_after_issue`; tabela `financial_charge_deliveries`; `tenant_id` nullable em `financial_charges`, `financial_payments`, `financial_events`.
- Consumes: schema atual das migrations `021` e `022`; dados de `companies` + `company_profiles` para backfill.

- [ ] **Step 1: Escrever teste estrutural RED para a migration**

Adicionar em `tests/finance-payer-ui.source.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('migration 023 cria perfil completo, snapshot e histórico de entrega',()=>{
  const sql=read('api/sql/023_financial_payers_and_delivery.sql');
  for(const token of [
    'billing_legal_name','billing_trade_name','billing_document','billing_email','billing_phone',
    'financial_contact_name','financial_contact_document','financial_contact_email','financial_contact_phone',
    'billing_zip_code','billing_street','billing_number','billing_complement','billing_district','billing_city','billing_state',
    'auto_email_charges','payer_source','payer_person_type','payer_name','payer_document','send_email_after_issue',
    'financial_charge_deliveries'
  ]) assert.match(sql,new RegExp(token));
  assert.match(sql,/MODIFY tenant_id BIGINT UNSIGNED NULL/);
});
```

- [ ] **Step 2: Rodar e confirmar RED**

Run:

```bash
node --test tests/finance-payer-ui.source.test.mjs
```

Expected: FAIL porque `023_financial_payers_and_delivery.sql` ainda não existe.

- [ ] **Step 3: Implementar migration segura e backfill**

Criar `api/sql/023_financial_payers_and_delivery.sql` com esta sequência:

```sql
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

ALTER TABLE saas_billing_profiles
  ADD COLUMN billing_legal_name VARCHAR(190) NULL,
  ADD COLUMN billing_trade_name VARCHAR(190) NULL,
  ADD COLUMN billing_document VARCHAR(20) NULL,
  ADD COLUMN billing_email VARCHAR(190) NULL,
  ADD COLUMN billing_phone VARCHAR(30) NULL,
  ADD COLUMN financial_contact_name VARCHAR(190) NULL,
  ADD COLUMN financial_contact_document VARCHAR(20) NULL,
  ADD COLUMN financial_contact_email VARCHAR(190) NULL,
  ADD COLUMN financial_contact_phone VARCHAR(30) NULL,
  ADD COLUMN billing_zip_code VARCHAR(12) NULL,
  ADD COLUMN billing_street VARCHAR(190) NULL,
  ADD COLUMN billing_number VARCHAR(30) NULL,
  ADD COLUMN billing_complement VARCHAR(120) NULL,
  ADD COLUMN billing_district VARCHAR(120) NULL,
  ADD COLUMN billing_city VARCHAR(120) NULL,
  ADD COLUMN billing_state CHAR(2) NULL,
  ADD COLUMN auto_email_charges TINYINT(1) NOT NULL DEFAULT 1;

UPDATE saas_billing_profiles bp
JOIN companies c ON c.tenant_id=bp.tenant_id AND c.company_type='MATRIX'
LEFT JOIN company_profiles cp ON cp.company_id=c.id AND cp.tenant_id=c.tenant_id
SET bp.billing_legal_name=COALESCE(bp.billing_legal_name,c.legal_name),
    bp.billing_trade_name=COALESCE(bp.billing_trade_name,c.trade_name),
    bp.billing_document=COALESCE(bp.billing_document,REGEXP_REPLACE(COALESCE(c.cnpj,''),'[^0-9]','')),
    bp.billing_email=COALESCE(bp.billing_email,cp.email),
    bp.billing_phone=COALESCE(bp.billing_phone,REGEXP_REPLACE(COALESCE(cp.phone,''),'[^0-9]','')),
    bp.billing_zip_code=COALESCE(bp.billing_zip_code,REGEXP_REPLACE(COALESCE(cp.zip_code,''),'[^0-9]','')),
    bp.billing_street=COALESCE(bp.billing_street,cp.street,cp.address),
    bp.billing_number=COALESCE(bp.billing_number,cp.address_number),
    bp.billing_complement=COALESCE(bp.billing_complement,cp.complement),
    bp.billing_district=COALESCE(bp.billing_district,cp.district),
    bp.billing_city=COALESCE(bp.billing_city,cp.city),
    bp.billing_state=COALESCE(bp.billing_state,UPPER(cp.state));
```

Depois remover/recriar as FKs de `financial_charges`, `financial_payments` e `financial_events` para permitir `tenant_id NULL`; adicionar os campos `payer_*` inicialmente `NULL`; fazer backfill dos registros existentes a partir do perfil/matriz; preencher `payer_source='TENANT'`, inferir `payer_person_type` pelo tamanho do documento e somente então alterar `payer_source`, `payer_person_type`, `payer_name`, `payer_document` para `NOT NULL` onde os dados forem completos. Para legados sem documento/nome, preservar consultabilidade usando `payer_name=COALESCE(...,t.name,'Cliente legado')` e `payer_document=COALESCE(...,'')`; a aplicação deverá bloquear reemissão se o snapshot legado estiver incompleto.

Criar:

```sql
CREATE TABLE IF NOT EXISTS financial_charge_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  charge_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NULL,
  recipient_email VARCHAR(190) NOT NULL,
  cc_email VARCHAR(190) NULL,
  subject VARCHAR(255) NOT NULL,
  delivery_type ENUM('AUTO','MANUAL') NOT NULL,
  status ENUM('PENDING','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
  smtp_message_id VARCHAR(255) NULL,
  error_message VARCHAR(500) NULL,
  sent_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  sent_at DATETIME NULL,
  PRIMARY KEY(id),
  KEY idx_financial_delivery_charge (charge_id,created_at),
  KEY idx_financial_delivery_tenant (tenant_id,created_at),
  CONSTRAINT fk_financial_delivery_charge FOREIGN KEY(charge_id) REFERENCES financial_charges(id),
  CONSTRAINT fk_financial_delivery_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_financial_delivery_user FOREIGN KEY(sent_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Adicionar `send_email_after_issue TINYINT(1) NOT NULL DEFAULT 1` e índice por `payer_document`/`payer_source` em `financial_charges`.

- [ ] **Step 4: Inicializar perfil novo já com defaults de cobrança**

Em `tenant-provisioning.service.ts`, alterar o `INSERT INTO saas_billing_profiles` para também preencher `billing_legal_name`, `billing_trade_name`, `billing_document` e `auto_email_charges=1`, usando `d.companyName` e `d.cnpj` normalizado.

- [ ] **Step 5: Rodar teste GREEN e checar migration syntax/source**

Run:

```bash
node --test tests/finance-payer-ui.source.test.mjs
rg -n "financial_charge_deliveries|payer_source|auto_email_charges" api/sql/023_financial_payers_and_delivery.sql
```

Expected: PASS; todos os tokens aparecem.

- [ ] **Step 6: Commit**

```bash
git add api/sql/023_financial_payers_and_delivery.sql api/src/services/tenant-provisioning.service.ts tests/finance-payer-ui.source.test.mjs
git commit -m "feat: add financial payer and delivery schema"
```

---

### Task 2: Core de pagador e perfil financeiro completo do tenant

**Files:**
- Create: `api/src/services/financial-payer-core.ts`
- Create: `api/tests/financial-payer-core.test.ts`
- Modify: `api/src/services/financial.service.ts:27-43`
- Modify: `api/src/routes/saas-finance.routes.ts:37-38`
- Modify: `api/package.json`

**Interfaces:**
- Produces:
  - `normalizeFinancialPayer(input: FinancialPayerInput): FinancialPayerSnapshot`
  - `payerFromBillingProfile(profile): FinancialPayerSnapshot`
  - `missingPayerFieldsForMethod(payer, provider, method): string[]`
  - `billingProfileCompleteness(profile): {complete:boolean; missing:string[]}`
- Consumes: campos da migration 023 e `PaymentProviderCode`/`PaymentMethodCode`.

- [ ] **Step 1: Escrever testes RED do core**

Criar `api/tests/financial-payer-core.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFinancialPayer, missingPayerFieldsForMethod, billingProfileCompleteness } from '../src/services/financial-payer-core.js';

test('normaliza documento telefone cep e UF sem destruir nome/email',()=>{
  const payer=normalizeFinancialPayer({source:'EXTERNAL',personType:'PJ',name:'Empresa X',document:'12.345.678/0001-90',email:'FIN@EXEMPLO.COM ',phone:'(81) 99999-0000',zipCode:'50.000-000',street:'Rua A',number:'10',district:'Centro',city:'Recife',state:'pe'});
  assert.equal(payer.document,'12345678000190');
  assert.equal(payer.phone,'81999990000');
  assert.equal(payer.zipCode,'50000000');
  assert.equal(payer.email,'fin@exemplo.com');
  assert.equal(payer.state,'PE');
});

test('boleto Mercado Pago exige endereço completo e email',()=>{
  const payer=normalizeFinancialPayer({source:'EXTERNAL',personType:'PF',name:'João',document:'123.456.789-00',email:'joao@example.com'});
  assert.deepEqual(missingPayerFieldsForMethod(payer,'MERCADO_PAGO','BOLETO'),['zipCode','street','number','district','city','state']);
});

test('Pix não exige endereço completo',()=>{
  const payer=normalizeFinancialPayer({source:'EXTERNAL',personType:'PF',name:'João',document:'123.456.789-00',email:'joao@example.com'});
  assert.deepEqual(missingPayerFieldsForMethod(payer,'MERCADO_PAGO','PIX'),[]);
});

test('perfil financeiro sinaliza responsável e endereço incompletos',()=>{
  const result=billingProfileCompleteness({billingLegalName:'Empresa',billingDocument:'12345678000190',financialContactEmail:'financeiro@example.com'} as any);
  assert.equal(result.complete,false);
  assert.ok(result.missing.includes('billingZipCode'));
});
```

- [ ] **Step 2: Rodar e confirmar RED**

```bash
cd api
npm run test:financial-payer-core
```

Expected: FAIL porque arquivo/funções ainda não existem.

- [ ] **Step 3: Implementar core mínimo**

Criar tipos explícitos:

```ts
export type FinancialPayerSource='TENANT'|'EXTERNAL';
export type FinancialPersonType='PF'|'PJ';
export type FinancialPayerInput={source:FinancialPayerSource;personType:FinancialPersonType;name:string;document:string;email?:string|null;phone?:string|null;zipCode?:string|null;street?:string|null;number?:string|null;complement?:string|null;district?:string|null;city?:string|null;state?:string|null};
export type FinancialPayerSnapshot=Required<Pick<FinancialPayerInput,'source'|'personType'|'name'|'document'>> & Omit<FinancialPayerInput,'source'|'personType'|'name'|'document'>;
```

`normalizeFinancialPayer()` deve trimar texto, aplicar `digits()` local para documento/telefone/CEP, lowercase no e-mail e uppercase em UF; documento deve ter 11 ou 14 dígitos e corresponder ao `personType`.

`missingPayerFieldsForMethod()` deve exigir `name` + `document` sempre; e, para `MERCADO_PAGO + BOLETO`, exigir `email`, `zipCode`, `street`, `number`, `district`, `city`, `state`. Para os demais providers, retornar apenas requisitos universais nesta etapa; validações extras específicas continuam nos adapters.

- [ ] **Step 4: Expandir `getBillingProfile`/`updateBillingProfile`**

`getBillingProfile()` deve selecionar todos os campos novos e retornar camelCase:

```ts
{
 tenantId,tenantName,tenantStatus,dueDay,graceDays,autoBlockEnabled,autoMonthlyEnabled,
 billingLegalName,billingTradeName,billingDocument,billingEmail,billingPhone,
 financialContactName,financialContactDocument,financialContactEmail,financialContactPhone,
 billingZipCode,billingStreet,billingNumber,billingComplement,billingDistrict,billingCity,billingState,
 autoEmailCharges,completeness
}
```

`updateBillingProfile()` passa a aceitar esses campos, normaliza via core e grava todos em uma única atualização parametrizada. `billingDocument` aceita 11/14 dígitos; `financialContactDocument` aceita vazio ou CPF de 11 dígitos; UF aceita vazio ou 2 letras.

- [ ] **Step 5: Expandir schema PUT do perfil**

Em `saas-finance.routes.ts`, o `PUT /tenants/:id/profile` passa a usar Zod para os campos de faturamento, sem exigir endereço para salvar tenant legado. O backend salva vazio como `NULL` e retorna `completeness`.

- [ ] **Step 6: Adicionar script de teste e rodar GREEN**

Em `api/package.json`:

```json
"test:financial-payer-core": "rm -rf .test-dist/financial-payer-core && tsc tests/node-builtins-shim.d.ts tests/financial-payer-core.test.ts src/services/financial-payer-core.ts src/services/payment-provider.types.ts --module NodeNext --moduleResolution NodeNext --target ES2021 --esModuleInterop --skipLibCheck --outDir .test-dist/financial-payer-core && node --test .test-dist/financial-payer-core/tests/financial-payer-core.test.js"
```

Run:

```bash
npm run test:financial-payer-core
npm run test:financial-rules
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/services/financial-payer-core.ts api/tests/financial-payer-core.test.ts api/src/services/financial.service.ts api/src/routes/saas-finance.routes.ts api/package.json
git commit -m "feat: add tenant billing profile and payer core"
```

---

### Task 3: Criação de cobrança com snapshot e pagador externo

**Files:**
- Modify: `api/src/services/financial.service.ts:57-145`
- Modify: `api/src/services/financial-access.service.ts:7-43`
- Modify: `api/src/routes/saas-finance.routes.ts:19-35`
- Modify: `api/src/services/payment-provider.types.ts:18-43`
- Modify: `api/tests/financial-service-core.test.ts`
- Modify: `api/tests/financial-access-core.test.ts`
- Modify: `tests/finance-multiprovider.test.mjs`

**Interfaces:**
- Consumes: `FinancialPayerSnapshot`, `payerFromBillingProfile()`, `missingPayerFieldsForMethod()` da Task 2.
- Produces:
  - `createAdHocCharge({tenantId?:number|null,payer?:FinancialPayerInput,...})`
  - `insertCharge(...payerSnapshot,sendEmailAfterIssue)`
  - `getCharge()` com tenant opcional e snapshot.

- [ ] **Step 1: Adicionar testes RED das invariantes**

Adicionar testes puros/source que fixem:

```ts
// financial-access-core.test.ts
// cobrança sem tenant nunca é entrada de decideFinancialAccess porque a query do serviço exige c.tenant_id=?
```

E em `tests/finance-multiprovider.test.mjs`:

```js
test('cobrança avulsa aceita tenant ou pagador externo e usa snapshot', async()=>{
  const service=await readFile('api/src/services/financial.service.ts','utf8');
  const routes=await readFile('api/src/routes/saas-finance.routes.ts','utf8');
  assert.match(routes,/payerSource/);
  assert.match(routes,/EXTERNAL/);
  assert.match(service,/payer_source/);
  assert.match(service,/payer_document/);
  assert.doesNotMatch(service,/async function payerForTenant/);
});
```

- [ ] **Step 2: Rodar RED**

```bash
node --test tests/finance-multiprovider.test.mjs
```

Expected: FAIL por ausência de `payerSource`/snapshot.

- [ ] **Step 3: Mudar `insertCharge` para receber snapshot imutável**

Nova assinatura:

```ts
async function insertCharge(db:any,input:{
  tenantId:number|null;
  type:ChargeType;
  competence?:string|null;
  description:string;
  amount:number;
  dueDate:string;
  blockAt:string;
  actorUserId?:number|null;
  provider:PaymentProviderCode;
  paymentMethod:PaymentMethodCode;
  payer:FinancialPayerSnapshot;
  sendEmailAfterIssue:boolean;
})
```

O `INSERT` deve gravar todas as colunas `payer_*` e `send_email_after_issue`. Para `tenantId=null`, permitir somente `type='AD_HOC'` e `payer.source='EXTERNAL'`; caso contrário lançar `EXTERNAL_PAYER_ONLY_AD_HOC`.

- [ ] **Step 4: Gerar snapshot tenant na criação, não na emissão**

`MONTHLY`/`IMPLEMENTATION` usam `payerFromBillingProfile(await ensureBillingProfile(tenantId))`. `AD_HOC`:

```ts
if (input.payerSource==='TENANT') {
  if (!input.tenantId) throw financeError('Selecione o Cliente SaaS.');
  payer=payerFromBillingProfile(await ensureBillingProfile(input.tenantId));
} else {
  if (input.tenantId) throw financeError('Pagador externo não deve receber tenantId.');
  payer=normalizeFinancialPayer(input.payer!);
}
```

`sendEmailAfterIssue` vem do perfil (`autoEmailCharges`) para tenant e do request (default `true`) para externo.

- [ ] **Step 5: Emissão usa snapshot persistido**

Remover `payerForTenant()`. Em `issueCharge()` construir `ProviderIssueInput.payer` exclusivamente de `charge.payer_*`:

```ts
const payer={
  name:charge.payer_name,
  document:charge.payer_document,
  email:charge.payer_email,
  phone:charge.payer_phone,
  address:charge.payer_street,
  number:charge.payer_number,
  complement:charge.payer_complement,
  district:charge.payer_district,
  city:charge.payer_city,
  state:charge.payer_state,
  zipCode:charge.payer_zip_code,
};
```

Antes de chamar provider, usar `missingPayerFieldsForMethod()` e lançar `PAYER_DATA_INCOMPLETE` com `{missing:[...]}` quando necessário.

- [ ] **Step 6: Tornar reconciliação/pagamentos/eventos compatíveis com tenant null**

`recordFinancialEvent()` passa a aceitar `tenantId:number|null`. `applyProviderDetails()` insere `financial_payments.tenant_id=charge.tenant_id ?? null`. Conversões `Number(charge.tenant_id)` devem ser substituídas por `charge.tenant_id==null?null:Number(charge.tenant_id)`.

`getCharge()` muda `JOIN tenants` para `LEFT JOIN tenants` e retorna `tenant_id:null`, `tenant_name:null` para externo.

- [ ] **Step 7: Isolar bloqueio explicitamente**

Em `financial-access.service.ts`, manter a consulta por tenant e adicionar `AND c.tenant_id IS NOT NULL`. Em qualquer listagem usada pelo worker para bloqueio, incluir a mesma condição. Nenhuma função de acesso deve ser chamada para cobrança externa.

- [ ] **Step 8: Expandir rota POST `/charges/ad-hoc`**

Schema esperado:

```ts
{
  payerSource:'TENANT'|'EXTERNAL',
  tenantId?:number|null,
  payer?:{
    personType:'PF'|'PJ',name:string,document:string,email?:string,phone?:string,
    zipCode?:string,street?:string,number?:string,complement?:string,district?:string,city?:string,state?:string
  },
  amount:number,dueDate:string,description:string,provider, paymentMethod, issue:boolean,
  sendEmailAfterIssue:boolean
}
```

Refinements: `TENANT` exige `tenantId`; `EXTERNAL` exige `payer` e proíbe `tenantId`.

- [ ] **Step 9: Rodar GREEN + regressão multiprovider**

```bash
cd api
npm run test:financial-service-core
npm run test:financial-access-core
cd ..
node --test tests/finance-multiprovider.test.mjs
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add api/src/services/financial.service.ts api/src/services/financial-access.service.ts api/src/routes/saas-finance.routes.ts api/src/services/payment-provider.types.ts api/tests/financial-service-core.test.ts api/tests/financial-access-core.test.ts tests/finance-multiprovider.test.mjs
git commit -m "feat: support external payers with immutable charge snapshots"
```

---

### Task 4: Serviço de e-mail financeiro e histórico de entregas

**Files:**
- Create: `api/src/services/financial-email-core.ts`
- Create: `api/src/services/financial-email.service.ts`
- Create: `api/tests/financial-email-core.test.ts`
- Modify: `api/src/services/commercial-email.service.ts:15-30`
- Modify: `api/src/services/commercial-email-core.ts:4-25`
- Modify: `api/src/services/financial.service.ts`
- Modify: `api/package.json`

**Interfaces:**
- Produces:
  - `buildFinancialChargeEmailContent(charge): {subject,text,html}`
  - `resolveChargeRecipient(charge, override?): string`
  - `sendFinancialChargeEmail({chargeId,deliveryType,actorUserId,to?,cc?}): Promise<DeliveryResult>`
  - `listChargeDeliveries(chargeId)`
- Consumes: SMTP persistido já validado e charge snapshot/provider artifacts.

- [ ] **Step 1: Escrever testes RED do conteúdo e segurança**

Criar `api/tests/financial-email-core.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFinancialChargeEmailContent,resolveChargeRecipient} from '../src/services/financial-email-core.js';

const charge={payer_name:'Empresa <X>',payer_email:'financeiro@example.com',description:'Treinamento',amount:5,due_date:'2026-09-30',provider:'MERCADO_PAGO',requested_payment_method:'BOLETO',provider_payment_url:'https://pay.example/x',digitable_line:'123456',pix_copy_paste:null,pix_qr_code:null};

test('email financeiro inclui valor vencimento provider e artefatos sem HTML injetado',()=>{
  const out=buildFinancialChargeEmailContent(charge as any);
  assert.match(out.subject,/30\/09\/2026/);
  assert.match(out.text,/R\$\s*5,00/);
  assert.match(out.text,/Mercado Pago/);
  assert.match(out.text,/123456/);
  assert.doesNotMatch(out.html,/<X>/);
  assert.match(out.html,/Empresa &lt;X&gt;/);
});

test('destinatário padrão vem do snapshot e override manual prevalece',()=>{
  assert.equal(resolveChargeRecipient(charge as any),'financeiro@example.com');
  assert.equal(resolveChargeRecipient(charge as any,'cobranca@example.com'),'cobranca@example.com');
});
```

- [ ] **Step 2: Rodar RED**

```bash
cd api
npm run test:financial-email-core
```

Expected: FAIL porque core não existe.

- [ ] **Step 3: Extrair primitive SMTP genérica sem regressão comercial**

Em `commercial-email.service.ts`, exportar função genérica:

```ts
export async function sendSmtpMessage(input:{
  to:string; cc?:string|null; subject:string; text:string; html:string;
  attachments?:Array<{filename:string;content:Buffer|string;contentType?:string}>;
  headers?:Record<string,string>;
})
```

Ela deve usar exatamente `loadEmailSettings()`, `configuredSmtp()`, `smtpConnectionView()`, `nodemailer()` e `smtpTransportOptions()` existentes. `sendCommercialEmail()` passa a delegar a ela, preservando tracking/attachment/headers atuais. Assim o Financeiro não duplica segredo/configuração SMTP.

- [ ] **Step 4: Implementar `financial-email-core.ts`**

Formatar provider labels (`CORA`, `EFI`, `MERCADO_PAGO`), método, BRL e data pt-BR. HTML deve escapar todos os campos do pagador/descrição e exibir somente artefatos presentes: `provider_payment_url`, `digitable_line`, `pix_copy_paste`; QR base64 só como `<img src="data:image/png;base64,...">` se o valor corresponder a base64 puro conhecido do provider, nunca URL arbitrária não validada.

- [ ] **Step 5: Implementar `financial-email.service.ts`**

Algoritmo de `sendFinancialChargeEmail()`:

1. carregar `getCharge(chargeId)`;
2. rejeitar `DRAFT`/`ISSUING`/`FAILED` sem artefato de pagamento com `CHARGE_NOT_ISSUED`;
3. resolver `to` (override ou `payer_email`) e validar e-mail;
4. `INSERT financial_charge_deliveries(...,'PENDING',...)` antes do SMTP;
5. chamar `sendSmtpMessage()`;
6. sucesso: update `SENT`, `smtp_message_id`, `sent_at=NOW()` e `recordFinancialEvent(...,'CHARGE_EMAIL_SENT')`;
7. erro: update `FAILED`, `error_message=sanitizeSmtpError(error)` e `recordFinancialEvent(...,'CHARGE_EMAIL_FAILED')`, depois relançar erro de envio sem alterar status financeiro da cobrança.

`tenantId` passado ao evento pode ser `null`.

- [ ] **Step 6: Integrar envio automático após emissão bem-sucedida**

Em `issueCharge()`, após `applyProviderDetails()` persistir status/artifacts com sucesso, se `send_email_after_issue=1` e a cobrança estiver emitida, disparar `sendFinancialChargeEmail({chargeId,deliveryType:'AUTO',actorUserId})`. Capturar erro de e-mail e retornar a cobrança normalmente acrescida de `emailDelivery:{status:'FAILED',message}`; não chamar provider novamente.

Para evitar circular import, se necessário mover o gatilho para uma função orquestradora `issueChargeAndMaybeEmail()` exportada de `financial-email.service.ts` e usada pelas rotas/worker.

- [ ] **Step 7: Rodar GREEN e regressão comercial**

```bash
npm run test:financial-email-core
npm run test:commercial-email
```

Expected: PASS; e-mail comercial continua inalterado.

- [ ] **Step 8: Commit**

```bash
git add api/src/services/financial-email-core.ts api/src/services/financial-email.service.ts api/tests/financial-email-core.test.ts api/src/services/commercial-email.service.ts api/src/services/commercial-email-core.ts api/src/services/financial.service.ts api/package.json
git commit -m "feat: send financial charge emails with delivery history"
```

---

### Task 5: Worker mensal, idempotência e bloqueio sem pagadores externos

**Files:**
- Modify: `api/src/services/financial-worker.service.ts:12-40`
- Modify: `api/src/services/financial-worker-core.ts`
- Modify: `api/tests/financial-worker-core.test.ts`
- Modify: `api/src/services/financial-access.service.ts`

**Interfaces:**
- Consumes: `issueChargeAndMaybeEmail()` ou comportamento equivalente da Task 4.
- Produces: worker mensal que cria/usa uma única charge por competência e registra falha de e-mail sem nova emissão.

- [ ] **Step 1: Escrever teste RED de decisão de entrega automática**

Em `financial-worker-core.ts`, introduzir função pura:

```ts
export function shouldAttemptAutomaticDelivery(input:{alreadyExists:boolean;autoEmailCharges:boolean;sendEmailAfterIssue:boolean;status:string;lastDeliveryStatus?:string|null})
```

Teste:

```ts
test('falha de email não autoriza reemitir cobrança mensal existente',()=>{
  assert.equal(shouldAttemptAutomaticDelivery({alreadyExists:true,autoEmailCharges:true,sendEmailAfterIssue:true,status:'OPEN',lastDeliveryStatus:'FAILED'}),false);
});
```

O worker não deve usar a falha de e-mail como motivo para chamar `issueCharge` novamente.

- [ ] **Step 2: Rodar RED**

```bash
npm run test:financial-worker-core
```

Expected: FAIL por função ausente.

- [ ] **Step 3: Implementar worker**

A consulta de tenants deve continuar vindo exclusivamente de `saas_billing_profiles JOIN tenants JOIN subscriptions`, portanto jamais incluir externo. `createMonthlyCharge(...,{issue:true})` deve criar snapshot e enviar uma vez na primeira criação. Se `alreadyExists=true`, não reemitir automaticamente.

Adicionar contadores `emailSent`/`emailErrors` somente se o resultado do fluxo expuser a entrega; logar falha SMTP separadamente de `monthlyErrors` para não sugerir falha na criação financeira.

- [ ] **Step 4: Fortalecer isolamento do acesso**

As queries de bloqueio/listagem overdue usadas para acesso devem sempre conter `tenant_id IS NOT NULL`; manter `financial_access_exceptions` intacta e somente tenant-based.

- [ ] **Step 5: Rodar GREEN**

```bash
npm run test:financial-worker-core
npm run test:financial-access-core
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/services/financial-worker.service.ts api/src/services/financial-worker-core.ts api/tests/financial-worker-core.test.ts api/src/services/financial-access.service.ts
git commit -m "fix: isolate external charges from saas billing worker"
```

---

### Task 6: Rotas de reenvio, histórico, listagens e CSV

**Files:**
- Modify: `api/src/routes/saas-finance.routes.ts:25-55`
- Modify: `api/src/services/financial.service.ts` (`listCharges`, `listReceipts`, `listFinancialEvents`)
- Modify: `api/src/services/financial-email.service.ts`
- Modify: `tests/finance-multiprovider.test.mjs`

**Interfaces:**
- Produces:
  - `GET /api/saas/finance/charges/:id/deliveries`
  - `POST /api/saas/finance/charges/:id/email`
  - listagem/CSV com `payer_source`, `payer_name`, `payer_document`, `payer_email`, tenant opcional e último status de entrega.

- [ ] **Step 1: Escrever RED source-level das rotas**

Adicionar:

```js
test('financeiro expõe histórico e reenvio de cobrança por email',async()=>{
  const routes=await readFile('api/src/routes/saas-finance.routes.ts','utf8');
  assert.match(routes,/charges\/:id\/deliveries/);
  assert.match(routes,/charges\/:id\/email/);
  assert.match(routes,/payer_name/);
  assert.match(routes,/Último envio|Ultimo envio|delivery/i);
});
```

- [ ] **Step 2: Rodar RED**

```bash
node --test tests/finance-multiprovider.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Implementar endpoints**

`POST /charges/:id/email` body:

```ts
z.object({to:z.string().email().optional(),cc:z.string().email().optional().nullable()})
```

Chamar `sendFinancialChargeEmail({chargeId,deliveryType:'MANUAL',actorUserId:req.auth!.userId,to:d.to,cc:d.cc})`; gravar `writeAudit(req,'SEND_EMAIL','financial_charge',chargeId,...)`.

`GET /charges/:id/deliveries` retorna as tentativas ordenadas `created_at DESC`.

- [ ] **Step 4: Ajustar listagens para tenant opcional**

Trocar joins obrigatórios em `listCharges/listReceipts/listFinancialEvents` por `LEFT JOIN tenants`; expor `payer_*` da charge. Filtro `tenantId` continua funcionando somente quando fornecido. Para externo, `tenant_name` é `NULL` e UI usa `payer_name`.

- [ ] **Step 5: Expandir CSV**

Cabeçalho de cobranças:

```text
ID;Origem do pagador;Pagador;Documento;E-mail;Cliente SaaS;Tipo;Descrição;Provedor;Método;Valor;Vencimento;Status;Último envio;ID no provedor
```

Recebimentos devem usar `COALESCE(c.payer_name,t.name)` e aceitar `tenant_id NULL`.

- [ ] **Step 6: Rodar GREEN**

```bash
node --test tests/finance-multiprovider.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/routes/saas-finance.routes.ts api/src/services/financial.service.ts api/src/services/financial-email.service.ts tests/finance-multiprovider.test.mjs
git commit -m "feat: add charge email resend history and payer reports"
```

---

### Task 7: Cadastro de Cliente SaaS com responsável e endereço financeiro

**Files:**
- Modify: `web/src/pages/SaasPage.tsx:23-67,181-300`
- Modify: `api/src/routes/saas.routes.ts:54-84`
- Modify: `api/src/services/tenant-provisioning.service.ts`
- Modify: `web/src/styles/commercial.css`
- Modify: `tests/masked-forms.source.test.mjs`
- Modify: `tests/finance-payer-ui.source.test.mjs`

**Interfaces:**
- Consumes: `MaskedInput` existente; API de criação tenant e perfil financeiro das Tasks 1-2.
- Produces: novo tenant já nasce com dados de faturamento e preferência de envio quando fornecidos.

- [ ] **Step 1: Escrever RED da UI de cadastro**

Adicionar source assertions:

```js
test('cadastro SaaS possui faturamento responsável financeiro endereço e auto envio',()=>{
  const page=read('web/src/pages/SaasPage.tsx');
  for(const text of ['Dados de faturamento','Responsável financeiro','Endereço de faturamento','Enviar cobranças automaticamente']) assert.match(page,new RegExp(text));
  assert.match(page,/mask="cnpj"/);
  assert.match(page,/mask="cpf"/);
  assert.match(page,/mask="phone"/);
  assert.match(page,/mask="cep"/);
});
```

- [ ] **Step 2: Rodar RED**

```bash
node --test tests/finance-payer-ui.source.test.mjs tests/masked-forms.source.test.mjs
```

Expected: FAIL nos novos textos/campos.

- [ ] **Step 3: Expandir criação do tenant no backend**

`tenantSchema` passa a aceitar os campos financeiros opcionais; backend normaliza documento/telefone/CEP antes de `createTenantInTransaction`. O `INSERT saas_billing_profiles` grava os campos recebidos e `auto_email_charges` (default `true`). Não tornar endereço obrigatório para preservar conversões/legados.

- [ ] **Step 4: Reorganizar modal de `SaasPage`**

Seções visuais:

1. `Identificação`
2. `Plano e acesso inicial`
3. `Dados de faturamento`
4. `Responsável financeiro`
5. `Endereço de faturamento`
6. `Preferências de cobrança`

Usar `MaskedInput` para CNPJ, CPF, telefone e CEP. Checkbox `Enviar cobranças automaticamente por e-mail` inicia `true`.

- [ ] **Step 5: Mostrar completude na lista**

`GET /saas/tenants` deve retornar `financial_profile_complete` e `financial_contact_email`. Na coluna Financeiro, quando incompleto, exibir badge/link `Cadastro financeiro incompleto` apontando para `#saas/finance-charges?tenant=<id>`.

- [ ] **Step 6: Rodar GREEN**

```bash
node --test tests/finance-payer-ui.source.test.mjs tests/masked-forms.source.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/SaasPage.tsx api/src/routes/saas.routes.ts api/src/services/tenant-provisioning.service.ts web/src/styles/commercial.css tests/masked-forms.source.test.mjs tests/finance-payer-ui.source.test.mjs
git commit -m "feat: add complete saas billing contact profile"
```

---

### Task 8: UI da cobrança avulsa, validação prévia, envio e reenvio

**Files:**
- Modify: `web/src/pages/SaasFinance.tsx:1-80+`
- Modify: `web/src/styles/commercial.css`
- Modify: `tests/finance-payer-ui.source.test.mjs`
- Modify: `tests/masked-forms.source.test.mjs`

**Interfaces:**
- Consumes: POST `charges/ad-hoc`, GET/PUT perfil, GET deliveries e POST email das Tasks 2, 3 e 6.
- Produces: fluxo visual `Cliente SaaS | Pagador avulso`, checkbox de envio default ON, resumo dos dados do tenant, histórico e reenvio.

- [ ] **Step 1: Escrever RED do fluxo UI**

Adicionar:

```js
test('modal avulso permite Cliente SaaS ou Pagador avulso e envio automático',()=>{
  const page=read('web/src/pages/SaasFinance.tsx');
  for(const text of ['Cliente SaaS','Pagador avulso','Enviar cobrança por e-mail após emissão','Reenviar por e-mail','Histórico de envios']) assert.match(page,new RegExp(text));
  assert.match(page,/payerSource/);
  assert.match(page,/sendEmailAfterIssue/);
  assert.match(page,/mask="cpf"|mask="cnpj"/);
  assert.match(page,/mask="cep"/);
});
```

- [ ] **Step 2: Rodar RED**

```bash
node --test tests/finance-payer-ui.source.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Alterar `ChargeModal`**

Estado mínimo:

```ts
{
 type:'MONTHLY'|'IMPLEMENTATION'|'AD_HOC',
 payerSource:'TENANT'|'EXTERNAL',
 tenantId:'',
 payer:{personType:'PJ',name:'',document:'',email:'',phone:'',zipCode:'',street:'',number:'',complement:'',district:'',city:'',state:''},
 sendEmailAfterIssue:true,
 ...campos atuais
}
```

Para `MONTHLY`/`IMPLEMENTATION`, esconder seletor de origem e exigir tenant. Para `AD_HOC`, exibir segmented/radios `Cliente SaaS` e `Pagador avulso`.

- [ ] **Step 4: Cliente SaaS carrega perfil e mostra prévia**

Ao selecionar tenant em avulsa, chamar `GET /saas/finance/tenants/:id/profile`, mostrar nome/documento/e-mail/responsável/endereço e `Cadastro financeiro incompleto` com lista de pendências. `sendEmailAfterIssue` assume `profile.autoEmailCharges`.

Se `provider=MERCADO_PAGO` e `paymentMethod=BOLETO`, desabilitar `Gerar cobrança` quando `completeness` indicar os campos de endereço/e-mail necessários; mensagem deve listar os campos e oferecer botão/link `Editar cadastro financeiro` abrindo `BillingProfile`.

- [ ] **Step 5: Pagador externo usa formulário inline e máscaras**

PF usa `MaskedInput mask="cpf"`; PJ usa `mask="cnpj"`; telefone `mask="phone"`; CEP `mask="cep"`. `sendEmailAfterIssue=true` por default; se marcado, e-mail se torna required. Boleto Mercado Pago exige endereço na própria UI antes da API.

Payload externo:

```ts
{
 payerSource:'EXTERNAL', tenantId:null, payer:{...}, amount,dueDate,description,provider,paymentMethod,issue,sendEmailAfterIssue
}
```

- [ ] **Step 6: Expandir `BillingProfile`**

Adicionar seções Dados de faturamento, Responsável financeiro, Endereço e Preferências. Salvar campos novos no `PUT /profile`; checkbox `Enviar cobranças automaticamente por e-mail` controla `autoEmailCharges`.

- [ ] **Step 7: Detalhe da cobrança, reenvio e histórico**

Na visualização/detail existente da cobrança, adicionar ações:
- `Reenviar por e-mail` — abre modal com `to` preenchido por `payer_email`, `cc` opcional; chama POST `/charges/:id/email`;
- `Histórico de envios` — GET `/charges/:id/deliveries`, exibe data, AUTO/MANUAL, destinatário, status, mensagem de erro curta.

Não alterar o botão `Emitir` para gerar nova charge. Reenvio não chama `/issue`.

- [ ] **Step 8: Rodar GREEN**

```bash
node --test tests/finance-payer-ui.source.test.mjs tests/masked-forms.source.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add web/src/pages/SaasFinance.tsx web/src/styles/commercial.css tests/finance-payer-ui.source.test.mjs tests/masked-forms.source.test.mjs
git commit -m "feat: add external payer and charge email ux"
```

---

### Task 9: Verificação integrada, builds e documentação de deploy

**Files:**
- Modify: `FINANCEIRO_MULTIPROVEDOR_V2.md`
- Create: `CHANGELOG_FINANCEIRO_PAGADORES_EMAIL_V3.md`

**Interfaces:**
- Consumes: todas as tasks anteriores.
- Produces: evidência de testes/build e passos de migration/deploy.

- [ ] **Step 1: Rodar todos os testes financeiros/API relevantes**

```bash
cd api
npm run test:financial-rules
npm run test:financial-service-core
npm run test:financial-access-core
npm run test:financial-worker-core
npm run test:payment-provider-core
npm run test:payment-webhook-core
npm run test:financial-payer-core
npm run test:financial-email-core
npm run test:commercial-email
cd ..
node --test tests/finance-multiprovider.test.mjs tests/masked-forms.source.test.mjs tests/finance-payer-ui.source.test.mjs tests/saas-dashboard-ui.source.test.mjs
```

Expected: 0 failures.

- [ ] **Step 2: Rodar builds completos**

```bash
cd api && npm run build
cd ../web && npm run build
```

Expected: ambos exit code 0.

- [ ] **Step 3: Verificar migration em banco de teste/staging**

```bash
cd api
npm run db:status
npm run db:migrate
npm run db:status
```

Expected: `023_financial_payers_and_delivery.sql` aplicada uma vez e nenhuma migration pendente.

Depois executar SQL de invariantes:

```sql
SELECT COUNT(*) AS invalid_external
FROM financial_charges
WHERE tenant_id IS NULL AND NOT(type='AD_HOC' AND payer_source='EXTERNAL');

SELECT COUNT(*) AS invalid_tenant_source
FROM financial_charges
WHERE payer_source='TENANT' AND tenant_id IS NULL;
```

Expected: ambos `0`.

- [ ] **Step 4: Smoke test funcional sem custo alto**

1. Criar/editar Cliente SaaS com responsável financeiro e endereço completo.
2. Criar AD_HOC tenant `issue=false`, confirmar snapshot.
3. Alterar endereço do perfil e confirmar que a charge anterior não mudou.
4. Criar AD_HOC externo `issue=false`, confirmar `tenant_id=NULL`.
5. Confirmar `getTenantFinancialAccess()` do tenant escolhido não inclui a cobrança externa.
6. Em ambiente/provider autorizado, emitir uma cobrança de baixo valor; falhar SMTP propositalmente somente em staging e confirmar que `provider_charge_id` permanece e delivery fica `FAILED`.
7. Restaurar SMTP e usar `Reenviar por e-mail`; confirmar segunda linha de delivery e mesmo `provider_charge_id`.

- [ ] **Step 5: Documentar deploy**

`CHANGELOG_FINANCEIRO_PAGADORES_EMAIL_V3.md` deve registrar:

```text
1. git pull
2. cd apps/api (ou api conforme checkout atual)
3. npm install
4. npm run db:status
5. npm run db:migrate
6. npm run build
7. cd ../web && npm install && npm run build
8. sudo cp -a dist/. /var/www/pontoocerto/
9. pm2 restart ponto-certo-api --update-env
10. pm2 logs ponto-certo-api --lines 100
```

Não alterar credenciais dos providers nem SMTP nesta migration.

- [ ] **Step 6: Commit final de documentação**

```bash
git add FINANCEIRO_MULTIPROVEDOR_V2.md CHANGELOG_FINANCEIRO_PAGADORES_EMAIL_V3.md
git commit -m "docs: document payer and charge email rollout"
```

---

## Self-Review

- **Spec coverage:** todas as 16 condições de aceite estão mapeadas às Tasks 1–9; mensalidade automática e reenvio têm tasks próprias.
- **No placeholders:** o plano não depende de `TODO/TBD`; schemas, endpoints, nomes de campos e assinaturas estão definidos.
- **Type consistency:** `FinancialPayerSnapshot` é criado na Task 2, consumido nas Tasks 3–4 e refletido na UI da Task 8. `tenantId` é `number|null` somente no domínio de charge/event/payment; exceções continuam `number`.
- **Provider consistency:** o snapshot vira `ProviderPayer` no momento da emissão; provider/método da cobrança continuam imutáveis.
- **Email failure isolation:** a Task 4 persiste artefatos financeiros antes do SMTP e a Task 5 impede reemissão por falha de entrega.
