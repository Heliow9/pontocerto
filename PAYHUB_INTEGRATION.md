# Integração PayHub ↔ Ponto Certo SaaS

## Implementado
- Produto PAYHUB ativado no catálogo SaaS.
- Plano `basico`: R$ 1.200/mês, até 300 funcionários, retenção configurada em 60 dias.
- Bridge HMAC entre SaaS e PayHub.
- PayHub: consulta de empresas, provisionamento, sincronização de licença, bloqueio e desbloqueio.
- PayHub: `company_licenses` separa bloqueio financeiro do status/dados da empresa.
- SaaS: sincronização de `BLOCKED`/`ACTIVE` para PayHub e logs em `product_sync_logs`.
- Script idempotente para localizar a Real Energy existente, criar/vincular cliente e assinatura no SaaS, aplicar plano Básico e iniciar em `BLOCKED`.

## Configuração
Use o MESMO segredo forte nos dois servidores.

PayHub `.env`:
PONTO_CERTO_BRIDGE_CLIENT_ID=ponto-certo
PONTO_CERTO_BRIDGE_SECRET=<segredo-compartilhado>

Ponto Certo `.env`:
PAYHUB_BRIDGE_ENABLED=1
PAYHUB_BRIDGE_BASE_URL=https://paayhub.duckdns.org
PAYHUB_BRIDGE_CLIENT_ID=ponto-certo
PAYHUB_BRIDGE_SECRET=<segredo-compartilhado>
PAYHUB_BRIDGE_TIMEOUT_MS=10000

## Ordem de deploy
1. No PayHub: `npm run db:migrate`, build e restart da API.
2. No Ponto Certo: `npm run db:migrate`, build e restart da API.
3. Configure os `.env` e reinicie as APIs.
4. No Ponto Certo API: `npm run payhub:link-realenergy`.

O último comando procura a empresa Real Energy já existente no PayHub. Ele exige exatamente uma correspondência para evitar vínculo incorreto. Não cria outra empresa PayHub.

## Teste esperado
Após `payhub:link-realenergy`, a assinatura no SaaS fica `BLOCKED`, plano `basico`, e o PayHub passa a responder `FINANCIAL_BLOCKED` (HTTP 402) nas APIs autenticadas da empresa. `/api/auth`, rotas públicas, health e bridge interno continuam disponíveis. Ao liberar financeiramente a assinatura no SaaS, `syncSubscriptionOperationalState` envia `ACTIVE` ao PayHub sem alterar holerites, funcionários, hashes, TSA ou evidências.
