# Build Fix V2.1

Correções aplicadas após o primeiro build real no Lightsail em 19/09/2026:

- tipagem de `OVERDUE` na reconciliação financeira;
- narrowing tipado do provider padrão;
- tipos HTTP/headers do helper HTTPS;
- `.gitignore` reforçado para `.dependency-backup/` e `*.zip`.

## Remover arquivos legados do Banco Inter do repositório

Como a V2 foi aplicada por sobreposição de arquivos, arquivos da V1 podem permanecer no Git mesmo não existindo mais no pacote. Remova-os uma vez no repositório:

```bash
git rm -f apps/api/src/routes/inter-webhook.routes.ts \
  apps/api/src/services/inter-billing-core.ts \
  apps/api/src/services/inter-billing.service.ts \
  apps/api/src/services/inter-webhook-core.ts \
  apps/api/src/services/inter-webhook.service.ts
```

Se algum arquivo já não existir, use `git rm --ignore-unmatch` no lugar de `git rm -f`.

Depois rode `npm run build` em `apps/api`.
