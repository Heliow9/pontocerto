# Implantação Ponto Certo V4.1.3 em Produção

Este roteiro assume o ambiente atual do Lightsail com:
- projeto em `/home/ubuntu/ponto-certo`;
- API PM2 `ponto-certo-api` na porta 3340;
- frontend publicado em `/var/www/pontoocerto`;
- MySQL 5.6;
- V4.1.2/029 já aplicada.

## 1. Backup

Antes de alterar código, faça backup do banco e do frontend publicado.

```bash
cd ~/ponto-certo/apps/api && BACKUP="$HOME/ponto-certo-db-before-v4.1.3-$(date +%Y%m%d-%H%M%S).sql.gz" && (set -a; source .env; set +a; MYSQL_PWD="$MYSQL_PASSWORD" mysqldump --single-transaction --quick --routines --triggers -h "$MYSQL_HOST" -P "${MYSQL_PORT:-3306}" -u "$MYSQL_USER" "$MYSQL_DATABASE" | gzip > "$BACKUP") && ls -lh "$BACKUP"
```

```bash
sudo tar -czf "$HOME/ponto-certo-web-before-v4.1.3-$(date +%Y%m%d-%H%M%S).tar.gz" -C /var/www pontoocerto
```

## 2. Preserve ambiente

Nunca substitua:
- `apps/api/.env`;
- `apps/web/.env`;
- certificados/chaves de provedores;
- dados de `storage`.

Não use `pm2 restart ... --update-env` a partir de um shell contaminado por variáveis de outro serviço.

## 3. Dependências e build da API

No repositório completo, mantenha o lockfile existente do projeto e instale conforme a estratégia já usada em produção. Depois:

```bash
cd ~/ponto-certo/apps/api && npm run build
```

Execute os testes de hardening:

```bash
npm run test:core
```

## 4. Banco

Confira:

```bash
npm run db:status
```

Para atualização V4.1.2 -> V4.1.3, o esperado é `Migrações pendentes: 0`.

Se a `029_financial_charge_adjustments.sql` ainda estiver pendente, aplique somente após backup:

```bash
npm run db:migrate && npm run db:status
```

## 5. Restart da API

```bash
pm2 restart ponto-certo-api
pm2 status ponto-certo-api
curl -s http://127.0.0.1:3340/health
pm2 logs ponto-certo-api --lines 80 --nostream
```

## 6. Build/publicação Web

```bash
cd ~/ponto-certo/apps/web && npm run build
sudo rsync -a --delete ~/ponto-certo/apps/web/dist/ /var/www/pontoocerto/
sudo nginx -t && sudo systemctl reload nginx
```

Faça `Ctrl+Shift+R` ou limpe o Service Worker se o navegador mantiver bundle antigo.

## 7. Validação funcional mínima

1. `Assinaturas por Produto`: listar Pizzaria Movyo e demais assinaturas.
2. `Editar assinatura`: plano, valor, desconto recorrente, vencimento, e-mail, provedor e método.
3. Assinatura migrada Movyo: pró-rata retroativo deve permanecer desabilitado.
4. `Financeiro > + Nova cobrança`: opção `Mensalidade de Produto` deve aparecer.
5. Dashboard Financeiro: clientes Movyo sem `tenant_id` devem aparecer em atraso/bloqueio quando aplicável.
6. Reemissão: cobrança aberta deve permitir `Ajustar / reemitir`.
7. Não valide com valor alto; use piloto controlado.

## 8. Piloto recomendado

Fluxo final:

`criar DRAFT -> emitir -> reconciliar -> desconto pontual -> cancelar original -> reemitir -> pagar -> webhook -> liberar acesso Movyo`

Mantenha `MOVYO_SYNC_WORKER_ENABLED=0` até a conclusão do piloto controlado e não libere migração em lote antes da validação completa.
