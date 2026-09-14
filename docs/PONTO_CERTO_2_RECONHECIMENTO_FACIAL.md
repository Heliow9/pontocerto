# Ponto Certo 2.0 — Reconhecimento Facial com Amazon Rekognition

## Visão geral

O Ponto Certo 2.0 adiciona identificação facial à selfie que já faz parte do registro de ponto. Quando a empresa habilita **Exigir reconhecimento facial da selfie**, a API só cria a marcação depois que o Amazon Rekognition confirma que o rosto pertence ao funcionário autenticado.

O fluxo combina os controles já existentes — conta individual, jornada, GPS/geofence, aparelho vinculado e biometria nativa quando exigida — com uma validação de identidade facial no servidor.

## O que foi implementado

- Cadastro facial no ato de criar o funcionário ou posteriormente em **Editar funcionário**.
- Duas formas de cadastro: **Tirar foto pela câmera** ou **Selecionar imagem JPG/PNG**.
- Pré-visualização antes de enviar o rosto.
- Atualização e remoção do cadastro facial por RH/Admin.
- Status `Cadastrado`, `Pendente` ou `Dispensado` na lista de funcionários.
- Política por empresa: **Exigir reconhecimento facial da selfie (AWS Rekognition)**.
- Reconhecimento da selfie no ponto normal (`/time-entries/secure`).
- Reconhecimento na sincronização do ponto remoto/offline (`/remote-punch`).
- Bloqueio do endpoint legado quando o funcionário está sujeito à política facial.
- Auditoria de cadastro/revogação e evidência de similaridade nas marcações aprovadas.
- Mensagens distintas para rosto não cadastrado, não reconhecido e rosto de outra pessoa.

## Arquitetura

Cada tenant possui uma collection no Rekognition:

```text
ponto-certo-tenant-<tenantId>
```

Cada funcionário recebe um identificador externo determinístico:

```text
tenant-<tenantId>-employee-<employeeId>
```

No cadastro, a API executa `DetectFaces`, exige exatamente um rosto e depois usa `IndexFaces`. O Ponto Certo guarda no MySQL apenas o `FaceId`, collection, identificador externo, status e datas. A foto usada somente para cadastrar o rosto não é salva pelo Ponto Certo.

No ponto, a selfie já capturada pelo aplicativo é enviada ao servidor e usada em `SearchFacesByImage`. A marcação é aceita apenas quando o resultado acima do limite configurado pertence ao `ExternalImageId` do funcionário logado.

> O Amazon Rekognition armazena vetores de características faciais na collection, e não a imagem original indexada. As selfies das marcações continuam seguindo a política de evidência que o Ponto Certo já utilizava antes desta versão.

## Integração AWS usada nesta entrega

A API chama as operações oficiais do Amazon Rekognition por HTTPS e assina cada requisição no backend com **AWS Signature Version 4 (SigV4)** usando recursos nativos do Node.js 22. Isso evita colocar chaves no frontend e também evita alterar o lockfile com uma nova dependência npm.

As operações são as mesmas disponibilizadas pelo SDK oficial:

- `CreateCollection`
- `DetectFaces`
- `IndexFaces`
- `SearchFacesByImage`
- `DeleteFaces`

Nenhuma Access Key ou Secret Access Key é enviada ao navegador/PWA/Android.

## Região AWS

O Amazon Rekognition Image está disponível em **South America (São Paulo) — `sa-east-1`**. Para uma operação brasileira, esta região é uma boa escolha por proximidade e residência operacional, desde que seja compatível com a estratégia da sua conta AWS.

## Variáveis no servidor

Edite apenas o arquivo real `apps/api/.env` do servidor. Não coloque credenciais no GitHub.

```env
FACE_PROVIDER=AWS_REKOGNITION
FACE_MAX_IMAGE_MB=6
FACE_MATCH_THRESHOLD=90

AWS_REGION=sa-east-1
AWS_ACCESS_KEY_ID=SUA_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=SUA_SECRET_ACCESS_KEY
# Somente para credenciais temporárias/STSes:
AWS_SESSION_TOKEN=
```

O limite padrão é **90%**. Ele pode ser ajustado entre 70 e 100 pela variável `FACE_MATCH_THRESHOLD`. Para controle de ponto, recomenda-se iniciar em 90 e avaliar falsos negativos em condições reais de iluminação antes de reduzir.

## Política IAM recomendada

Use um usuário/role próprio da aplicação. Não use credenciais de root.

Substitua `SEU_ACCOUNT_ID` pelo ID da conta AWS e, se escolher outra região, substitua `sa-east-1`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CreateAndDetect",
      "Effect": "Allow",
      "Action": [
        "rekognition:CreateCollection",
        "rekognition:DetectFaces"
      ],
      "Resource": "*"
    },
    {
      "Sid": "PontoCertoFaceCollections",
      "Effect": "Allow",
      "Action": [
        "rekognition:IndexFaces",
        "rekognition:SearchFacesByImage",
        "rekognition:DeleteFaces"
      ],
      "Resource": "arn:aws:rekognition:sa-east-1:SEU_ACCOUNT_ID:collection/ponto-certo-tenant-*"
    }
  ]
}
```

`CreateCollection` e operações sem suporte a recurso específico precisam de `Resource: "*"`. As operações direcionadas à collection ficam limitadas às collections do Ponto Certo.

## Ativação no Ponto Certo

1. Configure as variáveis AWS no `.env` da API.
2. Reinicie/rebuild a API.
3. Entre em **Empresas → Editar**.
4. Marque **Exigir reconhecimento facial da selfie (AWS Rekognition)**.
5. Salve a empresa.
6. Entre em **Funcionários → Editar**.
7. Em **Reconhecimento facial**, tire uma foto ou selecione uma imagem.
8. Confirme **Cadastrar rosto**.
9. O funcionário já pode registrar o ponto com validação facial.

Para novos funcionários, a foto pode ser preparada ainda no formulário de cadastro. O sistema cria o funcionário e, em seguida, cadastra o rosto automaticamente.

## Cadastro de uma boa foto

- apenas uma pessoa na imagem;
- rosto frontal e totalmente visível;
- iluminação uniforme;
- sem foto muito distante;
- evitar óculos escuros, capacete ou objetos cobrindo o rosto;
- JPG ou PNG.

Se nenhuma face ou mais de uma face for encontrada, o cadastro é rejeitado com orientação para refazer a foto.

## Comportamento no registro de ponto

### Rosto correto

1. Funcionário captura a selfie.
2. Servidor valida jornada, GPS/geofence e aparelho.
3. Servidor consulta o Rekognition.
4. O rosto corresponde ao funcionário logado acima do threshold.
5. O ponto é gravado.
6. A evidência registra `face_verified`, similaridade, provider e threshold utilizado.

### Rosto de outra pessoa

A API retorna:

```text
O rosto capturado não corresponde ao usuário logado. Tente novamente com o seu próprio rosto.
```

Código: `FACE_MISMATCH`.

O ponto **não é gravado**.

### Rosto não reconhecido

A API retorna:

```text
Rosto não reconhecido. Posicione o rosto de frente, com boa iluminação, e tente novamente.
```

Código: `FACE_NOT_RECOGNIZED`.

O ponto **não é gravado**.

### Funcionário sem rosto cadastrado

Código: `FACE_NOT_ENROLLED`. O sistema orienta o funcionário a procurar o RH.

### AWS indisponível ou mal configurada

Quando a empresa exige reconhecimento facial, a API trabalha em modo **fail closed**: se não for possível confirmar a identidade, a marcação não é criada.

## Ponto offline

Em modo offline o aparelho não consegue falar com o Rekognition no instante da captura. Portanto:

- a selfie e o horário permanecem na fila local;
- quando houver conexão, o servidor executa a validação facial;
- somente uma marcação aprovada vira `time_entries`;
- mismatch fica como tentativa rejeitada e o funcionário recebe a mensagem correspondente.

## Dispensa individual de biometria

A opção já existente **Desabilitar biometria para este funcionário** também dispensa reconhecimento facial. GPS, geofence, jornada e demais políticas continuam funcionando normalmente.

Isso preserva a regra atual do Ponto Certo para casos excepcionais definidos pelo RH.

## Banco de dados e auditoria

A solução reaproveita a estrutura já existente:

- `employee_face_profiles`
- `time_entry_face_checks`
- `time_entries.face_verified`
- `time_entries.face_similarity`
- `time_entries.face_provider`
- `punch_attempts.face_decision`
- `punch_attempts.face_similarity`
- `company_profiles.require_face_recognition`

O cadastro e a revogação também entram no audit log como `FACE_ENROLL` e `FACE_REVOKE`.

## Deploy no servidor

A partir da raiz do projeto:

```bash
npm ci --include=dev
npm run db:migrate --workspace apps/api
npm run build --workspace apps/api
npm run build --workspace apps/web
npm run check --workspace apps/mobile
```

Ou utilize o fluxo que o projeto já possui:

```bash
bash scripts/rebuild-server.sh
```

Depois reinicie a aplicação no PM2 conforme o procedimento atual do servidor.

## Teste operacional recomendado

Faça primeiro com uma empresa de teste:

1. Ative reconhecimento facial.
2. Cadastre o rosto de um funcionário.
3. Bata o ponto com o próprio rosto — deve aprovar.
4. Tente com outra pessoa — deve retornar `FACE_MISMATCH` ou `FACE_NOT_RECOGNIZED` e não criar ponto.
5. Remova o cadastro facial — deve retornar `FACE_NOT_ENROLLED` ao tentar bater.
6. Cadastre novamente e teste PWA e Android.
7. Teste uma marcação offline e sincronize posteriormente.

## Segurança, LGPD e operação

Biometria facial é dado pessoal sensível. A empresa deve manter base legal, transparência, controles de acesso, retenção e procedimento para atendimento dos direitos do titular compatíveis com sua operação e com a LGPD.

Somente RH/Admin pode cadastrar ou substituir o vínculo facial nesta versão. O funcionário não pode trocar o próprio rosto autenticando-se na conta.

As chaves AWS devem permanecer apenas no servidor, com privilégio mínimo e rotação periódica.

## Limitação desta versão

Esta entrega faz **reconhecimento/identificação facial**, não prova de vida. Uma etapa futura pode adicionar **Amazon Rekognition Face Liveness** para elevar a resistência contra apresentação de foto, vídeo ou tela diante da câmera.
