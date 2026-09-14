# Ponto Certo 2.0 — AutoPonto Facial Online

## O que foi adicionado

O AutoPonto transforma um celular, tablet ou PWA em um relógio facial compartilhado. O aparelho fica vinculado a uma empresa, mantém a câmera frontal pronta e identifica o funcionário pela AWS Rekognition Collection da empresa. Após reconhecer o rosto, o backend consulta a jornada e registra automaticamente a próxima marcação permitida.

A primeira versão do AutoPonto é **somente online**.

Cada ciclo configurado de varredura pode gerar uma chamada ao AWS Rekognition. O padrão é 3 segundos e pode ser ajustado no painel para equilibrar rapidez de identificação e volume de chamadas à AWS.

## Fluxo individual preservado

O AutoPonto não substitui o ponto individual:

- funcionário **sem foto facial cadastrada** continua no fluxo anterior, online ou offline, sem comparação facial;
- funcionário **com foto facial cadastrada** é validado pelo AWS Rekognition;
- no ponto individual offline, a selfie fica na fila e, quando a conexão voltar, só é rejeitada por reconhecimento facial se existir foto facial cadastrada e a selfie não corresponder;
- câmera, GPS, vínculo de aparelho e biometria local do ponto individual permanecem independentes do AutoPonto.

Também foi melhorado o UX da selfie individual online: a tela permanece aberta durante a validação; em caso de rosto incorreto, a imagem rejeitada é descartada e o erro aparece dentro da própria tela da câmera para permitir nova tentativa imediata.

## Fluxo AutoPonto

1. No dashboard da empresa, abra **AutoPonto**.
2. Escolha a empresa e habilite o AutoPonto.
3. Configure:
   - intervalo para escanear: 1 a 10 segundos;
   - tempo de exibição do resultado: 1 a 10 segundos;
   - proteção contra ponto duplicado (cooldown): 5 a 120 segundos.
4. Para funcionários que já possuíam foto antes desta versão, use **Sincronizar rostos cadastrados** uma vez.
5. Cadastre um terminal (por exemplo, `Portaria Obra Recife`).
6. O painel gera um código temporário de 6 dígitos, válido por 15 minutos.
7. Na tela de login do PWA/app, toque em **AutoPonto** e informe o código.
8. O aparelho passa a ficar vinculado à empresa/terminal por um token exclusivo.
9. Autorize a câmera frontal.
10. O funcionário posiciona o rosto. A captura e identificação acontecem automaticamente de acordo com o intervalo configurado.
11. Quando reconhecido, o sistema mostra nome, matrícula, tipo da marcação e horário; depois retorna automaticamente à câmera.

Funcionários sem foto facial continuam podendo usar o ponto individual, porém não podem ser identificados pelo AutoPonto porque nesse modo o rosto é a própria credencial de identificação.

## AWS Rekognition

O backend passa a utilizar, além de `DetectFaces` e `CompareFaces` do ponto individual:

- `CreateCollection`
- `IndexFaces`
- `DeleteFaces`
- `SearchFacesByImage`

Cada empresa recebe uma Collection isolada com nome determinístico no formato:

`ponto-certo-t<TENANT_ID>-c<COMPANY_ID>`

Ao salvar ou atualizar a foto facial de um funcionário, o rosto é indexado na Collection correspondente. Ao remover a foto, o perfil local é revogado e o FaceId deixa de poder autenticar no AutoPonto.

### Exemplo de política IAM funcional

Ajuste a política do usuário/role usado pela API para permitir as ações abaixo. Para produção, você pode restringir recursos/região conforme sua política de segurança da AWS.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rekognition:DetectFaces",
        "rekognition:CompareFaces",
        "rekognition:CreateCollection",
        "rekognition:IndexFaces",
        "rekognition:DeleteFaces",
        "rekognition:SearchFacesByImage"
      ],
      "Resource": "*"
    }
  ]
}
```

## Variáveis da API

As chaves AWS ficam **somente no servidor**. Nunca coloque Access Key/Secret no React, PWA ou aplicativo.

No `apps/api/.env` mantenha/configure:

```env
FACE_PROVIDER=AWS_REKOGNITION
FACE_MAX_IMAGE_MB=5
FACE_MATCH_THRESHOLD=95
AWS_REGION=us-east-1 # ou a mesma região onde você utilizar o Rekognition
AWS_ACCESS_KEY_ID=SUA_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=SUA_SECRET_ACCESS_KEY
```

O AWS SDK lê `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY` diretamente do ambiente; elas não precisam ser adicionadas ao schema público do frontend.

## Banco de dados

A migration nova é:

`apps/api/sql/020_autoponto.sql`

Ela cria:

- `autopoint_settings`
- `autopoint_terminals`
- origem `AUTO_POINT` em `time_entries.source`
- `time_entries.autopoint_terminal_id`

Após atualizar o código no servidor:

```bash
cd apps/api
npm install
npm run db:migrate
npm run build
pm2 restart all
```

Use os comandos de restart específicos do seu PM2 caso sua instalação não use `pm2 restart all`.

Depois reconstrua/publice o painel web e o PWA conforme o procedimento que você já utiliza no servidor.

## Segurança do terminal

- código de ativação expira em 15 minutos;
- código é salvo no banco somente como HMAC/hash;
- token do terminal possui 32 bytes aleatórios e é salvo no banco somente em hash;
- terminal não recebe sessão de administrador ou funcionário;
- token só acessa `/autopoint/session` e `/autopoint/punch`;
- terminal pode ser revogado pelo dashboard;
- reativação exige novo código e invalida o vínculo anterior;
- o backend mantém lock por funcionário e cooldown por terminal/funcionário para impedir duplicidade concorrente;
- a selfie usada na identificação fica vinculada à marcação como evidência, seguindo a estrutura já existente do sistema.

## Validação recomendada após deploy

1. Abra AutoPonto no dashboard e habilite uma empresa.
2. Cadastre foto facial em dois funcionários de teste.
3. Clique em **Sincronizar rostos cadastrados** e confirme que indexados = fotos.
4. Crie um terminal e ative-o no PWA.
5. Teste rosto do funcionário A e confirme nome/matrícula/marcação.
6. Teste novamente dentro do cooldown e confirme bloqueio de duplicidade.
7. Teste o funcionário B.
8. Teste uma pessoa não cadastrada e confirme `Rosto não reconhecido` sem criação de ponto.
9. Revogue o terminal pelo dashboard e confirme que o aparelho perde acesso.
10. Teste o ponto individual de um funcionário sem foto; ele deve continuar registrando normalmente.
11. Teste offline individual com funcionário com foto e sem foto para confirmar as regras opcionais de reconhecimento.

## Arquivos principais da implementação

- `api/sql/020_autoponto.sql`
- `api/src/routes/autopoint.routes.ts`
- `api/src/services/autopoint-security.service.ts`
- `api/src/services/autopoint-punch.service.ts`
- `api/src/services/face-collection.service.ts`
- `api/src/routes/face.routes.ts`
- `web/src/pages/AutoPointPage.tsx`
- `mobile/src/AutoPoint.tsx`
- `mobile/src/RemoteClock.tsx`
- `mobile/app/index.tsx`
