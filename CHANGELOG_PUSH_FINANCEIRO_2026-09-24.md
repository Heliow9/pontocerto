# HOTFIX · Notificações financeiras PWA · 2026-09-24

## Sintoma
Ao clicar em **Ativar notificações** na tela financeira, o navegador criava a assinatura Web Push, mas o endpoint `PUT /api/saas/finance/notifications/subscription` retornava HTTP 400 e a interface exibia `Confira os campos informados.`.

## Causa
`PushSubscription.toJSON()` em navegadores Chromium pode incluir `expirationTime: null`. A API validava `subscription` com schema estrito contendo somente `endpoint` e `keys`, portanto uma assinatura válida era rejeitada por causa do campo adicional.

## Correção
- Frontend envia explicitamente apenas `endpoint`, `keys.p256dh` e `keys.auth`.
- Backend aceita `expirationTime` opcional/nulo para compatibilidade entre navegadores.
- Backend normaliza a persistência para somente `endpoint` e `keys`.
- Mantidas as validações de endpoint HTTPS, chaves VAPID e device key.

## Arquivos alterados
- `apps/web/src/pages/SaasFinance.tsx`
- `apps/api/src/routes/saas-finance.routes.ts`
- `apps/tests/financial-push-subscription.source.test.mjs`

## Validação
Teste de regressão source-level: 2/2 aprovado.
