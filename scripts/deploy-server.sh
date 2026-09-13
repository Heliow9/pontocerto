#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
sudo nginx -t
PWA_DOMAIN="${PWA_DOMAIN:-hubpontocerto.duckdns.org}"
PWA_ROOT="$(sudo nginx -T 2>/dev/null | node scripts/nginx-pwa-root.mjs "$PWA_DOMAIN")"
WEB_ROOT="${WEB_ROOT:-/var/www/pontoocerto}"
test -f "$WEB_ROOT/index.html" || { echo "Confira a pasta do painel web: $WEB_ROOT"; exit 1; }
test "$(realpath "$PWA_ROOT")" != "$(realpath "$WEB_ROOT")" || { echo "Painel e PWA devem ter pastas distintas."; exit 1; }
printf 'PWA encontrado: %s\n' "$PWA_ROOT"
BACKUP_DIR="$(pwd)/.deploy-backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
sudo tar -czf "$BACKUP_DIR/pwa.tgz" -C "$PWA_ROOT" .
sudo tar -czf "$BACKUP_DIR/web.tgz" -C "$WEB_ROOT" .
bash scripts/rebuild-server.sh
if [ "$(realpath apps/mobile/dist)" != "$(realpath "$PWA_ROOT")" ]; then sudo cp -a apps/mobile/dist/. "$PWA_ROOT/"; fi
if [ "$(realpath apps/web/dist)" != "$(realpath "$WEB_ROOT")" ]; then sudo cp -a apps/web/dist/. "$WEB_ROOT/"; fi
sudo nginx -t
sudo systemctl reload nginx
pm2 logs ponto-certo-api --lines 30 --nostream
printf '\nPublicado. Abra https://%s/ e aceite Atualizar aplicativo.\n' "$PWA_DOMAIN"
printf 'No painel web, aceite Atualizar painel quando o aviso aparecer. Backup: %s\n' "$BACKUP_DIR"
