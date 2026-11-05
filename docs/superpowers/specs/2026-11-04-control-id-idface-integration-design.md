# Integração Control iD iDFace com o Ponto Certo

**Data:** 2026-11-04  
**Status:** aguardando aprovação após definição comercial  
**Equipamento inicial:** Control iD iDFace Pro FP ASK, série da família 0M06  
**Modalidade inicial:** reconhecimento facial, Push + Monitor

## Intenção

Transformar o iDFace de cada empresa em um marcador facial do Ponto Certo. O Ponto Certo será a fonte oficial dos funcionários e das fotos, enviará os cadastros ao terminal e receberá as batidas realizadas nele. Cada evento aceito continuará entrando no fluxo já existente de `time_entries`, jornadas, relatórios e auditoria.

O desenho deve preservar o isolamento multi-tenant: um equipamento pertence a exatamente uma empresa de um tenant e nunca pode consultar, receber ou registrar funcionários de outra empresa.

## Objetivos

- Cadastrar e manter funcionários e fotos no Ponto Certo.
- Sincronizar automaticamente funcionários ativos e suas fotos com o iDFace da empresa.
- Usar somente reconhecimento facial na primeira versão.
- Receber batidas pelo Monitor e comandos/resultados pelo Push.
- Continuar coletando no terminal durante indisponibilidade temporária da internet e importar os eventos quando a comunicação voltar.
- Impedir duplicidade mesmo quando o equipamento repetir notificações.
- Mostrar ao administrador o estado do terminal, da sincronização e de cada erro.
- Integrar as batidas à tabela e às regras existentes, sem criar uma folha paralela.
- Entregar a integração como parte de uma solução comercial REP-P, condicionando o lançamento ao atendimento integral da Portaria MTP nº 671/2021 compilada vigente, registro do programa no INPI e documentação exigida.

## Não objetivos da primeira versão

- Cadastro ou identificação por impressão digital, cartão, QR Code, PIN ou senha.
- Acionamento de fechadura, catraca, relé ou regras de controle de acesso.
- Compartilhamento de um terminal entre empresas ou tenants.
- Uso do iDCloud/RHiD como intermediário.
- Alteração de foto ou funcionário feita diretamente no terminal como fonte oficial.
- Tratar o iDFace isoladamente como REP-C. Neste desenho ele é coletor físico de um REP-P cujo registrador e armazenamento legal pertencem ao Ponto Certo.

## Antiobjetivos

- Expor o IP ou a API administrativa do equipamento diretamente à internet.
- Confiar em `tenant_id`, `company_id`, nome ou matrícula enviados pelo terminal para definir o escopo.
- Usar somente nome, CPF ou matrícula para identificar o funcionário na recepção de uma batida.
- Perder eventos porque o terminal ou o Ponto Certo ficou temporariamente offline.
- Aceitar silenciosamente eventos desconhecidos, conflitantes ou pertencentes a cadastro removido.

## Restrições e premissas

- Cada empresa terá seu próprio equipamento.
- A primeira versão permitirá exatamente um equipamento Control iD ativo por empresa. A arquitetura não reutilizará IDs globais ou pressupostos que impeçam vários equipamentos no futuro, mas o fan-out para múltiplos terminais fica fora desta entrega.
- O equipamento operará em Modo Ponto autônomo e manterá os usuários e fotos necessários localmente.
- O terminal precisa ter acesso HTTPS de saída para o domínio público da API Ponto Certo.
- O firmware da família V8 deve ser atualizado para a versão estável suportada pela Control iD no momento da homologação e precisa aceitar Push, Monitor e autenticação Bearer nas chamadas externas. A implementação começa com um teste de compatibilidade contra o equipamento físico 0M06 e registra fixtures sanitizadas dos payloads reais. Schemas de protocolo ficam isolados em um adaptador versionado; o assistente de instalação bloqueia firmware não homologado em vez de adivinhar compatibilidade.
- O relógio e o fuso do equipamento devem ser sincronizados; eventos serão recebidos como Unix timestamp e persistidos no horário de Brasília conforme a convenção atual do sistema.
- A foto já armazenada em `employee_face_images` será a fonte da imagem enviada ao terminal.
- Nenhuma regra de jornada, janela de horário, autorização de sobrejornada ou situação cadastral poderá impedir a gravação fiel de uma marcação facial válida. Regras de jornada pertencem ao tratamento posterior, nunca à captura legal.
- O relógio usado pelo REP-P deve manter sincronismo com a Hora Legal Brasileira dentro da tolerância normativa, e o onboarding/monitoramento deve detectar desvios do coletor.

## Abordagens consideradas

### 1. Push + Monitor da Control iD — escolhida

O terminal abre conexões de saída para a API Ponto Certo. O Push permite que ele consulte comandos pendentes, como criar usuário, enviar foto e remover usuário. O Monitor notifica alterações nos `access_logs` e o estado do equipamento.

**Vantagens:** funciona bem em SaaS, evita IP fixo/VPN/port forwarding, permite fila durável e respeita redes corporativas comuns.  
**Desvantagens:** exige implementar o protocolo de Push, os callbacks do Monitor e o acompanhamento assíncrono dos resultados.

### 2. Conector local por empresa

Um serviço instalado na rede do cliente acessaria o iDFace e a nuvem Ponto Certo.

**Vantagens:** atende redes muito restritas e permite acesso direto à API local.  
**Desvantagens:** adiciona instalação, atualização, observabilidade e suporte em cada cliente. Foi descartada para a primeira versão.

### 3. API Ponto Certo acessando o IP do equipamento

O backend chamaria diretamente a API REST de cada terminal.

**Vantagens:** implementação inicial aparentemente menor.  
**Desvantagens:** exige IP público, VPN ou abertura de portas, aumenta a superfície de ataque e não escala operacionalmente. Foi descartada.

## Escopo de conformidade para comercialização

A integração só poderá ser divulgada e contratada como REP-P depois que o produto completo, e não apenas o conector Control iD, cumprir os requisitos vigentes e passar por revisão jurídica e técnica formal. O plano de implementação deve incluir este trabalho como bloqueador de lançamento.

### Registrador e armazenamento legal

- criar um Armazenamento de Registro de Ponto (ARP) redundante, altamente disponível e append-only;
- registrar, sem alteração ou exclusão, marcações, mudanças de empregador, mudanças de empregado, ajustes de relógio e eventos sensíveis exigidos;
- manter uma sequência de NSR independente por estabelecimento, incremental e sem reutilização;
- guardar na marcação legal CPF, instante e fuso da ocorrência, instante e fuso da gravação, identificador do coletor e hash SHA-256;
- separar rigorosamente o registro original imutável das classificações, cálculos, justificativas e ajustes do Programa de Tratamento;
- gerar AFD a partir da ARP para intervalo solicitado e gerar AEJ/Espelho pelo módulo de tratamento nos leiautes oficiais vigentes;
- assinar os artefatos exigidos com certificado e formato previstos na regulamentação vigente;
- manter alta disponibilidade do registrador, ARP e acesso do trabalhador.

### Comprovante do trabalhador

Após cada marcação incorporada à ARP, disponibilizar ao funcionário o “Comprovante de Registro de Ponto do Trabalhador” com NSR, empregador, local, trabalhador, data/hora, registro INPI do REP-P, hash e assinatura eletrônica. O trabalhador terá acesso independente de solicitação ou autorização prévia e poderá extrair, no mínimo, os comprovantes das últimas 48 horas. O formato eletrônico seguirá PAdES e os requisitos vigentes.

### Obrigações de produto e documentação

- obter certificado de registro do programa REP-P no INPI antes do lançamento comercial;
- emitir Atestado Técnico e Termo de Responsabilidade aplicável para cada cliente, com responsáveis e assinaturas exigidas;
- manter versão e identificador do programa rastreáveis nos comprovantes e documentos;
- validar AFD, AEJ, Espelho e comprovantes contra os leiautes publicados pelo Ministério do Trabalho;
- manter matriz de conformidade rastreando cada artigo/requisito para código, teste, evidência e responsável;
- realizar revisão jurídica trabalhista e de proteção de dados antes do piloto comercial e novamente antes da disponibilidade geral.

### Proibições que afetam o fluxo

- nunca restringir horário de marcação;
- nunca criar marcação automática com horário previsto;
- nunca exigir autorização prévia para sobrejornada;
- nunca editar ou apagar a marcação original feita pelo empregado;
- ajustes permanecem registros adicionais auditados do tratamento, preservando integralmente a origem.

O mecanismo atual de `schedule_decision` poderá classificar ou sinalizar a marcação depois da captura, mas decisões `BLOCKED` não serão aplicadas ao coletor Control iD e não impedirão a escrita na ARP.

### Proteção de dados biométricos

Reconhecimento facial envolve dado pessoal sensível. Antes da comercialização serão documentados controlador e operador, finalidade, hipótese legal, transparência ao titular, controles de acesso, criptografia, resposta a incidentes, atendimento de direitos e avaliação de impacto. A imagem facial não será inserida na ARP nem em comprovantes/AFD; ela serve para autenticação e sincronização do coletor.

## Modelo multiempresa

```text
Tenant
 ├── Empresa A
 │    ├── Funcionários A
 │    └── iDFace A
 └── Empresa B
      ├── Funcionários B
      └── iDFace B
```

O terminal será resolvido por uma credencial opaca própria. Dessa credencial, o backend obtém `terminal_id`, `tenant_id` e `company_id`. Esses valores nunca serão aceitos do corpo da requisição.

Toda consulta subsequente incluirá o escopo resolvido pelo terminal. Um `user_id` externo só será aceito se existir um mapeamento ativo entre aquele equipamento e um funcionário da mesma empresa.

## Modelo de dados proposto

### `control_id_terminals`

Representa o equipamento físico e seu vínculo imutável de escopo.

- `id`
- `tenant_id`
- `company_id`
- `name`
- `vendor_device_id`
- `serial_number`
- `model`
- `firmware_version`
- `public_id`
- `credential_hash`
- `active`
- `status` (`PENDING`, `ONLINE`, `OFFLINE`, `ERROR`, `DISABLED`)
- `last_push_at`
- `last_monitor_at`
- `last_event_at`
- `created_by`, `created_at`, `updated_at`

Deve haver unicidade para `vendor_device_id` e para a credencial pública. O vínculo com empresa não será editado depois da ativação; para mover fisicamente um terminal, ele deverá ser desativado e pareado novamente.

Na V1, a aplicação impedirá a existência de mais de um terminal Control iD ativo por empresa. A migração e o serviço devem aplicar essa invariável de forma transacional, inclusive sob requisições concorrentes.

### `control_id_employee_mappings`

Registra a projeção de cada funcionário no equipamento.

- `terminal_id`
- `tenant_id`
- `company_id`
- `employee_id`
- `vendor_user_id`
- `desired_version`
- `synced_version`
- `sync_status` (`PENDING`, `SYNCED`, `ERROR`, `REMOVAL_PENDING`, `REMOVED`)
- `last_error_code`, `last_error_message`
- `last_synced_at`, `disabled_at`

O `vendor_user_id` será o ID numérico interno do funcionário, pois ele já é globalmente único no banco atual. O mapeamento continuará existindo para auditoria, estado da sincronização e futuras migrações.

### `control_id_sync_jobs`

Fila durável consumida pelo endpoint Push.

- `id`, `terminal_id`, `employee_id`
- `job_type` (`UPSERT_USER`, `UPSERT_FACE`, `DELETE_FACE`, `DELETE_USER`, `CONFIGURE_POINT_MODE`, `FULL_RECONCILE`)
- `deduplication_key`
- `payload_json`
- `status` (`PENDING`, `CLAIMED`, `SUCCEEDED`, `FAILED`, `DEAD`)
- `attempts`, `available_at`, `claimed_at`, `completed_at`
- `push_uuid`, `vendor_response_json`, `last_error`
- `created_at`, `updated_at`

Uma chave idempotente por terminal, funcionário, operação e versão evita comandos redundantes. Alterações mais novas substituem operações pendentes antigas quando isso for seguro.

### `control_id_events`

Caixa de entrada imutável dos eventos do Monitor.

- `id`, `terminal_id`, `tenant_id`, `company_id`
- `vendor_log_id`
- `vendor_user_id`
- `occurred_at`
- `vendor_event_type`, `vendor_log_type_id`, `identifier_type`
- `payload_json`, `payload_sha256`
- `status` (`RECEIVED`, `PROCESSED`, `DUPLICATE`, `QUARANTINED`, `REJECTED`)
- `time_entry_id`
- `reason_code`, `reason_message`
- `received_at`, `processed_at`

A restrição única `(terminal_id, vendor_log_id)` será a primeira barreira de idempotência.

### ARP do REP-P

O evento Control iD autenticado e deduplicado alimentará uma estrutura legal append-only separada de `time_entries`. O modelo final pode ser dividido por tipo de operação, mas deverá representar pelo menos:

- estabelecimento e sequência `nsr` reservada transacionalmente;
- tipo da operação legal;
- empregador e trabalhador aplicáveis;
- instante/fuso da ocorrência e da gravação;
- coletor Control iD identificado;
- payload canônico da operação;
- hash SHA-256;
- encadeamento ou mecanismo adicional de evidência de integridade;
- versão do REP-P e metadados necessários para AFD/comprovante;
- referência ao evento de origem, sem permitir atualização destrutiva.

Correções nunca sobrescrevem a ARP. O Programa de Tratamento registra uma nova operação, justificativa e responsável, preservando o original.

### Alterações em `time_entries`

- acrescentar `CONTROL_ID` ao enum/catálogo de `source`;
- acrescentar `control_id_terminal_id` anulável;
- acrescentar `control_id_event_id` anulável e único;
- manter `registered_at` como horário original da ocorrência;
- preencher `scheduled_work_date` e `schedule_decision` usando as regras existentes.

`time_entries` continuará sendo a visão operacional/tratada usada pela aplicação. A ARP será a fonte fiscal imutável. A criação das duas representações deve ser transacional ou usar uma caixa de saída durável que impeça existir marcação confirmada sem registro legal correspondente.

## Pareamento e segurança

1. Um `TENANT_ADMIN` cria o terminal dentro da empresa e informa previamente o número de série exibido no equipamento/caixa.
2. O Ponto Certo gera uma credencial Bearer de alta entropia, exibida uma única vez, e as URLs de Push e Monitor.
3. O instalador configura no iDFace o domínio HTTPS, os caminhos e o token.
4. Na primeira comunicação, o backend valida o token, confere o serial previamente cadastrado e apresenta ao administrador o `vendor_device_id` e a versão detectada para confirmação.
5. Somente depois da confirmação administrativa o backend fixa o `vendor_device_id` ao terminal. Um token usado por dispositivo/serial divergente é bloqueado e auditado.
6. Comunicações posteriores exigem token válido e o mesmo `vendor_device_id`.
7. O onboarding só conclui depois de validar firmware, modo, relógio/fuso, Push, Monitor e uma sincronização de teste.

A credencial será armazenada apenas como hash. Rotação cria uma credencial nova e invalida a anterior. Desativar o terminal bloqueia imediatamente Push, Monitor e recepção de batidas.

Quando suportado pelo firmware, será configurado pinning do certificado público. Payloads, tokens e fotos nunca serão gravados em logs de aplicação. Os endpoints terão limite de tamanho, rate limit por terminal e respostas sem dados de outros equipamentos.

## Sincronização de funcionários e fotos

### Inclusão

Quando um funcionário ativo da empresa tiver uma foto válida:

1. criar/atualizar o mapeamento;
2. enfileirar `UPSERT_USER` com nome e matrícula;
3. depois do sucesso, enfileirar `UPSERT_FACE` com a imagem de `employee_face_images`;
4. marcar `SYNCED` somente quando cadastro e foto forem confirmados pelo terminal.

O comando facial usará `user_set_image`/`user_set_image_list`, conforme tamanho e volume. A resposta de qualidade da Control iD será preservada e traduzida para uma mensagem acionável na interface.

### Alteração

Mudanças de nome, matrícula ou foto incrementam `desired_version` e geram nova projeção. A foto continuará sendo validada pelo fluxo facial já existente antes de entrar na fila do equipamento.

### Desligamento, transferência e remoção da foto

- funcionário desativado: remover face e usuário do terminal;
- transferência para outra empresa: remover do terminal anterior e incluir no terminal da nova empresa apenas depois de o cadastro pertencer à nova empresa;
- foto removida: remover a face do terminal e deixar o funcionário indisponível para marcação facial;
- terminal offline: manter as operações pendentes até a reconexão, mostrando o risco operacional na interface.

Eventos ocorridos antes de `disabled_at`, mas entregues depois por contingência, podem ser processados. Eventos ocorridos depois do desligamento serão enviados para quarentena, não descartados silenciosamente.

### Reconciliação

Além dos eventos incrementais, haverá ação de reconciliação completa que compara:

- funcionários ativos com foto no Ponto Certo;
- mapeamentos esperados;
- usuários e timestamps de fotos informados pelo terminal.

A reconciliação corrige itens faltantes e remove projeções órfãs pertencentes ao próprio Ponto Certo. Ela não deve apagar automaticamente cadastros não reconhecidos sem antes colocá-los em relatório de conflito.

## Recepção das batidas

O Monitor enviará mudanças de `access_logs` para um endpoint específico do terminal. O endpoint deve:

1. autenticar e resolver o terminal;
2. validar o formato e o `vendor_device_id`;
3. inserir o payload bruto em `control_id_events` de forma idempotente;
4. responder rapidamente com HTTP 200;
5. processar o evento fora da requisição de Monitor.

Cada item de um lote autenticado será persistido separadamente: itens válidos entram como `RECEIVED` e itens semanticamente inválidos ou não suportados como `REJECTED`, sempre com o motivo. Depois que todos os itens estiverem duravelmente registrados, o endpoint responde HTTP 200 para evitar loops de reenvio. Apenas envelope malformado, credencial inválida ou falha de persistência do lote produz resposta de erro.

O processador de marcações aceitará identificação facial concedida no Modo Ponto. Eventos negados, usuários não identificados, outros identificadores ou eventos administrativos serão armazenados para diagnóstico e, quando a regulamentação exigir, como eventos sensíveis da ARP, mas não criarão marcação de jornada.

Uma identificação facial concedida e vinculável a um trabalhador será primeiro incorporada à ARP, independentemente de horário previsto, sobrejornada, sequência esperada ou status de tratamento. Só depois será projetada em `time_entries` e classificada para os cálculos do Ponto Certo.

Na primeira versão, o terminal operará sem tipos de batida personalizados. O Ponto Certo atribuirá automaticamente `CLOCK_IN`, `BREAK_OUT`, `BREAK_IN` ou `CLOCK_OUT` conforme a jornada e a sequência cronológica. Em uma recuperação de contingência, os eventos serão processados por funcionário e por horário crescente, considerando as marcações já persistidas para a mesma jornada. Eventos que não possam ser classificados com segurança irão para quarentena para revisão, em vez de serem forçados como um tipo incorreto.

Se uma batida atrasada chegar depois de uma batida cronologicamente posterior já ter sido transformada em `time_entries`, ela ainda receberá NSR e será gravada imutavelmente na ARP. O sistema não reclassificará silenciosamente registros tratados existentes: a projeção do novo evento e a jornada afetada serão colocadas em quarentena, com uma simulação da sequência correta para revisão autorizada. Qualquer correção reutilizará o fluxo auditado de ajustes de ponto.

Antes da inserção, o serviço deve:

- resolver o trabalhador pelo histórico do mapeamento terminal-funcionário;
- sinalizar, sem bloquear a captura legal, divergências de empresa, desligamento ou sincronização;
- adquirir o mesmo lock lógico `pc:punch:<tenant>:<employee>` usado pelos fluxos atuais;
- reservar o NSR do estabelecimento e gravar a operação na ARP;
- determinar jornada e próxima classificação pelas regras existentes, sem aplicar bloqueios de horário;
- impedir duplicidade pelo evento externo e pelas regras da jornada;
- inserir a projeção em `time_entries`, vincular o evento e gerar o comprovante;
- emitir auditoria e atualizar os painéis existentes.

O ponto recebido do equipamento não exige GPS, selfie do momento ou biometria do celular. A evidência será o terminal autenticado, o evento original e o método facial informado pelo iDFace.

## Push

### `GET /integrations/control-id/push`

Autentica o terminal e entrega no máximo um comando ou um lote ordenado que caiba nos limites do equipamento. A seleção e a marcação `CLAIMED` serão atômicas. Se não houver trabalho, retorna resposta vazia conforme o protocolo da Control iD.

### `POST /integrations/control-id/result`

Correlaciona `uuid`, terminal e comando. Atualiza o job, o mapeamento e os erros de sincronização. Resultados repetidos serão idempotentes. Falhas transitórias retornam à fila com backoff; falhas permanentes ficam visíveis e exigem correção ou nova tentativa.

## Monitor

### `POST /integrations/control-id/monitor/dao`

Recebe alterações de objetos, priorizando `access_logs`. O endpoint suporta vários itens no mesmo payload e confirma somente depois que todos forem gravados na caixa de entrada.

### `POST /integrations/control-id/monitor/device_is_alive`

Atualiza saúde, quantidade de logs pendentes e última comunicação. Não gera ponto.

Endpoints de cadastro remoto facial podem ser implementados posteriormente; a versão inicial envia a foto existente no Ponto Certo, portanto não depende de captura remota no display.

## Interface administrativa

Adicionar “Equipamentos” ao contexto da empresa para `TENANT_ADMIN` e visualização operacional para `RH`.

### Lista e estado

- nome, modelo, número de série e firmware;
- empresa vinculada;
- estado online/offline/erro/desativado;
- última comunicação Push, Monitor e última batida;
- funcionários sincronizados, pendentes e com erro.

### Assistente de instalação

- criar terminal;
- exibir token uma única vez;
- exibir URLs e passos exatos para Modo Ponto, Push e Monitor;
- testar comunicação;
- testar envio de um funcionário/foto;
- concluir ativação.

### Funcionário

Na área de foto facial, mostrar também o estado no iDFace da empresa: não elegível, pendente, sincronizado, erro ou remoção pendente. Permitir “Tentar novamente” e exibir erros de qualidade da foto sem mostrar dados internos do protocolo.

### Diagnóstico

- reprocessar evento em quarentena;
- reconciliar terminal;
- rotacionar credencial;
- desativar terminal;
- consultar histórico de sincronização e eventos, respeitando permissões e auditoria.

Na V1, somente `TENANT_ADMIN` poderá criar, confirmar, rotacionar, desativar e reconciliar terminais. `RH` poderá consultar estado e histórico e reenviar uma sincronização facial com erro. Reprocessamento de quarentena seguirá a permissão sensível já usada para ajustar marcações (`points.adjust`); sem essa permissão, o usuário terá apenas leitura. Todas essas ações serão auditadas.

## Falhas e contingência

- **Terminal sem internet:** continua identificando usuários já sincronizados e guarda logs; jobs e eventos retomam depois.
- **API indisponível:** o equipamento repete Push/Monitor; idempotência impede duplicações.
- **Foto rejeitada:** funcionário fica com erro de sincronização e não é considerado pronto para usar o terminal.
- **Usuário desconhecido:** evento entra em quarentena e não cria ponto.
- **Relógio divergente:** onboarding bloqueia divergência relevante; eventos futuros ou absurdamente antigos entram em quarentena.
- **Resultado Push perdido:** lease do job expira e o comando pode ser reenviado de forma idempotente.
- **Evento fora de ordem:** processamento serial por funcionário e horário; a classificação é recalculada antes da transação.
- **Credencial comprometida:** administrador rotaciona o token e o terminal fica offline até receber o novo.

## Observabilidade e auditoria

- métricas de terminais online/offline, atraso de eventos, profundidade da fila e taxa de erro;
- logs estruturados com IDs internos, nunca token ou imagem;
- alertas para terminal offline, fila acumulada, relógio divergente e erros repetidos;
- auditoria para criação, ativação, rotação, desativação, reconciliação e reprocessamento;
- retenção do payload bruto conforme política de privacidade e necessidade de prova, documentada antes da produção.

## Estratégia de testes

- testes unitários de resolução de escopo, mapeamento de eventos, classificação sequencial e backoff;
- testes de integração dos endpoints Push, Result e Monitor;
- testes de idempotência com notificações e resultados repetidos;
- testes de isolamento tentando cruzar terminal, funcionário, empresa e tenant;
- testes de eventos atrasados, fora de ordem, desligamento e transferência;
- testes de falhas parciais em jobs de usuário e foto;
- testes de UI para ativação, status, retry e mensagens de erro;
- teste real de bancada com o iDFace da foto, firmware atualizado, queda de internet e recuperação;
- validação de que relatórios, dashboard, cálculo e espelho tratam `CONTROL_ID` como as demais fontes.

## Implantação

1. Aplicar migração e endpoints com a integração desabilitada por feature flag.
2. Configurar um terminal de homologação em uma empresa de teste.
3. Sincronizar poucos funcionários com fotos consentidas.
4. Validar inclusão, atualização, desligamento e recuperação offline.
5. Comparar logs do equipamento com `control_id_events` e `time_entries`.
6. Ativar piloto controlado em uma empresa.
7. Liberar gradualmente, com runbook de instalação e suporte.

## Decisões deixadas ao implementador

- nomes finais de classes, módulos e arquivos, seguindo os padrões atuais;
- política exata de backoff e tamanho dos lotes dentro dos limites documentados pelo fabricante;
- componentes visuais específicos, mantendo o design system existente;
- mecanismo de execução do processador assíncrono compatível com a infraestrutura atual, desde que a fila permaneça durável e segura para múltiplas instâncias.

