# Atualização v0.1 → v0.4

A v0.4 pode ser aplicada diretamente sobre a v0.1 porque o `db:init` controla as migrations em `schema_migrations`.

Preserve seu `apps/api/.env`, copie os arquivos da v0.4 e execute:

```powershell
npm install
npm run db:init
```

Depois:

```powershell
npm run dev:api
npm run dev:web
```

Para o aplicativo, configure `apps/mobile/.env` com o endereço da API acessível pelo celular e execute `npm run dev:mobile`.
