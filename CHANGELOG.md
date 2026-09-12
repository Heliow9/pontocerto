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

## 2026-09-12 - Correções de interface offline e WhatsApp
- O card de ponto offline não é exibido enquanto o aparelho está online (salvo status de fila pendente, sem botão de nova captura).
- A captura offline continua exigindo câmera, prévia e confirmação/refazer antes de salvar.
- No painel da empresa, `Conectar WhatsApp` só aparece quando a sessão está realmente desconectada/encerrada.
- Quando conectado, o painel mostra somente `Desconectar WhatsApp`; estados de conexão/QR/reconexão não oferecem um segundo pareamento.

## 2026-09-12 — v3 alerta de horas extras / WhatsApp
- Desacoplada a apuração dos alertas de horas extras do worker de conexão do WhatsApp.
- A apuração passa a iniciar junto com a API e roda imediatamente + a cada 60 segundos.
- Falha/indisponibilidade do Baileys não impede mais a criação de `overtime_alerts`.
- O worker do WhatsApp fica responsável somente por sessão e envio das mensagens já enfileiradas.
- Adicionado log explícito quando a apuração de horas extras falhar, facilitando diagnóstico no PM2.

## 2026-09-12 - WhatsApp delivery hardening / cálculo determinístico
- Valida o destinatário com `onWhatsApp()` antes do envio e usa o JID resolvido (inclusive LID quando retornado pelo Baileys).
- Marca número inexistente como `CANCELED / INVALID_RECIPIENT` e falha transitória de consulta como `RECIPIENT_LOOKUP_FAILED`.
- Separa aceitação (`ACCEPTED`) de entrega (`DELIVERED`) e marca `ACK_TIMEOUT` após 10 minutos sem confirmação, preservando ACK tardio.
- Corrige cálculo quando `BREAK_OUT` e `BREAK_IN` têm o mesmo timestamp, ordenando semanticamente os tipos antes do pareamento.
