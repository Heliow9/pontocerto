# Cora — ativação operacional e hardening (24/09/2026)

- Revisada a integração Cora já existente no Financeiro multiprovedor.
- Confirmado uso da modalidade Integração Direta com mTLS + OAuth2 Client Credentials.
- Mantido suporte a Boleto + Pix, Pix e Boleto via `/v2/invoices`.
- Mantido cadastro remoto de webhook `invoice/*`.
- Ajustado o processamento do webhook para persistir `webhook-event-id`, `webhook-event-type` e `webhook-resource-id` junto ao evento local.
- Com isso, o retry automático do worker preserva o invoice id mesmo quando o POST original da Cora chegou com corpo vazio.
- Adicionado guia `apps/docs/CORA_INTEGRACAO_DIRETA_2026-09-24.md` com configuração de produção, certificados, `.env`, teste mTLS, webhook e roteiro de homologação.
