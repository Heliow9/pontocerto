# Segurança v0.4

## Biometria nativa

A biometria é executada pelo sistema operacional. O backend não recebe impressão digital, Face ID ou template biométrico.

O aplicativo guarda uma credencial de dispositivo no SecureStore com autenticação requerida. O servidor guarda apenas o SHA-256 dessa credencial.

## Vínculo do aparelho

Por padrão cada funcionário pode ter somente um aparelho ativo. O RH pode revogar o vínculo em caso de troca, perda ou suspeita.

## Geofence

O app captura GPS de alta precisão e a API calcula a distância até o local autorizado. O padrão é 1.000 metros, configurável por empresa ou por local de trabalho.

## Jornada

O relógio do aparelho não determina o horário oficial. A API usa o horário do servidor/MySQL e compara a marcação com a jornada vinculada ao funcionário.

A empresa pode bloquear marcações fora da janela da jornada e configurar margens antes e depois do expediente.

## Limite do controle

Esses controles comprovam as condições existentes no momento da marcação. Eles não comprovam que o funcionário permaneceu fisicamente no local durante todo o período entre duas batidas.
