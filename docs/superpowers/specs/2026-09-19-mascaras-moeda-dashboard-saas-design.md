# Máscaras Globais, Moeda BRL e Dashboard SaaS Executivo — Design

**Data:** 19/09/2026  
**Projeto:** Ponto Certo SaaS  
**Base analisada:** `apps(4).zip`  
**Escopo:** Web SaaS + extensão mínima do endpoint `/saas/dashboard`

## 1. Objetivo

Padronizar a entrada e exibição de dados cadastrais e financeiros no Ponto Certo e redesenhar a visão inicial da Administração SaaS para priorizar indicadores comerciais, financeiros e operacionais realmente acionáveis.

O resultado deve permitir que o administrador:

- digite CPF, CNPJ, PIS, telefone e CEP com máscara consistente;
- digite valores financeiros como moeda brasileira, sem depender de `input[type=number]`;
- veja dados legados formatados corretamente mesmo quando estiverem armazenados apenas com dígitos;
- mantenha payloads normalizados para APIs e integrações;
- abra o Dashboard SaaS e identifique rapidamente faturamento recorrente, recebimentos, valores em aberto/vencidos, clientes e pendências que exigem ação.

## 2. Escopo funcional aprovado

### 2.1 Máscaras cadastrais globais

Criar uma camada reutilizável para:

| Dado | Formato visual |
|---|---|
| CPF | `000.000.000-00` |
| CNPJ | `00.000.000/0000-00` |
| Telefone celular | `(00) 00000-0000` |
| Telefone fixo | `(00) 0000-0000` |
| CEP | `00000-000` |
| PIS/PASEP | `000.00000.00-0` |

Requisitos:

- máscara aplicada durante digitação;
- colagem de valores com ou sem pontuação deve funcionar;
- edição de dados antigos deve preencher o campo já formatado;
- exibição em tabelas deve usar formatadores mesmo se o backend devolver apenas dígitos;
- normalização deve ficar disponível por utilitário (`digitsOnly`) para payloads que exigem valor sem máscara;
- o componente não deve alterar validações de domínio já existentes no backend.

### 2.2 Campos prioritários identificados na base atual

Aplicar inicialmente nos fluxos existentes:

- `EmployeesPage.tsx`: CPF e PIS;
- `CompaniesPage.tsx`: CNPJ, telefone e CEP/endereço onde disponível;
- `SaasPage.tsx` / cadastro de cliente SaaS: CNPJ, telefone e CEP quando presentes;
- `ProposalsPage.tsx`: CNPJ e telefone do cliente/contato quando presentes;
- automações/contatos que aceitam telefone (`CompanyAutomation.tsx`) devem usar a mesma formatação visual, preservando dígitos no payload;
- tabelas e resumos que exibem CPF/CNPJ/telefone devem usar os formatadores globais.

Não aplicar máscara textual em campos que são IDs, quantidades, horários, coordenadas, raios, limites ou outros números técnicos.

## 3. Moeda BRL

### 3.1 Componente único

Criar `CurrencyInput` controlado, com valor de domínio em número ou `null`, e exibição `pt-BR`.

Exemplos de digitação:

- `1` → `R$ 0,01`
- `12` → `R$ 0,12`
- `120` → `R$ 1,20`
- `1200` → `R$ 12,00`
- `120000` → `R$ 1.200,00`

Requisitos:

- aceitar teclado numérico;
- trabalhar internamente em centavos para evitar erros de ponto flutuante durante a digitação;
- devolver `number | null` ao formulário;
- respeitar zero quando o fluxo permitir zero;
- suportar `min`/`max` em valor monetário quando necessário;
- nunca enviar texto `R$ ...` para a API;
- formatar valores apenas na apresentação, mantendo números no domínio.

### 3.2 Locais prioritários

Substituir `input type="number"` usado para dinheiro em:

- `SaasPlans.tsx`: `priceMonthly`;
- `ContractEditor` em `SaasPlans.tsx`: `priceMonthly`;
- `SaasFinance.tsx`: valor de Implantação e Cobrança Avulsa;
- propostas comerciais e contratos onde existirem mensalidade, implantação ou outros valores;
- qualquer outro campo identificado como moeda no SaaS durante a implementação.

Campos de quantidade permanecem `number` (funcionários, filiais, dias, meses etc.).

## 4. Dashboard SaaS Executivo

### 4.1 Problema atual

`SaasPortal.tsx` renderiza doze cards de KPI com peso visual semelhante. Isso dificulta distinguir resultado financeiro, saúde da carteira e itens que exigem intervenção. O endpoint `/saas/dashboard` atualmente traz dados comerciais/operacionais e MRR, mas não consolida os principais indicadores do Financeiro.

### 4.2 Hierarquia nova

O Dashboard será dividido em quatro áreas.

#### A. Resultado financeiro — primeira faixa

Quatro cards de maior destaque:

1. **MRR** — receita mensal recorrente contratada ativa;
2. **Recebido no mês** — soma de pagamentos confirmados no mês corrente;
3. **A receber** — cobranças abertas/emitidas ainda não pagas e não canceladas;
4. **Vencido** — saldo vencido, acompanhado da quantidade de cobranças/clientes afetados.

Cada KPI deve conter:

- rótulo curto;
- valor principal;
- contexto secundário (quantidade, variação ou descrição útil quando disponível);
- link para a visão financeira correspondente quando aplicável.

#### B. Saúde do SaaS

Cards compactos:

- clientes ativos;
- clientes em teste;
- suspensos;
- funcionários ativos;
- empresas/filiais;
- contratos ativos.

Esses cards não competem visualmente com os KPIs financeiros.

#### C. Carteira e funil comercial

Duas colunas em desktop:

- **Distribuição por plano**: manter a informação atual, melhorar densidade visual e legibilidade;
- **Funil comercial**: propostas abertas, aprovadas, convertidas, expiradas e contratos aguardando assinatura.

#### D. Atenção necessária

Criar painel de prioridade operacional com itens como:

- cobranças vencidas/bloqueantes;
- clientes financeiramente bloqueados;
- contratos aguardando assinatura;
- propostas expirando/expiradas quando houver dado disponível.

Cada item deve ser clicável para a tela correspondente.

### 4.3 Ações rápidas

Posicionar no topo do Dashboard, próximas ao título:

- `+ Novo cliente`;
- `+ Nova cobrança`;
- `+ Nova proposta`;
- `Ver inadimplentes`.

A ação `Nova cobrança` deve abrir/navegar para o fluxo financeiro já existente, sem duplicar lógica.

## 5. API do Dashboard

Estender `GET /saas/dashboard` em `api/src/routes/saas-commercial.routes.ts` sem quebrar o payload atual.

Adicionar um objeto `finance`, por exemplo:

```json
{
  "finance": {
    "receivedMonth": 0,
    "openAmount": 0,
    "openCount": 0,
    "overdueAmount": 0,
    "overdueCount": 0,
    "overdueTenants": 0,
    "blockedTenants": 0,
    "attention": []
  }
}
```

Regras:

- `receivedMonth`: `financial_payments.amount` pagos no mês corrente em horário de Brasília;
- `openAmount/openCount`: cobranças em estados abertos (`ISSUING`, `OPEN`) e ainda não vencidas, ou definição equivalente consistente com o serviço financeiro;
- `overdueAmount/overdueCount`: cobranças `OVERDUE` não pagas/canceladas;
- `overdueTenants`: clientes distintos com cobrança vencida;
- `blockedTenants`: clientes atualmente bloqueados pela regra financeira, reutilizando/espelhando a lógica existente sem criar regra conflitante;
- `attention`: lista curta e ordenada por severidade/data, suficiente para o Dashboard (não substituir a tela completa de inadimplentes).

Evitar N+1 queries. Preferir agregações SQL e uma consulta limitada para a lista de atenção.

## 6. Arquitetura de componentes Web

Criar:

- `web/src/utils/masks.ts`
  - `digitsOnly`
  - `formatCpf`
  - `formatCnpj`
  - `formatCpfCnpj` (quando necessário)
  - `formatPhone`
  - `formatCep`
  - `formatPis`
  - funções de aplicação progressiva de máscara durante a digitação

- `web/src/components/MaskedInput.tsx`
  - wrapper controlado para máscaras cadastrais;
  - `inputMode` adequado;
  - `maxLength` coerente por tipo;
  - acessível via `label` externo existente.

- `web/src/components/CurrencyInput.tsx`
  - valor numérico no domínio;
  - apresentação BRL;
  - operação em centavos;
  - `inputMode="numeric"`.

Manter `money()` de `CommercialUi.tsx` para **saída/exibição**, mas não para entrada de dados.

## 7. UI/UX do SaaS

Princípios aprovados:

- maior hierarquia visual, menos cards de mesmo peso;
- informação antes de decoração;
- números financeiros maiores e alinhados;
- estados de erro, loading e vazio consistentes;
- badges/status padronizados;
- tabelas com cabeçalho legível e melhor escaneabilidade;
- formulários com grupos e ajuda contextual quando necessário;
- responsividade para notebook e celular;
- manter identidade visual atual do Ponto Certo, evoluindo o `commercial.css` sem criar um segundo design system;
- sem gráficos decorativos ou bibliotecas novas de chart nesta etapa.

## 8. Responsividade

Desktop (`>1200px`):

- 4 KPIs financeiros em linha;
- saúde em grade compacta;
- carteira/funil em duas colunas.

Tablet (`700–1200px`):

- KPIs em 2×2;
- painéis em uma ou duas colunas conforme largura.

Mobile (`<700px`):

- uma coluna;
- ações rápidas com wrap/stack;
- tabelas continuam usando scroll horizontal quando necessário;
- valores e labels não devem causar overflow.

## 9. Validação e erros

- Máscara não substitui validação: CPF/CNPJ inválidos continuam sujeitos às validações já existentes;
- campos monetários obrigatórios devem diferenciar `null` de `0`;
- valores inválidos não devem ser enviados silenciosamente;
- o usuário deve receber erro próximo ao campo ou no padrão de erro já usado pelo formulário;
- dados legados incompletos devem ser formatados apenas até onde houver dígitos, sem lançar erro.

## 10. Testes

Adicionar testes unitários/fonte para:

### Máscaras

- CPF com 11 dígitos;
- CNPJ com 14 dígitos;
- telefone com 10 e 11 dígitos;
- CEP;
- PIS;
- entrada já mascarada;
- caracteres não numéricos;
- dados parciais durante digitação.

### Moeda

- centavos progressivos;
- `R$ 0,00`;
- milhares;
- valor `null`/vazio;
- conversão visual ↔ numérica.

### Dashboard

- endpoint preserva campos atuais;
- objeto `finance` retorna os agregados esperados;
- dashboard renderiza KPIs financeiros;
- estado vazio não quebra;
- links de ação apontam para as rotas SaaS existentes.

Executar build da API e do Web após os testes.

## 11. Deploy

O Nginx deste ambiente publica o frontend em `/var/www/pontoocerto`. Portanto o deploy precisa incluir, após `npm run build` do Web:

```bash
sudo cp -a ~/ponto-certo/apps/web/dist/. /var/www/pontoocerto/
```

Depois validar que o `index.html` publicado referencia os hashes do build novo e fazer hard refresh/limpeza de cache PWA quando necessário.

A API deve ser recompilada e o processo `ponto-certo-api` reiniciado/recarregado com PM2 somente após build verde.

## 12. Fora de escopo

- troca de framework ou biblioteca de UI;
- gráficos avançados e séries históricas;
- mudança de regras de cobrança/provedores;
- alteração de esquema de CPF/CNPJ no banco;
- validação externa de documentos;
- redesign das telas Mobile/PWA de registro de ponto;
- mudanças na identidade/logo.

## 13. Critérios de aceite

A implementação será considerada pronta quando:

1. CPF/CNPJ/PIS/telefone/CEP estiverem mascarados durante entrada e exibição nos fluxos definidos;
2. campos financeiros relevantes usarem entrada BRL e enviarem números válidos ao backend;
3. o Dashboard SaaS mostrar, no topo, MRR, recebido no mês, a receber e vencido;
4. o Dashboard separar claramente saúde operacional de resultado financeiro;
5. existir painel de atenção com navegação para pendências;
6. o endpoint `/saas/dashboard` permanecer compatível com os consumidores atuais;
7. builds da API e Web passarem;
8. testes novos e regressões existentes passarem;
9. o `dist` novo estiver efetivamente publicado em `/var/www/pontoocerto` no deploy.
