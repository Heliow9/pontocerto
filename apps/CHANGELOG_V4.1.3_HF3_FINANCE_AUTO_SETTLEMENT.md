# Ponto Certo V4.1.3 HF3 — baixa automática e desbloqueio Movyo

Data: 2026-09-23

## Correções

- Webhook Mercado Pago mantém validação HMAC para notificações Webhook atuais.
- Compatibilidade de recuperação para notificações IPN legadas do tópico `payment`; nenhuma baixa confia no callback: o sistema consulta a API autenticada do Mercado Pago antes de confirmar pagamento.
- Worker financeiro passa a reconciliar também cobranças `OPEN` e `OVERDUE`, além de `ISSUING`, a cada ciclo de 15 minutos. Isso recupera pagamentos quando o webhook falhar ou não chegar.
- Falha interna no webhook Mercado Pago retorna HTTP 503 (não 202), permitindo nova tentativa automática do provedor; sucesso/ignorado legítimo retorna 200.
- Se o webhook chegar antes de `provider_charge_id` ser persistido, o sistema consulta o pagamento no Mercado Pago e usa `external_reference` para localizar a cobrança local.
- Cobranças finalizadas (`PAID`/`CANCELED`) não entram na varredura automática.
- Após baixa de mensalidade de produto, o período da assinatura avança para o próximo vencimento e o estado operacional é sincronizado com a Movyo.
- Sincronizações Movyo que falharem ficam registradas e passam a ser reenviadas automaticamente pelo worker financeiro.
- Mantidas as correções anteriores de D+3 e liberação administrativa do HF2/bloqueio financeiro.

## Fluxo esperado

Pagamento no provedor -> webhook (imediato) ou reconciliação automática (fallback) -> `PAID` -> avanço da assinatura -> `ACTIVE` -> `billingAccessBlocked=false` na Movyo.
