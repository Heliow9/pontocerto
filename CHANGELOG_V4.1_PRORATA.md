# V4.1 — Pró-rata da primeira mensalidade multiproduto

Data: 19/09/2026
Base: V4 Movyo/Ponto Certo (commit de origem `d26224b`)

## Regra

Novas assinaturas podem calcular automaticamente a primeira mensalidade de forma proporcional até o primeiro vencimento escolhido.

Exemplo:
- início: 20/09/2026;
- vencimento: dia 10;
- primeiro vencimento: 10/10/2026;
- ciclo de referência: 10/09 a 10/10 = 30 dias;
- período proporcional: 20/09 a 10/10 = 20 dias;
- mensalidade: R$ 129,90;
- primeira cobrança: R$ 86,60.

O cálculo usa a quantidade real de dias do ciclo, aplica primeiro o desconto comercial e arredonda em centavos.

## Segurança de migração

- Assinaturas já existentes/backfill permanecem com pró-rata desabilitado por padrão.
- Clientes Movyo importados do billing legado não recebem pró-rata retroativo.
- Novas assinaturas criadas pelo fluxo comercial/provisionamento Movyo habilitam pró-rata automaticamente.
- Após o primeiro período, as cobranças retornam ao valor mensal integral.

## Auditoria

Migration Ponto Certo `028_product_first_cycle_prorata.sql` adiciona:
- `product_subscriptions.first_cycle_prorata_enabled`;
- `financial_charges.base_amount`;
- `financial_charges.is_prorata`;
- `financial_charges.prorata_days`;
- `financial_charges.prorata_cycle_days`;
- `financial_charges.billing_period_start`;
- `financial_charges.billing_period_end`.

A descrição e o evento financeiro registram os dias proporcionais utilizados.

## Movyo

Migration Movyo `022_ponto_certo_prorata.sql` espelha os metadados necessários para Desktop/Hub exibirem:

`Primeira cobrança proporcional: X de Y dias do ciclo.`

O valor mensal do plano continua sendo exibido separadamente do valor proporcional efetivamente cobrado.
