# Changelog — Financeiro SaaS + Banco Inter V1

## Novo módulo Financeiro SaaS

- Dashboard financeiro na Administração SaaS.
- Cobranças de mensalidade, implantação e avulsas.
- Vencimento mensal configurável em 5, 10 ou 15.
- Geração automática da mensalidade no dia 1.
- Recebimentos, inadimplentes e logs financeiros.
- Perfil financeiro por cliente.

## Inadimplência e acesso

- Tolerância padrão de 3 dias corridos.
- Bloqueio financeiro sem alterar a suspensão administrativa do tenant.
- Exceções temporárias de +5, +10, +30 dias ou data personalizada.
- Liberação automática após pagamento quando não existem outras pendências bloqueantes.
- Tela de autoatendimento para TENANT_ADMIN bloqueado.

## Banco Inter Empresas

- OAuth2 com mTLS.
- Certificado `.crt` + chave `.key` no backend.
- API Cobrança (Boleto com Pix).
- Emissão, consulta, PDF, cancelamento e conciliação.
- Webhook público `/webhooks/inter/billing`.
- Processamento idempotente de callbacks.
- Token OAuth reutilizado até próximo da expiração.
- Tratamento do modelo assíncrono da API Cobrança para evitar emissão duplicada.

## Banco de dados

Adicionada a migration `api/sql/021_financial_billing.sql`.

## Fora do escopo

- NFS-e.
- Automação fiscal.
- Pix Automático.
