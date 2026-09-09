# Changelog

## v0.4.0

- Removida dependência do AWS Rekognition.
- Adicionado `expo-local-authentication` e `expo-secure-store`.
- Aparelho vinculado ao funcionário com segredo aleatório; a API guarda somente SHA-256.
- Segredo local protegido por autenticação biométrica nativa.
- Padrão de 1 aparelho ativo por funcionário.
- RH pode revogar aparelho e exigir novo vínculo.
- GPS de alta precisão e geofence continuam obrigatórios/configuráveis.
- Validação de janela da jornada adicionada à API.
- API determina a próxima marcação conforme a jornada: 2 batidas ou 4 batidas.
- Ponto pode ser bloqueado em folga ou fora da janela autorizada.
- Horário oficial continua vindo do servidor/MySQL.
- Painel Web mostra evidências de jornada, GPS e aparelho/biometria.
- Novas migrations `004_device_biometric.sql` e `005_schedule_guard.sql`.

## v0.3.0

- Geofence e Mapbox.
- Reconhecimento facial AWS, agora legado e desativado pela v0.4.
