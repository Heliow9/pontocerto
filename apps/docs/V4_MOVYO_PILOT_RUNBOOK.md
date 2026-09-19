# V4 Movyo — Runbook do piloto de migração

## Objetivo

Validar, com **um único restaurante Movyo de baixo risco**, o ciclo completo da assinatura SaaS centralizada no Ponto Certo antes de liberar qualquer migração em lote.

Este piloto altera somente a **mensalidade SaaS Movyo**. Não alterar credenciais, tokens, adquirentes ou configurações de pagamento dos pedidos feitos pelos consumidores nos restaurantes.

## 1. Pré-condições obrigatórias

O cliente piloto deve possuir:

- restaurante ativo na Movyo;
- CNPJ válido e sem conflito com outro Cliente Comercial;
- e-mail financeiro válido;
- CEP, logradouro, número, bairro, cidade e UF completos;
- plano Movyo conhecido;
- preço mensal e eventual desconto conhecidos;
- `dataFimPlano`/período pago atual conhecido;
- nenhuma cobrança Pix SaaS legada em aberto;
- responsável disponível para confirmar recebimento da cobrança e acesso Desktop/Hub.

Não usar como piloto um cliente com cobrança disputada, cancelamento em andamento, cadastro duplicado ou preço contratual não confirmado.

## 2. Pré-flight técnico

No Ponto Certo, confirmar antes do cutover:

```env
MOVYO_BRIDGE_ENABLED=1
MOVYO_BRIDGE_BASE_URL=https://api.movyo.delivery
MOVYO_BRIDGE_CLIENT_ID=ponto-certo
MOVYO_BRIDGE_SECRET=<segredo configurado nos dois servidores>
MOVYO_SYNC_WORKER_ENABLED=0
```

Durante o piloto, manter o worker periódico desligado. A reconciliação será manual para facilitar diagnóstico.

No financeiro, confirmar que o provedor escolhido para Movyo está **habilitado e testado**. Para Efí/BolePix, validar credenciais, certificado Pix, webhook mTLS e método `HYBRID` antes de emitir a cobrança.

## 3. Variáveis dos exemplos

Os comandos abaixo são exemplos operacionais. Nunca salvar token administrativo ou segredo HMAC no Git.

```bash
export BASE_URL="https://pontoocerto.duckdns.org/api"
export SAAS_JWT="<token SUPER_ADMIN>"
export MOVYO_ID="<id do restaurante Movyo>"
export COMPETENCE="2026-10"
```

## 4. Sincronizar diretório Movyo — read-only

```bash
curl -fsS -X POST \
  "$BASE_URL/saas/integrations/movyo/sync" \
  -H "Authorization: Bearer $SAAS_JWT" \
  -H "Content-Type: application/json"
```

Depois consultar:

```bash
curl -fsS \
  "$BASE_URL/saas/integrations/movyo/customers" \
  -H "Authorization: Bearer $SAAS_JWT"
```

Nesta etapa nenhuma cobrança é criada e nenhum cliente deve sofrer cutover.

## 5. Importar o cliente piloto

```bash
curl -fsS -X POST \
  "$BASE_URL/saas/integrations/movyo/customers/$MOVYO_ID/import" \
  -H "Authorization: Bearer $SAAS_JWT" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Resultado esperado:

```text
migration_status = READY_TO_MIGRATE
billing_source   = MOVYO_LEGACY
```

Se retornar `PENDING_DATA` ou `CONFLICT`, corrigir/vincular o Cliente Comercial antes de continuar. Não forçar o cutover.

## 6. Conferência antes do cutover

Na tela **Admin SaaS → Integração Movyo**, comparar Movyo × Ponto Certo e confirmar:

- CNPJ;
- e-mail de cobrança;
- endereço;
- plano;
- mensalidade;
- desconto;
- período pago atual;
- próximo vencimento.

Também confirmar que o painel não indica cobrança SaaS Pix legada em aberto.

## 7. Executar cutover individual

```bash
curl -fsS -X POST \
  "$BASE_URL/saas/integrations/movyo/customers/$MOVYO_ID/cutover" \
  -H "Authorization: Bearer $SAAS_JWT" \
  -H "Content-Type: application/json" \
  -d '{"confirm":true}'
```

Resultado esperado:

```text
Movyo billingSource = PONTO_CERTO
mapping status       = PONTO_CERTO
subscription source  = PONTO_CERTO
```

A partir daqui a Movyo não deve gerar nova mensalidade Pix no fluxo legado desse restaurante.

## 7.1. Regra de pró-rata V4.1

Para **clientes Movyo já existentes e importados**, o pró-rata permanece desabilitado para não alterar período pago ou preço histórico. O primeiro boleto após o cutover segue o valor contratual normal preservado na migração.

Para **novas vendas Movyo**, a assinatura é criada com `first_cycle_prorata_enabled = 1`. O Ponto Certo calcula a primeira cobrança proporcional entre a data de início e o primeiro vencimento, usando a quantidade real de dias do ciclo. Depois da primeira cobrança, as mensalidades seguintes voltam ao valor integral.

Exemplo: início 20/09, vencimento 10/10, mensalidade R$ 129,90 → 20/30 dias → R$ 86,60.

Antes do piloto/produção V4.1, aplicar também:

```text
Ponto Certo: api/sql/028_product_first_cycle_prorata.sql
Movyo: sql/migrations/022_ponto_certo_prorata.sql
```

## 8. Emitir a primeira mensalidade pelo Ponto Certo

Obter o `productSubscriptionId` do retorno/importação e emitir somente a competência correta:

```bash
export SUBSCRIPTION_ID="<id da assinatura de produto>"

curl -fsS -X POST \
  "$BASE_URL/saas/finance/charges/product-monthly" \
  -H "Authorization: Bearer $SAAS_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"subscriptionId\":$SUBSCRIPTION_ID,\"competence\":\"$COMPETENCE\",\"issue\":true,\"sendEmailAfterIssue\":true}"
```

Conferir no retorno:

- `product_code = MOVYO`;
- provedor esperado;
- método esperado (`HYBRID` para BolePix, quando configurado);
- valor correto;
- vencimento correto;
- boleto/linha digitável quando disponível;
- QR/Pix copia e cola quando disponível;
- destinatário de e-mail correto.

Não emitir uma segunda competência para “testar novamente”. A chave da assinatura + competência é idempotente.

## 9. Validar Desktop e Hub antes do pagamento

Para o cliente migrado:

- não deve existir ação funcional de **Gerar Pix** da mensalidade legada;
- Desktop e Hub devem exibir apenas os meios emitidos pelo Ponto Certo;
- quando disponíveis, devem aparecer `Abrir boleto`, `Copiar linha digitável` e `Copiar Pix`;
- os apps continuam consultando a API Movyo, nunca a API interna do Ponto Certo diretamente.

## 10. Pagamento e webhook

Efetuar o pagamento real da cobrança piloto e aguardar o webhook do provedor.

Validar no Ponto Certo:

```text
financial_charges.status = PAID
existe exatamente 1 financial_payments para o pagamento do provedor
product_subscriptions.current_period_end avançou uma única vez
```

Reenvio/repetição do webhook não pode criar novo pagamento nem acrescentar outro mês.

## 11. Reconciliar manualmente

```bash
curl -fsS -X POST \
  "$BASE_URL/saas/integrations/movyo/customers/$MOVYO_ID/reconcile" \
  -H "Authorization: Bearer $SAAS_JWT" \
  -H "Content-Type: application/json"
```

Confirmar que a Movyo reflete:

```text
billingSource = PONTO_CERTO
billingStatus = ACTIVE ou GRACE conforme estado real
billingCurrentPeriodEnd = mesmo período do Ponto Certo
billingAccessBlocked = false após pagamento válido
```

## 12. Validar bloqueio e desbloqueio

Somente em ambiente/cliente piloto previamente combinado, validar a regra financeira de tolerância:

1. cobrança vencida;
2. expiração da tolerância;
3. Ponto Certo marca a assinatura como bloqueada;
4. sincronização envia bloqueio à Movyo;
5. Desktop/Hub exibem a tela de cobrança;
6. pagamento/exceção financeira remove o bloqueio;
7. Movyo volta a permitir acesso sem reinstalação.

Não alterar `restaurante.ativo` por bloqueio financeiro; o bloqueio financeiro deve permanecer separado do bloqueio operacional/manual.

## 13. Critérios para considerar o piloto aprovado

Marcar o piloto como aprovado somente depois de observar, em produção:

```text
sincronização do diretório
importação sem duplicidade
cutover individual
emissão BolePix/boleto
entrega por e-mail
visualização no Desktop
visualização no Hub/PWA
pagamento real
webhook
uma única renovação
sincronização do novo período
bloqueio/desbloqueio ou exceção financeira
reconciliação sem divergência
```

Depois disso, no Ponto Certo, acessar **Integração Movyo → Controles de rollout** e marcar primeiro **Piloto Movyo validado em produção**. A liberação de lote é uma segunda ação independente.

## 14. Rollback do piloto

Rollback só é permitido enquanto **não houver período pago pelo Ponto Certo após o cutover**.

```bash
curl -fsS -X POST \
  "$BASE_URL/saas/integrations/movyo/customers/$MOVYO_ID/rollback" \
  -H "Authorization: Bearer $SAAS_JWT" \
  -H "Content-Type: application/json" \
  -d '{"confirm":true}'
```

Resultado esperado:

```text
Movyo billingSource = MOVYO_LEGACY
mapping status       = LEGACY_MOVYO
```

Se existir cobrança Ponto Certo paga após o cutover, o sistema deve recusar o rollback com `MOVYO_ROLLBACK_HAS_PAID_PERIOD` para impedir perda de período já adquirido.

## 15. Liberação da migração em lote

Não liberar lote no mesmo momento em que se inicia o piloto.

Após o piloto ser formalmente validado:

1. marcar `movyoPilotApproved=true`;
2. revisar logs/financeiro;
3. somente então marcar `bulkCutoverEnabled=true`;
4. migrar pequenos lotes inicialmente;
5. revisar falhas individualmente.

A API limita a operação a 50 IDs por requisição e cada cliente continua passando por todas as validações individuais de cutover.

## 16. Ativação do worker periódico

Somente após o piloto aprovado e estabilidade observada, alterar:

```env
MOVYO_SYNC_WORKER_ENABLED=1
```

Reiniciar apenas a API Ponto Certo. O worker compara o espelho Movyo com o Ponto Certo e reenvia somente divergências seguras. Identidade conflitante, cliente ausente ou timeout ficam registrados para revisão manual.

## 17. Abort conditions

Interromper a migração e manter lote bloqueado se ocorrer qualquer um destes casos:

- cobrança duplicada;
- período renovado duas vezes;
- cobrança com valor/vencimento incorreto;
- cliente errado por conflito de CNPJ;
- Movyo continua permitindo gerar Pix SaaS legado após cutover;
- Desktop/Hub acessam diretamente o bridge interno;
- pagamento confirmado no provedor sem reconciliação no Ponto Certo;
- bloqueio financeiro altera pagamentos de pedidos dos consumidores;
- divergência de licença que não pode ser reconciliada com segurança.
