# Ponto Certo V4.1.2 — Assinaturas e ajustes de cobrança

Data: 20/09/2026

## Objetivo

Completar a gestão comercial/financeira das assinaturas por produto e permitir ajustes pontuais de uma cobrança já emitida sem alterar, por padrão, o valor das mensalidades futuras.

## 1. Editor completo da assinatura

A tela **Assinaturas por Produto** recebeu a ação **Editar assinatura**.

Campos administráveis:

- plano do produto;
- valor mensal;
- desconto recorrente (%);
- valor efetivo calculado;
- próximo vencimento;
- e-mail financeiro de cobrança;
- provedor de cobrança;
- método de cobrança;
- tolerância antes do bloqueio;
- bloqueio automático;
- pró-rata da primeira cobrança.

Regras:

- alterações do cadastro da assinatura valem para cobranças futuras;
- alteração do e-mail financeiro atualiza o cadastro comercial do cliente;
- ao alterar o próximo vencimento, o fim do período corrente é alinhado à nova data;
- assinaturas Movyo geridas pelo Ponto Certo são sincronizadas operacionalmente após a alteração;
- cobranças já emitidas não são alteradas silenciosamente.

## 2. Desconto somente na cobrança atual

A tela **Financeiro > Cobranças** recebeu a ação **Ajustar / reemitir** para cobranças elegíveis.

O administrador pode:

- aplicar desconto percentual somente na cobrança atual;
- aplicar desconto fixo em reais somente na cobrança atual;
- alterar apenas o vencimento, sem desconto;
- alterar vencimento e desconto ao mesmo tempo;
- informar justificativa obrigatória;
- opcionalmente transformar um desconto percentual em desconto recorrente da assinatura.

## 3. Cancelamento e reemissão auditável

Ao confirmar um ajuste:

1. a cobrança original é validada;
2. se existir cobrança remota no provedor, ela é cancelada antes da substituição;
3. a cobrança original é marcada como `CANCELED`;
4. é criada uma nova revisão da mesma competência;
5. a nova cobrança recebe novo identificador/idempotency key;
6. o desconto pontual e a justificativa são gravados;
7. a nova cobrança é emitida no provedor configurado;
8. os eventos financeiros e a auditoria registram a relação entre cobrança antiga e nova;
9. para Movyo, o estado operacional é sincronizado após a reemissão.

Cobranças `PAID`, `CANCELED` ou em emissão incerta (`ISSUING`) não podem ser ajustadas pelo fluxo de reemissão.

## 4. Rastreabilidade

A migration `029_financial_charge_adjustments.sql` adiciona:

- `revision`;
- `discount_base_amount`;
- `discount_scope`;
- `discount_type`;
- `discount_value`;
- `discount_amount`;
- `reissued_from_charge_id`;
- `replaced_by_charge_id`;
- `reissue_reason`.

Os índices de competência passam a considerar `revision`, permitindo reemitir a mesma competência sem perder a proteção contra duplicidade.

Eventos adicionados ao fluxo:

- `CHARGE_REISSUED`;
- `CHARGE_ADJUSTMENT_CREATED`.

## 5. Compatibilidade de produção incorporada

Este pacote também preserva os hotfixes já necessários no ambiente produtivo:

- compatibilidade da migration 025 com MySQL 5.6;
- correções de tipagem mysql2 em `product-provisioning.service.ts`;
- conversão de DATETIME ISO para formato aceito pelo MySQL 5.6 no importador Movyo;
- edição de clientes comerciais da V4.1.1;
- pró-rata de primeira cobrança da V4.1.

## 6. Testes incluídos

- `api/tests/financial-reissue-core.test.ts`;
- `tests/v4_1_2_subscription_charge_adjustments.source.test.mjs`;
- testes de política de billing e ciclo financeiro atualizados.

O pacote deve passar pelo build da API e do frontend e pela migration 029 antes da publicação em produção.
