# Ocorrências, reprocessamento e foto por supervisor

## Intenção

Tornar explícito o recálculo do espelho, permitir que supervisores autorizados administrem a foto facial e oferecer um fluxo auditável para férias, atestados e declarações. O resultado deve eliminar faltas indevidas sem confundir horas abonadas com horas efetivamente trabalhadas.

## Decisões aprovadas

- Usar uma única área de **Ocorrências**.
- Férias e atestados abrangem dias completos, inclusive intervalos de várias datas.
- Declarações abrangem uma única data e um intervalo de horas.
- Toda inclusão exige observação para auditoria.
- Salvar ou excluir uma ocorrência recalcula imediatamente o período afetado.

## Abordagens consideradas

1. **Ocorrência unificada (escolhida):** amplia a estrutura atual com declaração parcial. Reutiliza permissões, auditoria e cálculo existentes.
2. **Módulo separado para declarações:** separação visual maior, mas duplica regras, telas e manutenção.
3. **Criar marcações artificiais:** descartada porque faria horas abonadas parecerem horas trabalhadas e comprometeria a rastreabilidade.

## Comportamento funcional

### Reprocessamento

- O relatório mensal terá um botão explícito **Reprocessar período** após a primeira visualização.
- O botão chama o cálculo do funcionário entre as datas selecionadas e recarrega o espelho.
- A ação ficará disponível a quem puder alterar Relatórios; consultar o espelho continuará possível com acesso de leitura.
- Ações de ignorar/restaurar hora extra continuam exigindo **Gerenciar horas extras**. Quando o supervisor não possuir essa operação sensível, a tela explicará por que essas ações não aparecem.

### Foto facial do funcionário

- Supervisor com Funcionários em **Consultar e alterar** poderá consultar, incluir, substituir e remover foto.
- A API verificará tenant e empresa acessível pelo supervisor antes de operar a foto.
- A autorização será coberta por teste passando pelo middleware real, não apenas pela função de mapeamento.
- Erros da autorização, validação facial, AWS ou sincronização com Control iD serão apresentados com mensagem útil na tela.

### Férias e atestados

- Cadastro por data inicial e final, tipo e observação obrigatória.
- O período aprovado terá status próprio no espelho e não gerará falta ou atraso.
- Dias com marcações existentes serão preservados; a ocorrência não apagará pontos.
- Inclusão e exclusão recalcularão todos os dias atingidos e gerarão auditoria.

### Declarações

- Cadastro por funcionário, uma data, hora inicial, hora final e observação obrigatória.
- O intervalo deve ser válido, com início anterior ao fim, dentro do mesmo dia.
- O cálculo abonará somente a parcela do intervalo que se sobrepõe à jornada prevista e ao déficit do dia.
- A declaração não cria marcações e não aumenta hora extra.
- O espelho e o PDF mostrarão separadamente o período e os minutos abonados.

## Modelo de dados

- Ampliar `absences.type` com `DECLARACAO`.
- Adicionar `start_time` e `end_time`, nulos para ocorrências de dia completo e obrigatórios para declaração.
- Reutilizar `reason` como observação auditável, tornando-a obrigatória na API para novas ocorrências.
- Armazenar em `daily_time_calculations` os minutos abonados do dia para exibição e totalização determinística.
- Registrar usuário criador/removedor quando necessário sem apagar o histórico de auditoria.

## Cálculo

- Ocorrências aprovadas de dia completo zeram falta e atraso daquele dia, mantendo os pontos reais.
- Declaração calcula a interseção entre seu intervalo e os segmentos previstos da jornada.
- O crédito de declaração é limitado ao déficit apurado; portanto não gera horas normais além da carga prevista, banco positivo ou hora extra.
- Sobreposições de declarações no mesmo dia são unificadas antes da soma para evitar crédito duplicado.

## Permissões e escopo

- Ocorrências em modo escrita autorizam cadastrar e excluir férias, atestados e declarações.
- Relatórios em modo escrita autorizam reprocessar.
- Funcionários em modo escrita autorizam administrar foto.
- Todas as consultas e mutações respeitam tenant e empresa do supervisor.

## Interface

- Renomear o campo atual para **Observação para auditoria** e marcá-lo como obrigatório.
- Ao escolher Declaração, substituir o período de datas por uma data e horários inicial/final.
- Mostrar confirmação de recálculo após salvar ou excluir.
- Exibir no espelho rótulos como `Atestado`, `Férias` e `Declaração 10:00–12:00 (02:00 abonadas)`.

## Verificação

- Testes de autorização real do supervisor para fotos e isolamento entre empresas.
- Testes de API para validação, auditoria, inclusão e exclusão de ocorrências.
- Testes de cálculo para dias completos, declaração parcial, intervalos fora da jornada, sobreposição e limite do déficit.
- Testes da ação de reprocessar e das mensagens de permissão.
- Build da API e do painel web antes do envio ao GitHub.

## Fora do escopo

- Declarações que atravessam a meia-noite ou abrangem várias datas.
- Upload e armazenamento do documento médico nesta entrega.
- Alterar ou apagar marcações reais devido a uma ocorrência.
