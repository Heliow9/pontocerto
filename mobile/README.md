# Ponto Certo Mobile v0.4.1

Correção específica para biometria iOS / `missing_usage_description`.

## O que foi corrigido

- `NSFaceIDUsageDescription` definido diretamente em `ios.infoPlist`.
- Config plugin do `expo-local-authentication` configurado.
- Config plugin do `expo-secure-store` configurado, pois `requireAuthentication: true` também precisa da permissão Face ID no iOS.
- `expo-dev-client` incluído.
- `eas.json` incluído com perfil `development`.
- O aplicativo detecta quando está rodando no **Expo Go no iPhone** e não tenta vincular a biometria, evitando o erro `missing_usage_description`.
- Mensagens de erro biométrico mais claras.

## Muito importante no iPhone

Alterar `app.json` não modifica o aplicativo Expo Go instalado no iPhone. O Face ID e o SecureStore com `requireAuthentication` precisam de um **novo binário nativo** do Ponto Certo.

### Primeira vez

```powershell
cd apps\mobile
npm install
npx expo install --fix
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --profile development --platform ios
```

Instale no iPhone o Development Build disponibilizado pelo EAS.

Depois, para desenvolver:

```powershell
npm start
```

Abra o projeto pelo **Ponto Certo Development Build**, não pelo Expo Go.

## Android

O mesmo Development Build pode ser criado com:

```powershell
npx eas-cli@latest build --profile development --platform android
```

## Permissões iOS configuradas

```text
NSFaceIDUsageDescription
NSLocationWhenInUseUsageDescription
```

O projeto mantém `expo-local-authentication` + `expo-secure-store` com credencial protegida por biometria.
