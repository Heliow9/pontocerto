# Rebuild no servidor Ubuntu / Lightsail

O processo da API informado é `ponto-certo-api`. Execute no servidor, com o mesmo usuário que administra esse processo no PM2. Estes comandos não reiniciam os demais serviços.

## Atualização completa

Localize o repositório com `pm2 describe ponto-certo-api` e observe `exec cwd` e `script path`. Entre na raiz do repositório (a pasta que contém `apps` e o `package.json` principal).

```bash
cd /caminho/real/do/repositorio
git pull --ff-only origin main
bash scripts/rebuild-server.sh
```

O script instala dependências, compila API e web, exporta a PWA, aplica apenas migrações pendentes e reinicia `ponto-certo-api`. Se uma etapa falhar, ele para antes de executar as seguintes. Requer Node.js 22.13+ e os `.env` já configurados. O script não modifica a configuração Nginx nem copia arquivos para outro document root.

## Comandos individuais

Sempre a partir da raiz do repositório, após `git pull --ff-only origin main`:

```bash
npm ci --include=dev

# API
npm run build --workspace apps/api
npm run db:migrate --workspace apps/api
pm2 restart ponto-certo-api --update-env
pm2 logs ponto-certo-api --lines 50 --nostream

# Painel web
npm run build --workspace apps/web

# Aplicativo mobile no navegador / PWA
npm run build:web --workspace apps/mobile
```

As ferramentas de compilação estão nas dependências de desenvolvimento, por isso `--include=dev` é necessário mesmo em um servidor com `NODE_ENV=production`. Consulte [npm ci](https://docs.npmjs.com/cli/v10/commands/npm-ci/) e o [gerenciamento de processos PM2](https://pm2.keymetrics.io/docs/usage/process-management/).

## Pastas publicadas e ambiente

- API: `apps/api/dist/server.js`; o diretório de execução deve permitir carregar `apps/api/.env` e resolver a pasta de selfies existente. Preserve a configuração PM2 que já está em uso.
- Web: `apps/web/dist`.
- PWA: `apps/mobile/dist`, incluindo `sw.js`, `manifest.webmanifest`, `icons` e `_expo`.
- API: configurações de banco/JWT/CORS em `apps/api/.env`.
- Web: `VITE_API_URL` em `apps/web/.env`.
- PWA/Android: `EXPO_PUBLIC_API_URL` em `apps/mobile/.env`.

As URLs públicas da API entram nos arquivos web durante o build. Elas devem ser acessíveis pelo navegador/celular e usar HTTPS em produção. A API deve permitir as origens web/PWA em CORS. O processo de build preserva os `.env`; eles não são enviados ao GitHub.

A configuração atual do servidor HTTP não está no repositório. Confira os blocos dos domínios do Ponto Certo com `sudo nginx -T`. Se `root` já aponta para as pastas `dist` acima, o build atualiza os arquivos servidos. Se o deploy copia arquivos para outra pasta, publique **todo o conteúdo** do `dist` correspondente nessa pasta, preservando a separação entre painel e PWA. Não misture os dois builds.

A PWA foi preparada para a raiz de um domínio/subdomínio. Para hospedá-la em subpasta, ajuste os caminhos de manifest, service worker e assets antes da publicação. O servidor deve servir `sw.js` como JavaScript e `manifest.webmanifest` como JSON/manifest, e usar fallback para `index.html` nas rotas de navegação. Não aplicar cache longo em `index.html`, manifest ou `sw.js`.

Após publicar, abra a PWA online e aceite “Atualizar aplicativo” quando aparecer. O cache contém apenas arquivos estáticos. Registrar ponto exige conexão; dados da última consulta são identificados como desatualizados quando a API não responde.

## Android nativo (separado da PWA)

```bash
cd apps/mobile
npx expo-doctor
npx eas-cli@latest build --profile preview --platform android
```

Esse comando gera APK para teste. Para o pacote de distribuição, use `--profile production`; ele gera app bundle. A autenticação no EAS e a validação de câmera, GPS e biometria em aparelho físico continuam necessárias. Exportar a PWA não atualiza o aplicativo Android instalado.

## Banco de dados

As migrações 008 e 009 acrescentam controle de repetição de tentativas e tipo da solicitação de ajuste. `db:migrate` não cria contas demo nem redefine senhas. O banco configurado no ambiente local desta alteração já recebeu ambas as migrações; em outro banco o comando aplicará as pendentes.

```bash
npm run db:status --workspace apps/api
```
