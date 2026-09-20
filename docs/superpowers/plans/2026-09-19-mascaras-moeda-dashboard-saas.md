# Máscaras, Moeda BRL e Dashboard SaaS Executivo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Padronizar máscaras cadastrais e entrada monetária BRL no Ponto Certo e transformar o Dashboard SaaS em uma visão executiva com KPIs financeiros, saúde da carteira, funil comercial e itens que exigem atenção.

**Architecture:** Criar utilitários/componentes Web reutilizáveis para documentos, telefone, CEP, PIS e moeda; aplicar esses componentes nos formulários existentes sem alterar os contratos da API. Estender `GET /saas/dashboard` com agregações financeiras em SQL e redesenhar apenas a apresentação do `Overview` de `SaasPortal.tsx`, reutilizando o design system atual em `commercial.css`.

**Tech Stack:** React 19, TypeScript 5.6, Vite 5, Express, MySQL 8, CSS existente do Ponto Certo.

**Spec:** `docs/superpowers/specs/2026-09-19-mascaras-moeda-dashboard-saas-design.md`

## Global Constraints

- CPF visual: `000.000.000-00`; CNPJ: `00.000.000/0000-00`; celular: `(00) 00000-0000`; fixo: `(00) 0000-0000`; CEP: `00000-000`; PIS/PASEP: `000.00000.00-0`.
- Máscara deve funcionar durante digitação, colagem, edição de dados legados e exibição em tabelas.
- `digitsOnly` deve continuar disponível para payloads que exigem somente dígitos; não mover validação de domínio do backend para a máscara.
- `CurrencyInput` trabalha com `number | null`, digitação em centavos e nunca envia texto `R$ ...` para a API.
- Não aplicar máscara monetária em quantidades, limites, dias, meses, coordenadas, raios ou IDs.
- Dashboard mantém compatibilidade com o payload atual e adiciona `finance` sem remover campos existentes.
- Nenhuma biblioteca nova de gráfico ou novo design system nesta etapa.
- O deploy Web continua exigindo publicação de `apps/web/dist/.` em `/var/www/pontoocerto/` após o build.
- Não reintroduzir nenhuma referência operacional ao Banco Inter.

## Review Focus

- Colar CPF/CNPJ/telefone já pontuado ou apenas com dígitos deve produzir o mesmo valor visual e nunca duplicar pontuação.
- Campo monetário deve distinguir `null` de `0`, aceitar apagar completamente e preservar centavos ao editar valores existentes como `69.90`.
- Telefone com 10 dígitos deve formatar como fixo e com 11 dígitos como celular, sem overflow ao colar mais dígitos.
- Dashboard com banco sem cobranças/pagamentos deve retornar zeros e lista `attention` vazia, sem `NULL`, `NaN` ou erro SQL.
- Dados antigos sem máscara nas tabelas e modais devem ser formatados na apresentação sem alterar o valor persistido implicitamente.

---

### Task 1: Utilitários de máscara e componentes de entrada

**Files:**
- Create: `web/src/utils/masks.ts`
- Create: `web/src/components/MaskedInput.tsx`
- Create: `web/src/components/CurrencyInput.tsx`
- Create: `tests/input-formatters.test.mjs`

**Interfaces:**
- Produces: `digitsOnly(value)`, `formatCpf(value)`, `formatCnpj(value)`, `formatCpfCnpj(value)`, `formatPhone(value)`, `formatCep(value)`, `formatPis(value)`, `applyMask(type,value)`.
- Produces: `MaskedInput` with `mask: "cpf"|"cnpj"|"phone"|"cep"|"pis"`, controlled `value`, and `onChange(value:string)`.
- Produces: `CurrencyInput` with controlled `value:number|null`, `onChange(value:number|null)`, optional `min`, `max`, `disabled`, `required`, `name`, `id`, `className`.

- [ ] **Step 1: Add failing formatter tests for progressive masks and BRL cent conversion**

```js
// tests/input-formatters.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const masks=fs.readFileSync(new URL("../web/src/utils/masks.ts",import.meta.url),"utf8");
const currency=fs.readFileSync(new URL("../web/src/components/CurrencyInput.tsx",import.meta.url),"utf8");

test("mask utilities cover CPF/CNPJ/phone/CEP/PIS and digitsOnly",()=>{
  for(const token of ["digitsOnly","formatCpf","formatCnpj","formatCpfCnpj","formatPhone","formatCep","formatPis","applyMask"]){
    assert.match(masks,new RegExp(`export\\s+(?:function|const)\\s+${token}\\b`));
  }
  assert.match(masks,/slice\(0,\s*11\)/);
  assert.match(masks,/slice\(0,\s*14\)/);
});

test("CurrencyInput is numeric-domain and cent-driven",()=>{
  assert.match(currency,/value:\s*number\s*\|\s*null/);
  assert.match(currency,/Math\.round\([^\n]*\*\s*100\)/);
  assert.match(currency,/inputMode=["']numeric["']/);
  assert.doesNotMatch(currency,/type=["']number["']/);
});
```

- [ ] **Step 2: Run the formatter tests and verify they fail**

Run:
```bash
node --test tests/input-formatters.test.mjs
```
Expected: FAIL because the new files/exports do not exist.

- [ ] **Step 3: Implement `masks.ts` with capped digits and progressive formatting**

```ts
export type MaskType="cpf"|"cnpj"|"phone"|"cep"|"pis";
export const digitsOnly=(value:unknown)=>String(value??"").replace(/\D/g,"");

export function formatCpf(value:unknown){
  const d=digitsOnly(value).slice(0,11);
  return d.replace(/^(\d{3})(\d)/,"$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/,"$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/,".$1-$2");
}
export function formatCnpj(value:unknown){
  const d=digitsOnly(value).slice(0,14);
  return d.replace(/^(\d{2})(\d)/,"$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/,"$1.$2.$3").replace(/\.(\d{3})(\d)/,".$1/$2").replace(/(\/\d{4})(\d{1,2})$/,"$1-$2");
}
export function formatCpfCnpj(value:unknown){ return digitsOnly(value).length<=11?formatCpf(value):formatCnpj(value); }
export function formatPhone(value:unknown){
  const d=digitsOnly(value).slice(0,11);
  if(d.length<=10)return d.replace(/^(\d{2})(\d)/,"($1) $2").replace(/(\d{4})(\d{1,4})$/,"$1-$2");
  return d.replace(/^(\d{2})(\d)/,"($1) $2").replace(/(\d{5})(\d{1,4})$/,"$1-$2");
}
export function formatCep(value:unknown){ return digitsOnly(value).slice(0,8).replace(/^(\d{5})(\d)/,"$1-$2"); }
export function formatPis(value:unknown){
  const d=digitsOnly(value).slice(0,11);
  return d.replace(/^(\d{3})(\d)/,"$1.$2").replace(/^(\d{3})\.(\d{5})(\d)/,"$1.$2.$3").replace(/\.(\d{2})(\d)$/,".$1-$2");
}
export const applyMask=(type:MaskType,value:unknown)=>({cpf:formatCpf,cnpj:formatCnpj,phone:formatPhone,cep:formatCep,pis:formatPis}[type](value));
```

- [ ] **Step 4: Implement `MaskedInput` and `CurrencyInput` without changing API payload types**

```tsx
// MaskedInput.tsx core
export function MaskedInput({mask,value,onChange,...props}:Props){
  return <input {...props} inputMode="numeric" value={applyMask(mask,value)} onChange={e=>onChange(applyMask(mask,e.target.value))}/>;
}
```

```tsx
// CurrencyInput.tsx core
const toCents=(value:number|null)=>value==null?null:Math.round(value*100);
const fromDigits=(raw:string)=>raw?Number(raw)/100:null;
const format=(value:number|null)=>value==null?"":new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value);
```

Use a text input with `inputMode="numeric"`; on change remove non-digits, derive cents, clamp against `min/max`, and call `onChange(number|null)`.

- [ ] **Step 5: Run formatter tests and Web TypeScript build**

Run:
```bash
node --test tests/input-formatters.test.mjs
cd web && npm run build
```
Expected: tests PASS; Web build exits 0.

---

### Task 2: Apply masks and BRL inputs to existing SaaS/cadastros

**Files:**
- Modify: `web/src/pages/EmployeesPage.tsx`
- Modify: `web/src/pages/CompaniesPage.tsx`
- Modify: `web/src/pages/SaasPage.tsx`
- Modify: `web/src/pages/ProposalsPage.tsx`
- Modify: `web/src/pages/SaasPlans.tsx`
- Modify: `web/src/pages/SaasFinance.tsx`
- Modify: `web/src/components/CompanyAutomation.tsx`
- Create: `tests/masked-forms.source.test.mjs`

**Interfaces:**
- Consumes `MaskedInput`, `CurrencyInput`, and output formatters from Task 1.
- Existing API DTOs remain numeric for money; masks remain strings unless an existing endpoint already normalizes server-side.

- [ ] **Step 1: Add failing source tests that pin the prioritized fields to shared components**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),"utf8");

test("priority forms use shared document and money inputs",()=>{
  assert.match(read("web/src/pages/EmployeesPage.tsx"),/<MaskedInput[^>]+mask="cpf"/);
  assert.match(read("web/src/pages/EmployeesPage.tsx"),/<MaskedInput[^>]+mask="pis"/);
  assert.match(read("web/src/pages/CompaniesPage.tsx"),/<MaskedInput[^>]+mask="cnpj"/);
  assert.match(read("web/src/pages/CompaniesPage.tsx"),/<MaskedInput[^>]+mask="phone"/);
  assert.match(read("web/src/pages/SaasPlans.tsx"),/<CurrencyInput/);
  assert.match(read("web/src/pages/SaasFinance.tsx"),/<CurrencyInput/);
  assert.match(read("web/src/pages/ProposalsPage.tsx"),/<CurrencyInput/);
});
```

- [ ] **Step 2: Run the source tests and verify failure**

Run:
```bash
node --test tests/masked-forms.source.test.mjs
```
Expected: FAIL before imports/usages are added.

- [ ] **Step 3: Replace employee/company/client/proposal/automation document fields with `MaskedInput` and format table output**

Use examples:
```tsx
<MaskedInput mask="cpf" value={form.cpf} onChange={cpf=>setForm({...form,cpf})}/>
<MaskedInput mask="pis" value={form.pis} onChange={pis=>setForm({...form,pis})}/>
<MaskedInput mask="cnpj" value={form.cnpj} onChange={cnpj=>setForm({...form,cnpj})}/>
<MaskedInput mask="phone" value={form.phone} onChange={phone=>setForm({...form,phone})}/>
<MaskedInput mask="cep" value={form.zipCode} onChange={zipCode=>setForm({...form,zipCode})}/>
```

For output:
```tsx
<td>{formatCnpj(c.cnpj)||"-"}</td>
<small>{formatCpf(i.cpf)||"CPF não informado"}</small>
```

Before sending phone fields to integrations that explicitly require digits-only, call `digitsOnly` at the payload boundary rather than inside the input component.

- [ ] **Step 4: Replace monetary `type="number"` fields with `CurrencyInput` while keeping quantities numeric**

Apply to:
```tsx
<CurrencyInput value={form.priceMonthly} onChange={priceMonthly=>setForm({...form,priceMonthly})} min={0}/>
<CurrencyInput value={form.implementationFee} onChange={implementationFee=>setForm({...form,implementationFee})} min={0}/>
<CurrencyInput value={charge.amount} onChange={amount=>setCharge({...charge,amount})} min={0.01}/>
```

Do not replace `maxEmployees`, `maxBranches`, `implementationDays`, `dueDay`, `presetDays`, coordinates or radius fields.

- [ ] **Step 5: Run targeted source tests and full Web build**

Run:
```bash
node --test tests/input-formatters.test.mjs tests/masked-forms.source.test.mjs
cd web && npm run build
```
Expected: all tests PASS and Web build exits 0.

---

### Task 3: Extend `/saas/dashboard` with finance aggregates and attention items

**Files:**
- Modify: `api/src/routes/saas-commercial.routes.ts`
- Create: `api/src/services/saas-dashboard-finance.ts`
- Create: `api/tests/saas-dashboard-finance.test.ts`
- Modify: `api/package.json`

**Interfaces:**
- Produces `loadSaasDashboardFinance(executor)` returning `{receivedMonth,openAmount,openCount,overdueAmount,overdueCount,overdueTenants,blockedTenants,attention}`.
- `GET /saas/dashboard` appends `finance` while preserving `counts`, `proposals`, `contracts`, `monthly`, and `plans`.

- [ ] **Step 1: Write failing unit tests for numeric normalization and empty finance state**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {normalizeFinanceSummary} from "../src/services/saas-dashboard-finance.js";

test("normalizes NULL aggregate values to zero",()=>{
  assert.deepEqual(normalizeFinanceSummary({receivedMonth:null,openAmount:null,openCount:null,overdueAmount:null,overdueCount:null,overdueTenants:null,blockedTenants:null}),{
    receivedMonth:0,openAmount:0,openCount:0,overdueAmount:0,overdueCount:0,overdueTenants:0,blockedTenants:0
  });
});
```

- [ ] **Step 2: Add `test:saas-dashboard-finance` and verify RED**

In `api/package.json` add:
```json
"test:saas-dashboard-finance": "rm -rf .test-dist/saas-dashboard-finance && tsc tests/node-builtins-shim.d.ts tests/saas-dashboard-finance.test.ts src/services/saas-dashboard-finance.ts --module NodeNext --moduleResolution NodeNext --target ES2021 --esModuleInterop --skipLibCheck --outDir .test-dist/saas-dashboard-finance && node --test .test-dist/saas-dashboard-finance/tests/saas-dashboard-finance.test.js"
```

Run:
```bash
cd api && npm run test:saas-dashboard-finance
```
Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement finance summary service with aggregate queries and a bounded attention query**

Use one aggregate query for payments/charges and one limited attention query. The aggregate must use `COALESCE` and Brasília month boundaries, and include statuses `ISSUING`,`OPEN`,`OVERDUE` consistently with the current financial rules. Calculate blocked tenants from active blocking charges/exceptions using the same persisted financial state used by the existing access service; do not invent a second grace-period rule.

Service result shape:
```ts
export type SaasDashboardFinance={
  receivedMonth:number; openAmount:number; openCount:number;
  overdueAmount:number; overdueCount:number; overdueTenants:number;
  blockedTenants:number; attention:Array<{kind:string;tenantId:number;tenantName:string;chargeId?:number;label:string;amount?:number;date?:string;href:string}>;
};
```

- [ ] **Step 4: Wire the service into `/dashboard` without changing existing keys**

```ts
const finance=await loadSaasDashboardFinance(pool);
res.json({
  counts:{...counts,trial:trial.trial||0,employees:operations.employees||0,companies:operations.companies||0,branches:operations.branches||0},
  proposals,contracts,monthly:billing.monthly,plans,finance
});
```

- [ ] **Step 5: Run finance unit test, API build, and existing financial tests**

Run:
```bash
cd api
npm run test:saas-dashboard-finance
npm run test:financial-rules
npm run test:financial-access-core
npm run build
```
Expected: all tests PASS and API build exits 0.

---

### Task 4: Redesign Dashboard SaaS and add deploy-safe cleanup

**Files:**
- Modify: `web/src/pages/SaasPortal.tsx`
- Modify: `web/src/pages/commercial.css`
- Delete: `web/src/pages/SaasFinanceInter.tsx`
- Create: `tests/saas-dashboard-ui.source.test.mjs`
- Create: `DASHBOARD_MASKS_UIUX_V1.md`

**Interfaces:**
- Consumes `r.data.finance` added in Task 3 and existing `money()` presentation helper.
- Quick actions navigate to existing routes only; no duplicated business logic.

- [ ] **Step 1: Add failing source test for dashboard hierarchy, actions, attention and Inter cleanup**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const portal=fs.readFileSync(new URL("../web/src/pages/SaasPortal.tsx",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../web/src/pages/commercial.css",import.meta.url),"utf8");

test("SaaS overview has executive finance hierarchy and quick actions",()=>{
  for(const label of ["Recebido no mês","A receber","Vencido","Atenção necessária","+ Novo cliente","+ Nova cobrança","+ Nova proposta","Ver inadimplentes"]){ assert.match(portal,new RegExp(label.replace(/[+]/g,"\\+"))); }
  assert.match(css,/commercial-finance-kpis/);
  assert.match(css,/commercial-health-grid/);
  assert.match(css,/commercial-attention/);
});

test("legacy Inter SaaS page is removed",()=>{
  assert.equal(fs.existsSync(new URL("../web/src/pages/SaasFinanceInter.tsx",import.meta.url)),false);
});
```

- [ ] **Step 2: Run UI source test and verify RED**

Run:
```bash
node --test tests/saas-dashboard-ui.source.test.mjs
```
Expected: FAIL before redesign and file removal.

- [ ] **Step 3: Replace 12 equal-weight cards with four finance KPIs + compact SaaS health cards**

In `Overview` render:
```tsx
<section className="commercial-finance-kpis">...</section>
<section className="commercial-health-grid">...</section>
```

Finance cards:
- MRR -> `money(r.data?.monthly)`
- Recebido no mês -> `money(r.data?.finance?.receivedMonth)`
- A receber -> `money(r.data?.finance?.openAmount)` + count
- Vencido -> `money(r.data?.finance?.overdueAmount)` + overdue tenants/count

Health cards:
- active, trial, suspended, employees, companies, contracts.active.

- [ ] **Step 4: Add top quick actions, portfolio/funnel columns and attention panel**

Use existing hashes:
```tsx
<a href="#saas/clients">+ Novo cliente</a>
<a href="#saas/finance-charges">+ Nova cobrança</a>
<a href="#saas/proposals">+ Nova proposta</a>
<a href="#saas/finance-delinquent">Ver inadimplentes</a>
```

Render `finance.attention` as a limited clickable list with empty state. Keep current plan distribution and commercial summary, but improve hierarchy and labels.

- [ ] **Step 5: Implement responsive CSS using the existing commercial design language**

Add classes:
```css
.commercial-finance-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.commercial-health-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
.commercial-attention{display:grid;gap:10px}
@media(max-width:1200px){.commercial-finance-kpis{grid-template-columns:repeat(2,1fr)}.commercial-health-grid{grid-template-columns:repeat(3,1fr)}}
@media(max-width:700px){.commercial-finance-kpis,.commercial-health-grid{grid-template-columns:1fr}.commercial-heading-actions{flex-wrap:wrap}}
```

Refine spacing, typography, secondary text, hover/focus and empty/loading states without introducing chart dependencies.

- [ ] **Step 6: Delete the orphan Inter page and document deployment**

Delete:
```text
web/src/pages/SaasFinanceInter.tsx
```

Document in `DASHBOARD_MASKS_UIUX_V1.md`:
```bash
cd ~/ponto-certo/apps/api && npm run build
cd ~/ponto-certo/apps/web && npm run build
sudo cp -a ~/ponto-certo/apps/web/dist/. /var/www/pontoocerto/
pm2 restart ponto-certo-api --update-env
```

- [ ] **Step 7: Run final source tests, API/Web builds and reference scan**

Run:
```bash
node --test tests/input-formatters.test.mjs tests/masked-forms.source.test.mjs tests/saas-dashboard-ui.source.test.mjs
cd api && npm run test:saas-dashboard-finance && npm run build
cd ../web && npm run build
cd .. && ! rg -n "Banco Inter|SaasFinanceInter|inter-billing|webhooks/inter" web/src api/src
```
Expected: tests PASS, both builds exit 0, and active-source Inter scan returns no matches.

---

## Self-review results

- Spec coverage: all mask types, prioritized forms, BRL input behavior, API finance payload, executive hierarchy, attention list, quick actions, responsiveness and deploy publication are mapped to tasks.
- Placeholder scan: no `TBD`, `TODO`, “implement later”, or unspecified error-handling steps remain.
- Type consistency: `finance` payload and `CurrencyInput number|null` contracts are consistent across tasks.
- Review Focus: each of the five risky input/empty-state classes is pinned by Task 1, Task 2, or Task 3 tests.
