# GPS / Geofence v0.4.3

A diferença de centenas de metros normalmente não vem do cálculo de distância. Ela vem da coordenada de referência salva no banco.

O Ponto Certo agora oferece:

- `Empresas > Editar > Usar localização atual exata`
- `App > Perfil > DIAGNOSTICAR GPS E RAIO`

## Prioridade da referência

1. Se o funcionário possuir um **Local de trabalho** vinculado, esse local é usado.
2. Se não possuir, é usado o **Endereço padrão da empresa**.

Por isso, o diagnóstico mostra o nome e a origem da referência usada.

## Recalibrar

Estando fisicamente na empresa:

1. abra o dashboard em um aparelho/navegador com GPS;
2. edite a empresa;
3. clique em `Usar localização atual exata`;
4. confira a latitude/longitude;
5. clique em `Salvar empresa`;
6. no app do funcionário execute `DIAGNOSTICAR GPS E RAIO`.

A geocodificação do Mapbox continua disponível para preencher rapidamente o endereço, mas as coordenadas de GPS capturadas no próprio local são preferíveis para o geofence.
