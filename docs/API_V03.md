# API v0.3 — endpoints de segurança

## Empresa / Mapbox

### POST `/companies/geocode`

Converte endereço em latitude/longitude usando Mapbox v6 com persistência autorizada.

Exemplo:

```json
{
  "zipCode": "50000-000",
  "street": "Av. Exemplo",
  "number": "123",
  "district": "Centro",
  "city": "Recife",
  "state": "PE",
  "country": "BR"
}
```

Resposta:

```json
{
  "latitude": -8.0476,
  "longitude": -34.877,
  "formattedAddress": "...",
  "mapboxPlaceId": "..."
}
```

## Biometria

### GET `/face/my/status`

Retorna se a empresa exige biometria e se o funcionário já cadastrou o rosto.

### POST `/face/my/enroll`

`multipart/form-data`

Campo:

```text
faceImage=<JPG/PNG>
```

A foto é processada em memória e enviada ao provider facial; o Ponto Certo não persiste a imagem no MySQL.

### DELETE `/face/employee/:id`

Revoga a biometria. Perfis permitidos: SUPER_ADMIN, TENANT_ADMIN e RH.

## Ponto seguro

### POST `/time-entries/secure`

Somente usuário com perfil `FUNCIONARIO`.

`multipart/form-data`:

```text
type=CLOCK_IN
latitude=-8.0476
longitude=-34.877
accuracy=12.4
locationMocked=false
deviceId=Samsung | SM-XXXX | Android | 16
faceImage=<selfie.jpg>
```

A API executa:

1. valida funcionário/tenant;
2. valida GPS simulado;
3. valida precisão;
4. calcula distância;
5. valida raio;
6. verifica biometria facial;
7. grava o ponto com horário do servidor;
8. grava evidências de geofence e face.

Possíveis códigos de bloqueio:

- `GEOFENCE_BLOCKED`
- `FACE_NOT_ENROLLED`
- `FACE_IMAGE_REQUIRED`
- `FACE_MISMATCH`
- `FACE_PROVIDER_ERROR`
- `SECURE_PUNCH_REQUIRED`
