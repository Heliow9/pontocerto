# Ponto Certo SaaS v0.4

SaaS multi-tenant de gestão de jornada com React, Expo/React Native, Node.js/Express e MySQL.

## Atualização de interface e PWA

Veja as [melhorias implementadas e verificações](docs/UI_UX_IMPLEMENTED.md) e o [guia de rebuild da API, web e PWA no servidor](docs/REBUILD_SERVER.md).

Para atualizar um ambiente existente, use `npm ci --include=dev` e `npm run db:migrate --workspace apps/api`. Reserve `db:init` para a inicialização com dados de demonstração.

## O que mudou na v0.4

A versão 0.4 remove a dependência de reconhecimento facial AWS e usa a biometria nativa do próprio aparelho.

O registro seguro do funcionário combina:

- login individual;
- aparelho vinculado ao funcionário;
- Face ID / Touch ID / impressão digital disponível no sistema operacional;
- credencial secreta guardada no `expo-secure-store` com autenticação;
- GPS de alta precisão;
- geofence, com raio padrão de 1.000 m;
- bloqueio de GPS simulado quando o Android sinaliza `mocked`;
- precisão máxima do GPS configurável;
- validação da jornada e da janela de horário cadastrada;
- tipo da próxima marcação determinado pela API conforme a jornada (2 ou 4 batidas);
- horário oficial gerado no servidor/MySQL;
- auditoria de tentativas bloqueadas.

## Importante sobre a biometria

A API não recebe impressão digital, Face ID ou template biométrico. O sistema operacional do celular autentica localmente e libera a credencial protegida daquele aparelho.

Isso comprova que uma biometria autorizada no aparelho liberou a credencial, mas não identifica para a API qual dedo ou rosto específico foi usado. Por isso o controle é combinado com conta individual, aparelho vinculado, GPS, geofence, jornada e horário do servidor.

Também não significa presença contínua durante todo o expediente: comprova as condições do momento de cada marcação.

## Requisitos

- Node.js 22.13+
- MySQL 5.6+
- Expo SDK 57 no app mobile

## Instalação inicial para desenvolvimento

Preserve o arquivo `apps/api/.env` se você já tem a v0.1, v0.2 ou v0.3 funcionando.

Na raiz:

```powershell
npm ci --include=dev
npm run db:init
```

O `db:init` aplica automaticamente as migrations ainda não executadas, inclusive:

- `004_device_biometric.sql`
- `005_schedule_guard.sql`

Depois:

```powershell
npm run dev:api
```

Em outro terminal:

```powershell
npm run dev:web
```

Mobile:

```powershell
cd apps\mobile
npx expo-doctor@latest
cd ..\..
npm run dev:mobile
```

As versões compartilhadas de React e dos módulos Expo estão alinhadas pelo lockfile e pelos `overrides` da raiz. Após atualizar o SDK, valide novamente com `expo-doctor` e os builds dos dois aplicativos.

## .env da API

```env
PORT=3333
NODE_ENV=development

MYSQL_HOST=ponto-certo.mysql.uhserver.com
MYSQL_PORT=3306
MYSQL_DATABASE=ponto_certo
MYSQL_USER=pontocerto_admi
MYSQL_PASSWORD=SUA_SENHA

JWT_SECRET=troque-por-uma-chave-longa-e-segura
JWT_EXPIRES_IN=8h
CORS_ORIGINS=http://localhost:5173,http://localhost:8081

# Opcional para geocodificar o endereço automaticamente
MAPBOX_ACCESS_TOKEN=
```

Nenhuma variável AWS é necessária.

## Configuração recomendada da empresa

No painel Web → Empresas:

- cadastrar endereço e coordenadas;
- raio permitido: `1000 m`;
- exigir GPS;
- bloquear fora do raio;
- precisão máxima GPS: `100 m`;
- exigir biometria nativa;
- exigir aparelho vinculado;
- máximo de aparelhos por funcionário: `1`;
- bloquear fora da janela da jornada;
- configurar margem antes/depois da jornada conforme a operação.

## Primeiro acesso do funcionário

No aplicativo:

1. Entrar com a conta do funcionário.
2. Abrir **Perfil**.
3. Tocar em **Vincular este aparelho**.
4. Confirmar a biometria nativa.
5. Voltar para **Ponto**.

A partir daí a batida segura é validada integralmente pela API.

## Contas demo

- Admin empresa: `admin@pontocerto.local` / `Admin@123`
- Funcionário: `funcionario@pontocerto.local` / `Admin@123`
- Admin SaaS: `saas@pontocerto.local` / `Admin@123`

Troque as senhas em produção.
