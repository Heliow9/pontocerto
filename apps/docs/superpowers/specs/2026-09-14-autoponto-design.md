# Ponto Certo 2.0 — AutoPonto Facial Online

## Objetivo

Criar um modo de relógio de ponto facial compartilhado, chamado AutoPonto, para celular, tablet ou PWA. O terminal identifica o funcionário apenas pelo rosto e registra automaticamente a próxima marcação prevista, sem login individual.

## Regras preservadas do ponto individual

- O fluxo individual continua independente do AutoPonto.
- Funcionário sem foto facial cadastrada continua usando o fluxo anterior normalmente, online ou offline, sem comparação facial.
- Funcionário com foto facial cadastrada é validado pelo AWS Rekognition no ponto individual.
- No modo offline individual, a selfie é preservada e só é rejeitada na sincronização se houver foto facial cadastrada e a selfie não corresponder ao cadastro.
- GPS, vínculo de aparelho, biometria local e permissões PWA do fluxo individual não são alterados pelo AutoPonto.

## AutoPonto V1

A primeira versão funciona somente online.

### Ativação do terminal

- A tela de login do app/PWA exibe a opção `AutoPonto`.
- Um terminal ainda não ativado pede um código temporário gerado no painel administrativo.
- O código vincula aquele navegador/aparelho a uma única empresa e a um terminal específico.
- Após a ativação, o aparelho recebe uma credencial aleatória própria, armazenada localmente e apenas em hash no servidor.
- A credencial de terminal não concede acesso ao dashboard, relatórios ou dados administrativos.
- O administrador pode revogar um terminal e gerar um novo código de ativação.

### Configurações por empresa

O painel AutoPonto permite configurar:

- AutoPonto habilitado/desabilitado.
- Intervalo de escaneamento em segundos.
- Tempo de exibição do resultado antes de voltar à câmera.
- Cooldown do mesmo funcionário após uma marcação.
- Cadastro, ativação e revogação de terminais.
- Reindexação das fotos faciais já cadastradas.

Valores padrão:

- escaneamento: 3 segundos;
- resultado: 3 segundos;
- cooldown: 10 segundos.

### AWS Rekognition

- Cada empresa possui uma Collection separada.
- O identificador da Collection é determinístico por tenant e empresa.
- Ao cadastrar ou atualizar a foto facial de um funcionário, o sistema indexa um único rosto na Collection da empresa e grava o `FaceId` em `employee_face_profiles`.
- Ao remover a foto, o FaceId correspondente é removido da Collection.
- Uma ação administrativa permite reindexar as fotos existentes para suportar funcionários cadastrados antes do AutoPonto.
- O terminal usa `SearchFacesByImage` somente na Collection da empresa vinculada.
- Um funcionário sem foto/indexação facial não pode usar AutoPonto, mas continua podendo usar o ponto individual.

### Fluxo de captura

1. Terminal ativo abre câmera frontal em tela cheia.
2. A cada intervalo configurado, se não houver processamento em curso, captura uma imagem reduzida/comprimida.
3. Envia a captura à API com a credencial do terminal.
4. A API pesquisa o rosto na Collection da empresa.
5. Se nenhum rosto for identificado, a tela mostra uma orientação curta e volta ao modo de captura após o tempo configurado.
6. Se um funcionário for identificado, a API valida se ele está ativo e pertence à mesma empresa.
7. A API aplica a janela de jornada existente e escolhe `schedule.nextType` como próxima marcação.
8. A API impede nova marcação do mesmo funcionário durante o cooldown configurado.
9. A marcação é salva com origem `AUTO_POINT`, FaceId/similaridade, terminal e evidência de selfie.
10. A tela mostra nome, matrícula, tipo e horário por alguns segundos e retorna automaticamente para o próximo funcionário.

### Estados de UI

- `idle`: câmera aberta, “Posicione seu rosto”.
- `scanning`: “Identificando…”.
- `success`: check verde, nome, matrícula, tipo e horário.
- `not-recognized`: rosto não reconhecido, orientação para tentar novamente/procurar responsável.
- `blocked`: jornada concluída/fora da janela ou cooldown; mostra motivo sem registrar.
- `offline`: AutoPonto informa que precisa de internet e não tenta registrar.
- `terminal-revoked`: remove a credencial local e volta para ativação.

### Segurança e auditoria

- Nenhuma Access Key/Secret AWS é enviada ao frontend.
- Código de ativação expira e é armazenado em HMAC/hash.
- Token do terminal é longo, aleatório e armazenado somente em hash no banco.
- O endpoint público do AutoPonto aceita apenas operações estritamente necessárias.
- A API usa lock por funcionário durante a marcação para evitar duplicidade concorrente.
- O cooldown também é validado no servidor.
- A captura usada no AutoPonto é armazenada como evidência da marcação seguindo o padrão existente de selfies.
