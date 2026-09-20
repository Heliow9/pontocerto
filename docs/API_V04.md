# API v0.4 — segurança do ponto

## Dispositivo

### GET `/devices/my/status`
Retorna política da empresa e informa se o aparelho atual está vinculado.

### POST `/devices/my/register`
Cria um vínculo de aparelho para o funcionário autenticado e retorna `deviceUid` + `deviceSecret` uma única vez.

A API salva somente o hash SHA-256 do segredo.

### DELETE `/devices/employee/:employeeId`
RH/Admin revoga os aparelhos ativos do funcionário.

## Jornada

### GET `/time-entries/my/context`
Retorna a jornada aplicável, janela permitida, próxima marcação esperada e se a jornada já foi concluída.

A API suporta automaticamente:

- jornada com 2 batidas: `CLOCK_IN → CLOCK_OUT`;
- jornada com 4 batidas: `CLOCK_IN → BREAK_OUT → BREAK_IN → CLOCK_OUT`.

## Ponto seguro

### POST `/time-entries/secure`

Payload:

```json
{
  "type": "CLOCK_IN",
  "latitude": -8.0476,
  "longitude": -34.8770,
  "accuracy": 18,
  "locationMocked": false,
  "deviceUid": "...",
  "deviceSecret": "...",
  "biometricType": "DEVICE_BIOMETRIC"
}
```

O `type` enviado pelo app é apenas compatibilidade. Quando existe jornada válida, a API calcula o tipo correto no servidor.

Validações:

1. janela da jornada;
2. GPS/precisão/localização simulada;
3. raio permitido;
4. aparelho vinculado;
5. segredo do aparelho;
6. gravação com horário oficial do servidor.

Possíveis códigos de bloqueio incluem `SCHEDULE_BLOCKED`, `SCHEDULE_COMPLETE`, `GEOFENCE_BLOCKED` e códigos `DEVICE_*`.
