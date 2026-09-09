# Atualização v0.3 → v0.4

Preserve `apps/api/.env`, substitua os arquivos pelo pacote v0.4 e remova as variáveis de AWS/Rekognition do `.env`.

Mantenha `MAPBOX_ACCESS_TOKEN` apenas se quiser geocodificação automática do endereço.

Na raiz:

```powershell
npm install
npm run db:init
npm run dev:api
```

Em outro terminal:

```powershell
npm run dev:web
```

No mobile:

```powershell
cd apps\mobile
npx expo install --fix
npx expo-doctor@latest
```

As migrations `004_device_biometric.sql` e `005_schedule_guard.sql` preservam os registros de ponto existentes.

Depois da atualização, cada funcionário deve abrir **Perfil → Vincular este aparelho**.
