# Ponto Certo v0.4.4 — Foto obrigatória antes do ponto

A marcação segura do aplicativo agora exige uma foto frontal antes de qualquer registro de ponto.

## Fluxo

1. Funcionário toca em `Registrar entrada/saída`.
2. O app abre a câmera frontal.
3. Funcionário tira a foto.
4. O app mostra uma prévia.
5. Funcionário escolhe:
   - `Tirar outra`; ou
   - `Confirmar e registrar ponto`.
6. Somente depois da confirmação o app valida GPS, jornada, aparelho e biometria.
7. A API grava o ponto e a foto na mesma operação.

Se a foto não estiver presente, a API responde `SELFIE_REQUIRED` e não grava a marcação.

## Evidência

As fotos são armazenadas fora da pasta pública da aplicação e registradas na tabela:

`time_entry_selfies`

O painel da empresa mostra o botão:

`📷 Ver foto`

A imagem é entregue por uma rota autenticada e isolada pelo `tenant_id`.

## Atualização

Preserve `apps/api/.env` e execute:

```powershell
npm install
npm run db:init
```

A migration nova é:

`007_time_entry_selfies.sql`

## Mobile

A v0.4.4 adiciona `expo-camera`.

Como existe um novo módulo nativo/permissão de câmera, para Development Build rode novamente:

```powershell
cd apps\mobile
npx expo install --fix
npx eas-cli@latest build --profile development --platform android
```

ou iOS:

```powershell
npx eas-cli@latest build --profile development --platform ios
```
