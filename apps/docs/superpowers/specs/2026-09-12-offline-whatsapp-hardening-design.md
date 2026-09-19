# Offline Punch and WhatsApp Hardening Design

## Goal

Corrigir os bugs críticos do Ponto Certo sem alterar o comportamento já aprovado dos lembretes de 5 minutos.

## Offline punch availability

- O fluxo offline só deve ser oferecido quando o dispositivo estiver realmente sem conectividade.
- Quando houver internet, o usuário usa o fluxo remoto/online normal; a UI não deve apresentar a ação como offline.
- A autorização offline continua dependente de política previamente sincronizada e ainda válida.

## Punch sequence integrity

- Uma jornada aceita no máximo um CLOCK_IN, um BREAK_OUT, um BREAK_IN e um CLOCK_OUT para a mesma data lógica de trabalho.
- A fila local deve bloquear duplicatas semânticas por `employee + work date + punch type`, não apenas por UUID/requestKey.
- O servidor é a autoridade final e deve rejeitar uma segunda marcação do mesmo tipo para a mesma data lógica, inclusive durante sincronização offline.
- Jornadas que atravessam meia-noite continuam vinculadas à data lógica da marcação de abertura mais recente.
- Idempotência por requestKey continua existindo: reenviar a mesma tentativa retorna o mesmo comprovante sem novo registro.

## Offline selfie UX

- Antes de salvar uma marcação offline, a câmera frontal deve ficar visível.
- O usuário captura a selfie e vê a prévia.
- O usuário escolhe `Confirmar` ou `Refazer foto`.
- Nenhuma marcação entra na fila antes da confirmação explícita da prévia.

## WhatsApp state machine

- Estados claros: DISCONNECTED, CONNECTING, QR, CONNECTED, RECONNECTING, LOGGED_OUT, AUTH_ERROR, ERROR.
- `Desconectar WhatsApp` só fica habilitado quando houver sessão conectada/conectando/QR/reconectando ou credenciais persistidas ativas.
- `Conectar WhatsApp` fica desabilitado enquanto já houver conexão em andamento ou sessão conectada.
- Após leitura do QR, a persistência de credenciais deve ser aguardada e a conexão deve progredir para CONNECTED; falhas devem expor estado de erro/reconexão em vez de permanecer girando indefinidamente.
- Logout limpa credenciais persistidas e estado de sessão.
- Reinício do worker deve restaurar sessão persistida quando possível.

## Regression protection

- Preservar os lembretes de 5 minutos antes das marcações.
- Adicionar testes unitários/API para duplicidade offline, sequência, idempotência e estados WhatsApp.
- Rodar build/check/tests disponíveis no ambiente.
