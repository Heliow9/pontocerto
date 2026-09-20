# Financeiro V3 — Pagadores, cadastro financeiro e e-mail de cobrança

Data: 19/09/2026

## Objetivo

Esta versão amplia o Financeiro SaaS do Ponto Certo para separar corretamente **Cliente SaaS** de **pagador de cobrança**, permitindo cobranças avulsas para pessoas/empresas externas sem criar tenant. Também adiciona cadastro financeiro completo do Cliente SaaS, snapshot imutável do pagador e envio/reenvio de cobranças por e-mail usando a configuração SMTP já existente.

## Principais alterações

### Cliente SaaS

O perfil financeiro do tenant passa a armazenar:

- razão social e nome fantasia;
- CNPJ/CPF de faturamento;
- e-mail e telefone de faturamento;
- responsável financeiro;
- CPF do responsável financeiro;
- e-mail e telefone do responsável financeiro;
- CEP, logradouro, número, complemento, bairro, cidade e UF;
- preferência `Enviar cobranças automaticamente por e-mail`, habilitada por padrão.

A listagem administrativa sinaliza clientes cujo cadastro financeiro está incompleto.

### Cobrança avulsa

Uma cobrança `AD_HOC` pode ser criada para:

1. **Cliente SaaS** — usa o cadastro financeiro do tenant; ou
2. **Pagador avulso** — PF/PJ informada diretamente no modal, sem tenant.

Apenas cobrança avulsa externa pode ter `tenant_id = NULL`. Mensalidade e implantação continuam obrigatoriamente vinculadas a um Cliente SaaS.

### Snapshot do pagador

Toda cobrança grava os dados do pagador no momento da criação. Alterações posteriores no cadastro do Cliente SaaS não modificam cobranças antigas.

O snapshot inclui origem, tipo de pessoa, nome/razão social, documento, e-mail, telefone e endereço. A emissão nos providers usa esse snapshot, e não consulta novamente o cadastro mestre para substituir dados históricos.

### Regras de bloqueio

Cobranças externas não participam do controle de acesso do SaaS. Uma cobrança avulsa com `payer_source = EXTERNAL` e `tenant_id = NULL` nunca coloca assinatura/tenant em `PAST_DUE` e nunca bloqueia acesso ao Ponto Certo.

### Envio automático por e-mail

Após uma emissão bem-sucedida no provider, o Ponto Certo pode enviar a cobrança automaticamente para o responsável financeiro/pagador.

- opção habilitada por padrão;
- pode ser desmarcada antes da emissão;
- utiliza a configuração SMTP já existente em `saas_settings`;
- falha SMTP não cancela nem reemite a cobrança;
- cada tentativa fica registrada como `PENDING`, `SENT` ou `FAILED`;
- reenvio manual reutiliza a cobrança existente e não cria novo `provider_charge_id`.

O e-mail pode apresentar, conforme os dados retornados pelo provider, link de pagamento, linha digitável, Pix copia e cola e QR Code.

### Mercado Pago

Para boleto Mercado Pago o cadastro do pagador precisa ter, além de nome/documento, e-mail e endereço completo. O sistema valida esses campos antes da chamada externa e informa os dados faltantes. Pix não exige o endereço completo.

### Interface

O Financeiro agora possui:

- seletor `Cliente SaaS / Pagador avulso` na cobrança avulsa;
- formulário PF/PJ com máscaras de CPF/CNPJ, telefone e CEP;
- visualização do perfil financeiro do Cliente SaaS;
- opção `Enviar cobrança por e-mail após emissão`;
- ação `Reenviar por e-mail`;
- modal de histórico de envios;
- identificação do pagador externo nas tabelas, recibos, logs e CSVs.
- documento do pagador é exibido com máscara CPF/CNPJ nas telas financeiras.

## Migration

Nova migration:

```text
api/sql/023_financial_payers_and_delivery.sql
```

Ela:

- expande `saas_billing_profiles`;
- adiciona o snapshot `payer_*` e `send_email_after_issue` em `financial_charges`;
- permite `tenant_id NULL` nas tabelas financeiras necessárias;
- restringe a ausência de tenant ao caso `AD_HOC + EXTERNAL`;
- cria `financial_charge_deliveries`;
- faz backfill dos registros existentes quando há dados cadastrais disponíveis.

## Deploy no Lightsail

No repositório:

```bash
cd ~/ponto-certo
git pull origin main
```

API:

```bash
cd ~/ponto-certo/apps/api
npm install
npm run db:status
npm run db:migrate
npm run db:status
npm run build
```

Confirme que `023_financial_payers_and_delivery.sql` aparece como aplicada uma única vez e que não existem migrations pendentes.

Web:

```bash
cd ~/ponto-certo/apps/web
npm install
npm run build
sudo cp -a ~/ponto-certo/apps/web/dist/. /var/www/pontoocerto/
```

API/PM2:

```bash
pm2 restart ponto-certo-api --update-env
pm2 logs ponto-certo-api --lines 100
```

Depois atualize o navegador/PWA. Em navegador desktop, use `Ctrl+F5` se necessário.

## Conferência pós-migration

Execute no banco:

```sql
SELECT COUNT(*) AS invalid_external
FROM financial_charges
WHERE tenant_id IS NULL
  AND NOT(type='AD_HOC' AND payer_source='EXTERNAL');

SELECT COUNT(*) AS invalid_tenant_source
FROM financial_charges
WHERE payer_source='TENANT' AND tenant_id IS NULL;
```

Os dois resultados devem ser `0`.

## Smoke test recomendado

1. Completar endereço e responsável financeiro de um Cliente SaaS.
2. Criar uma cobrança avulsa para esse Cliente SaaS sem emitir e conferir o snapshot.
3. Alterar o cadastro do cliente e confirmar que a cobrança antiga manteve o snapshot.
4. Criar uma cobrança avulsa para `Pagador avulso` e confirmar `tenant_id = NULL`.
5. Confirmar que a cobrança externa não altera o acesso de nenhum tenant.
6. Emitir uma cobrança de baixo valor em provider autorizado.
7. Confirmar envio automático do e-mail.
8. Executar `Reenviar por e-mail` e confirmar nova linha no histórico, mantendo o mesmo identificador do provider.

## Segurança e configuração

Esta versão **não altera credenciais de Cora, Efí, Mercado Pago ou SMTP**. Tokens, certificados, senhas e chaves continuam fora do frontend/Git e devem permanecer somente na configuração segura do servidor.

## Verificação do pacote fonte

No fechamento deste pacote foram executados 60 testes focados em Financeiro, multiprovedor, e-mail, máscaras e Dashboard, todos com sucesso. Os builds integrais de API e Web não puderam concluir nesse ambiente porque o ZIP base não contém `node_modules`; os diagnósticos iniciais foram de dependências ausentes (`express`, `zod`, `react`, tipos Node, etc.). Portanto, `npm install` e os dois builds acima continuam sendo gates obrigatórios no Lightsail antes da publicação.
