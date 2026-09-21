# Implantação V4.1.3 HF2 em produção

## Pré-requisitos
- Fazer backup do banco e do frontend publicado.
- Não usar `git reset --hard`/`git clean` em servidor com hotfixes locais sem antes preservar diff/stash.
- HTTPS ativo no PWA.
- Para notificações: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` configurados.
- Webhooks dos provedores financeiros configurados; a notificação de pagamento é disparada quando o pagamento é confirmado/reconciliado.

## API
1. `cd ~/ponto-certo/apps/api`
2. `npm run build`
3. `npm run test:core`
4. `npm run db:status` — esperar somente `030_saas_financial_push_notifications.sql` se a 029 já estiver aplicada.
5. `npm run db:migrate`
6. `npm run db:status` — esperar 0 pendentes.
7. `pm2 restart ponto-certo-api` (sem `--update-env`).
8. `curl -s http://127.0.0.1:3340/health`
9. `pm2 logs ponto-certo-api --lines 80 --nostream`

## Web/PWA
1. `cd ~/ponto-certo/apps/web`
2. `npm run build`
3. `sudo rsync -av --delete dist/ /var/www/pontoocerto/`
4. `sudo nginx -t && sudo systemctl reload nginx`
5. Abrir o site, atualizar o Service Worker e usar `Ctrl+Shift+R` se necessário.

## Ativar notificação de pagamento
- Painel SaaS > Financeiro > botão `Notificações de pagamento`.
- Ativar no dispositivo e conceder permissão do navegador.
- No iPhone/iPad: instalar o PWA na Tela de Início e abrir pelo ícone instalado antes de habilitar Web Push.

## Teste financeiro recomendado
1. Criar cobrança em `DRAFT` sem emissão automática.
2. Emitir e confirmar `OPEN`.
3. Testar `Ajustar / reemitir` com desconto pontual.
4. Confirmar pagamento no provedor.
5. Verificar status `PAID`, recibo e push `Pagamento confirmado`.
