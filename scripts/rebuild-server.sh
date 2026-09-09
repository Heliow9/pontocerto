#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<22||(major===22&&minor<13))throw new Error("Use Node.js 22.13 ou superior")'
npm ci --include=dev
npm run build --workspace apps/api
npm run build --workspace apps/web
npm run build:web --workspace apps/mobile
npm run db:migrate --workspace apps/api
pm2 restart ponto-certo-api --update-env
pm2 status ponto-certo-api
printf '\nBuilds concluídos: apps/api/dist, apps/web/dist e apps/mobile/dist.\n'
printf 'Confira se o servidor HTTP aponta para estas pastas estáticas.\n'
