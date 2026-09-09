# Atualização v0.2 → v0.4

Você pode atualizar diretamente para a v0.4.

1. Preserve `apps/api/.env`.
2. Substitua os arquivos pelo pacote v0.4.
3. Não configure AWS/Rekognition: a v0.4 usa biometria nativa do aparelho.
4. Mantenha ou adicione `MAPBOX_ACCESS_TOKEN` apenas se utilizar geocodificação automática.
5. Execute:

```powershell
npm install
npm run db:init
```

Depois inicie API e Web normalmente. No app, cada funcionário deve vincular o próprio aparelho em **Perfil**.
