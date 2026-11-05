# Teste do Control iD iDFace no Ponto Certo

Este roteiro valida o MVP técnico Push + Monitor com reconhecimento facial. Ele ainda não substitui a homologação jurídica/técnica necessária para comercializar o Ponto Certo como REP-P.

## 1. Atualizar o banco e iniciar o sistema

No repositório:

```powershell
npm run db:migrate --workspace apps/api
npm run dev:api
```

Em outro terminal:

```powershell
npm run dev:web
```

A migração esperada é `033_control_id_idface.sql`.

## 2. Preparar o iDFace

1. Atualize o equipamento 0M06 para o firmware V8 estável mais recente suportado pela Control iD.
2. Configure rede, DNS, gateway, NTP e fuso de Brasília.
3. Em **Configurações gerais**, ative **Modo Ponto**.
4. Deixe a personalização de tipos de batida desativada; o Ponto Certo classificará a sequência.
5. Em **Formas de identificação**, mantenha somente **Facial** habilitado.
6. Anote o número de série e o `deviceId` numérico informado pelo equipamento.

## 3. Cadastrar o equipamento

1. Entre como `TENANT_ADMIN`.
2. Abra **Cadastros → Equipamentos Control iD**.
3. Escolha a empresa.
4. Informe nome/local, número de série e `deviceId`.
5. Crie o equipamento e copie imediatamente a URL secreta e o caminho do Monitor. Eles são mostrados uma única vez.

## 4. Configurar Push e Monitor

Considere `https://api.exemplo.com` como a URL pública da API.

### Push personalizado — painel sem Bearer Token

- endereço do servidor: copie exatamente a URL secreta mostrada pelo Ponto Certo, no formato `https://api.exemplo.com/control-id/device/<credencial>`;
- período: `5` segundos;
- o equipamento acrescentará `/push` e `/result` automaticamente;
- habilite validação TLS e pinning do certificado quando disponíveis;
- trate a URL inteira como segredo: não compartilhe, não fotografe e não registre em logs.

O equipamento acrescentará `deviceId` e `uuid` às chamadas Push.

Firmwares que oferecem Bearer Token podem continuar usando os endpoints nativos `GET /push` e `POST /result` com `Authorization: Bearer <credencial>`.

### Monitor

- hostname: host público da API, sem protocolo;
- porta: porta HTTPS;
- path: copie o caminho secreto mostrado pelo Ponto Certo, no formato `control-id/device/<credencial>/monitor` (inclua o prefixo público da API, como `api/`, quando exibido);
- período de presença: `30000` ms.

O equipamento acrescentará `/dao` e `/device_is_alive` ao caminho configurado.

Se houver Nginx, instale o bloco de `deploy/nginx/ponto-certo-control-id-secret.conf.example` antes do `location /api/` genérico. Ele desativa o access log somente para as URLs secretas e mantém o restante do tráfego registrado. O deploy interrompe se essa proteção estiver ausente. Em outro proxy, aplique proteção equivalente.

## 5. Sincronizar um funcionário

1. Cadastre um funcionário ativo na mesma empresa.
2. Cadastre uma foto frontal nítida na tela de funcionários.
3. Volte a **Equipamentos Control iD** e clique em **Sincronizar funcionários**.
4. Aguarde o iDFace consultar `/push` e enviar o resultado para `/result`.
5. O contador deve passar de pendente para sincronizado.

Salvar uma foto nova também cria uma nova sincronização. Remover a foto ou desativar o funcionário enfileira a remoção no terminal.

## 6. Realizar a primeira batida

1. Posicione o funcionário sincronizado diante do iDFace.
2. Confirme a mensagem de identificação autorizada.
3. Na tela do equipamento, verifique que a comunicação do Monitor foi concluída.
4. No Ponto Certo, abra **Marcações**.
5. Confirme uma nova entrada com origem `CONTROL_ID` e o horário original do equipamento.

Uma repetição do mesmo `access_log.id` não deve criar outra marcação. A sequência do dia é classificada como entrada, saída para intervalo, retorno, saída e, a partir da quinta marcação, `OTHER` para revisão.

## Diagnóstico rápido

- **401:** URL secreta incompleta, credencial rotacionada ou, no modo alternativo, Bearer ausente/incorreto.
- **403:** `deviceId` enviado não coincide com o cadastrado.
- **Pendente:** o equipamento ainda não consultou o Push ou não devolveu `/result`.
- **Erro de foto:** cadastre uma foto mais frontal/nítida e sincronize novamente.
- **Quarentena:** usuário externo desconhecido, cadastro removido ou evento recebido fora de ordem.
- **Sem eventos:** confira se o caminho secreto completo do Monitor foi copiado; no modo alternativo por Bearer, confirme também o header `Authorization`.

## Simular o Push sem o equipamento

Use apenas em homologação, substituindo os valores:

```powershell
$apiUrl = "https://api.exemplo.com"
$deviceId = "478435"
$terminalToken = "COLE_A_CREDENCIAL"
$headers = @{ Authorization = "Bearer $terminalToken" }
Invoke-RestMethod -Method Get -Uri "$apiUrl/push?deviceId=$deviceId&uuid=teste-001" -Headers $headers
```

O retorno vazio significa fila vazia. Um JSON com `endpoint`, `body` e `contentType` é o comando que o iDFace executaria.
