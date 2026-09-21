# Ponto Certo V4.1.3 HF2 — Financeiro, PWA e notificações

## Ajustes
- Mensagens de rejeição de Efí/Cora/Mercado Pago ficam explícitas no retorno da API e na linha da cobrança.
- Rejeições comerciais determinísticas passam diretamente para `FAILED`; timeouts/rede continuam como `ISSUING` e exigem reconciliação.
- Histórico financeiro mostra rótulos amigáveis sem perder o código técnico de auditoria.
- Corrigida reemissão/nova cobrança da mesma competência após cancelamento por meio de `revision`.
- Corrigido `INSERT financial_charges` com revisão e compatibilidade da chave única da migration 029.
- UI financeiro responsiva em formato de cards no PWA/mobile, ações touch-friendly e modais com ações acessíveis.
- Novo Web Push de `Pagamento confirmado` para SUPER_ADMIN, disparado na primeira confirmação via webhook/reconciliação e também em baixa manual.
- Service Worker passa a respeitar a URL da notificação e abre `Recebimentos` ao tocar no push financeiro.
- Migration 030 adiciona assinaturas e entregas de push financeiro do painel SaaS.
- Mantidos os ajustes HF1: responsável financeiro aceita somente CPF e erros de validação retornam HTTP 400.

## Implantação
1. `npm run build` na API.
2. `npm run db:status` — deve mostrar a 030 pendente.
3. `npm run db:migrate`.
4. reiniciar `ponto-certo-api` sem `--update-env`.
5. build/publicação do Web e reload do Nginx.
6. no painel Financeiro, abrir `Notificações de pagamento` e ativar no dispositivo.

## VAPID
O Web Push financeiro reutiliza `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` já usados pelos lembretes PWA.
