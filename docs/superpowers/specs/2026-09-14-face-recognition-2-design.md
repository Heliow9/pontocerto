# Ponto Certo 2.0 — Reconhecimento Facial AWS Rekognition

## Objetivo

Adicionar reconhecimento facial ao Ponto Certo usando AWS Rekognition sem expor credenciais AWS ao navegador ou aplicativo. O cadastro facial é administrado pela empresa/RH; o funcionário continua capturando a selfie já existente no fluxo de ponto, e a API só grava a marcação quando a identidade facial for aprovada pela política da empresa.

## Arquitetura

- Uma collection AWS Rekognition por tenant: `ponto-certo-tenant-<tenantId>`.
- Um `ExternalImageId` determinístico por funcionário: `tenant-<tenantId>-employee-<employeeId>`.
- O cadastro facial aceita JPG/PNG, valida que exista exatamente um rosto e indexa esse rosto na collection.
- O MySQL armazena apenas metadados do perfil facial (`FaceId`, collection, status e datas). A imagem original usada para cadastro não é persistida pelo Ponto Certo.
- O ponto usa a selfie já capturada. Quando reconhecimento facial é obrigatório, a API consulta `SearchFacesByImage` e aceita somente uma correspondência cujo `ExternalImageId` pertença ao funcionário autenticado e cuja similaridade seja igual ou superior ao threshold configurado.
- Credenciais AWS existem somente na API via variáveis de ambiente.

## Política

- `company_profiles.require_face_recognition` volta a ser editável no cadastro da empresa.
- `employees.biometric_exempt=1` dispensa biometria nativa e reconhecimento facial para preservar a semântica existente de dispensa individual.
- Empresa com reconhecimento facial ativo + funcionário não dispensado exige perfil facial `ENROLLED` antes de permitir ponto.
- Se o Rekognition estiver indisponível quando a política exigir reconhecimento, o ponto não é gravado; a API retorna erro recuperável.
- Ponto remoto/offline é validado facialmente na sincronização. Uma captura rejeitada permanece como tentativa rejeitada no cliente, sem virar `time_entries`.

## Cadastro facial

No painel `Funcionários`, ao editar um funcionário salvo:

1. Mostrar status facial: cadastrado, pendente, revogado ou provedor indisponível.
2. Oferecer `Tirar foto` usando `getUserMedia` no navegador e câmera frontal quando disponível.
3. Oferecer `Selecionar imagem` (`accept=image/jpeg,image/png`, preferindo câmera no celular quando o navegador decidir).
4. Mostrar prévia e permitir `Cadastrar/Atualizar rosto` ou `Refazer`.
5. Permitir `Remover rosto` para RH/Admin.
6. O cadastro facial pelo próprio usuário funcionário fica bloqueado; o vínculo biométrico deve ser realizado por conta administrativa.

## Registro de ponto

Fluxos protegidos:

- `POST /time-entries/secure`.
- `POST /remote-punch`, incluindo sincronização offline.

Antes da transação que cria `time_entries`:

1. jornada/geofence/dispositivo continuam sendo avaliados como hoje;
2. política facial é carregada;
3. se não exigida, segue normalmente;
4. se exigida e sem perfil, retorna `FACE_NOT_ENROLLED`;
5. se a selfie não localizar rosto ou não corresponder ao funcionário, retorna `FACE_NOT_RECOGNIZED`/`FACE_MISMATCH`;
6. se AWS falhar, retorna `FACE_PROVIDER_UNAVAILABLE`;
7. se aprovada, a transação grava `face_verified`, `face_similarity`, `face_provider` e `time_entry_face_checks`.

## Segurança e auditoria

- Nunca enviar Access Key/Secret Key ao frontend.
- Limitar upload facial pelo `FACE_MAX_IMAGE_MB`.
- Aceitar apenas JPG/PNG no cadastro e no ponto existente.
- Registrar `FACE_ENROLL`, `FACE_REVOKE` e tentativas de ponto com decisão facial.
- Ao atualizar o cadastro facial, remover o `FaceId` anterior da collection após o novo cadastro ser aceito.
- O threshold é configurável por `FACE_MATCH_THRESHOLD`, padrão `90`.
- O reconhecimento facial não é prova de vida. Face Liveness não faz parte desta entrega.

## Variáveis de ambiente

- `FACE_PROVIDER=AWS_REKOGNITION`
- `AWS_REGION=<região>`
- `AWS_ACCESS_KEY_ID=<chave>`
- `AWS_SECRET_ACCESS_KEY=<segredo>`
- `AWS_SESSION_TOKEN=<opcional>`
- `FACE_MATCH_THRESHOLD=90`
- `FACE_MAX_IMAGE_MB=6`

## IAM mínimo

A identidade usada pela API precisa das ações Rekognition necessárias ao fluxo: `CreateCollection`, `DetectFaces`, `IndexFaces`, `SearchFacesByImage` e `DeleteFaces` nas collections utilizadas pelo Ponto Certo.

## Testes

- Serviço AWS: collection idempotente, cadastro de um único rosto, rejeição sem/múltiplos rostos, validação do funcionário esperado e revogação.
- API de ponto: bloqueio sem cadastro, bloqueio por mismatch, gravação da evidência quando aprovado e bypass quando dispensado.
- Ponto remoto/offline: mesma política facial na sincronização.
- UI: cadastro facial visível apenas em funcionário salvo; câmera/upload e remoção; empresa salva `requireFaceRecognition`.
- Build completo API/Web/Mobile e suíte Vitest.
