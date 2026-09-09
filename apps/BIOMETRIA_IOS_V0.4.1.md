# Correção missing_usage_description — v0.4.1

O erro não era apenas o texto do `app.json`: no iPhone, o **Expo Go** usa o próprio `Info.plist`, que não recebe as permissões definidas pelo projeto. Além disso, o Ponto Certo usa `expo-secure-store` com `requireAuthentication: true`, que também necessita de `NSFaceIDUsageDescription` em um build nativo.

A v0.4.1 possui as permissões tanto nos config plugins quanto diretamente no `ios.infoPlist`, e inclui Development Build via EAS.

### Comando principal

```powershell
cd apps\mobile
npx eas-cli@latest build --profile development --platform ios
```

Instale esse build no iPhone. Não use o Expo Go para testar Face ID.
