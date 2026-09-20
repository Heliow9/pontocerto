# Segurança de ponto — v0.3

## Decisões feitas no backend

O app nunca envia `insideRadius=true` nem `faceVerified=true` como prova. Ele envia somente evidências brutas:

- latitude;
- longitude;
- precisão;
- indicação `mocked` quando fornecida pelo SO;
- selfie atual;
- dados descritivos do aparelho.

A API decide se o ponto pode ou não ser gravado.

## Geofence

A API usa Haversine para calcular a distância entre a posição do aparelho e os locais autorizados.

Prioridade:

1. locais específicos vinculados ao funcionário;
2. caso não existam, endereço padrão da empresa.

A empresa define:

- `punch_radius_meters` — padrão 1000;
- `require_location`;
- `block_outside_radius`;
- `max_gps_accuracy_meters` — padrão 100.

## Reconhecimento facial

Provider inicial: `AWS_REKOGNITION`.

- uma collection por tenant;
- `ExternalImageId` inclui tenant e employee;
- busca facial filtra especificamente o funcionário autenticado;
- threshold padrão 90%;
- imagem não é gravada no MySQL.

Tabelas:

- `employee_face_profiles`
- `time_entry_face_checks`
- `punch_attempts`

## Limitação: liveness

Reconhecimento facial e prova de vida são controles diferentes.

A v0.3 não afirma que uma selfie isolada prova presença física. Para ambiente com risco elevado de fraude por foto/tela/replay, acrescente Face Liveness ou tecnologia equivalente.

## LGPD

Biometria exige governança reforçada. Antes da produção, documente base legal/finalidade, retenção, controle de acesso, revogação, resposta a incidentes e políticas de tratamento aplicáveis à operação.
