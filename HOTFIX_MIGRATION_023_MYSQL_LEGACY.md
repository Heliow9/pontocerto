# Hotfix Migration 023 — MySQL legado

## Causa
A versão anterior de `023_financial_payers_and_delivery.sql` utilizava `REGEXP_REPLACE`, função indisponível no MySQL do servidor Ponto Certo. Como DDL em MySQL faz commit implícito, a criação inicial das colunas de `saas_billing_profiles` pode ter sido aplicada mesmo com a migration registrada como pendente.

## Correção
- Remove uso de `REGEXP_REPLACE` e usa `REPLACE` aninhado compatível com versões antigas do MySQL.
- Todas as novas colunas da migration 023 agora são adicionadas somente quando não existem, consultando `information_schema.COLUMNS`.
- O índice `idx_financial_payer_document` é criado somente quando ausente.
- FKs alteradas pela migration são removidas/adicionadas de forma defensiva.
- A migration pode ser reexecutada após a falha anterior sem remover manualmente as colunas já criadas.

## Aplicação no servidor
Depois de atualizar o código:

```bash
cd ~/ponto-certo/apps/api
npm run db:status
npm run db:migrate
npm run db:status
npm run build
```

Resultado esperado após `db:migrate`:

```text
Aplicada: 023_financial_payers_and_delivery.sql
```

E depois:

```text
Migrações pendentes: 0
```

Não apague manualmente as colunas criadas pela tentativa anterior.
