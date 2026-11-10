# Permissões de supervisor e ajustes de intervalo/hora extra

## Intenção

Permitir que o MASTER delegue a gestão completa de funcionários a supervisores sem conceder módulos administrativos desnecessários. Corrigir também o cálculo de jornadas nas quais um funcionário não registra o intervalo e oferecer uma correção diária auditável quando a hora extra calculada não deve compor o saldo.

## Objetivos

- `Funcionários: Consultar e alterar` libera cadastro, edição, movimentação entre grupos, foto facial e ações auxiliares da própria tela.
- Alterações de permissão passam a aparecer na sessão do supervisor sem exigir novo login; a API continua validando o banco a cada requisição.
- Cada funcionário pode habilitar `Descontar intervalo previsto quando houver somente entrada e saída`.
- Com essa opção ativa, em um dia normal com exatamente duas marcações, o cálculo desconta a duração entre `exit_1` e `entry_2` da jornada daquele dia.
- O relatório mensal oferece `Ignorar hora extra` por dia, exige uma justificativa e permite `Restaurar hora extra`.
- Marcações originais nunca são apagadas nem alteradas; toda exceção diária é persistida e auditada.

## Não objetivos

- Não inferir intervalo em dias de folga, feriado, afastamento ou jornada sem intervalo completo configurado.
- Não alterar automaticamente funcionários existentes; a nova regra começa desativada.
- Não zerar atrasos ou faltas quando a hora extra diária for ignorada.
- Não conceder ao supervisor acesso geral aos cadastros de empresas, escalas ou locais apenas para editar um funcionário.

## Abordagens consideradas

1. Apenas zerar a hora extra por dia. É simples e auditável, mas exige correção manual recorrente.
2. Apenas descontar o intervalo automaticamente por funcionário. Resolve o caso rotineiro, mas não cobre exceções como o saldo restante de aproximadamente 35 minutos no exemplo de 09/11.
3. Combinar regra automática e exceção diária. Foi a opção escolhida porque automatiza o caso recorrente e mantém uma correção explícita para casos excepcionais.

## Desenho

### Permissões

A tela de funcionários deixará de buscar dados auxiliares diretamente nos módulos `companies`, `schedules` e `locations`. Um endpoint de opções sob `/employees` entregará empresas, jornadas, locais e grupos já filtrados pelo tenant/empresa da sessão. Os locais atribuídos ao funcionário também serão consultados sob `/employees/:id/locations`.

As rotas `/face` e `/devices` serão mapeadas para a permissão `employees`; `/groups` já usa esse mapeamento. Assim, leitura exige `employees: read` e alterações exigem `employees: write`. O frontend recarregará `/auth/me` ao recuperar foco/visibilidade e em mudanças de página, atualizando os controles da sessão sem logout.

### Desconto automático de intervalo

Será adicionada à tabela `employees` a flag booleana `auto_deduct_scheduled_break`, padrão `0`, exposta no formulário de funcionário.

Quando a flag estiver ativa, o dia for uma jornada normal, existirem exatamente duas marcações e a escala possuir `exit_1` e `entry_2` válidos, o cálculo fará:

`minutos trabalhados ajustados = max(0, período entre as duas marcações - intervalo previsto)`

Com quatro marcações ou mais, o cálculo por pares permanece como está. Se a escala não contiver intervalo, nenhuma dedução será aplicada. O relatório continuará mostrando os pontos reais e passará a indicar que houve desconto automático.

### Exceção diária de hora extra

Uma tabela de exceções será criada com chave única por tenant, funcionário e data. Ela armazenará tipo `IGNORE_OVERTIME`, justificativa, autor e datas de criação/remoção. A remoção será lógica para preservar histórico.

Após o cálculo normal e o desconto automático, uma exceção ativa define `overtime_minutes = 0` e recalcula `time_bank_minutes`, sem modificar `worked_minutes`, `normal_minutes`, `late_minutes` ou `absence_minutes`.

No relatório mensal, dias com hora extra exibirão `Ignorar hora extra`. A confirmação exigirá justificativa. Dias com exceção ativa exibirão um indicador, a justificativa e `Restaurar hora extra`. Ambas as ações recalculam o período e atualizam imediatamente totais, relatório PDF e exportações de folha.

### Segurança e auditoria

- As ações diárias exigem acesso de escrita em Relatórios e a permissão sensível `overtime.manage` para supervisores.
- A API valida tenant, funcionário e data antes de alterar a exceção.
- Criação e restauração registram auditoria com valor anterior, novo valor, data e justificativa.
- A migração é aditiva e compatível com funcionários e cálculos existentes.

## Critérios de aceite

- Supervisor com `employees: write` consegue editar, mover e salvar/remover foto; com `employees: read`, apenas consulta.
- Supervisor não precisa receber leitura geral de Empresas, Escalas ou Locais para abrir a tela de funcionários.
- Permissão concedida aparece após foco, navegação ou recarga, sem novo login.
- Funcionário com regra ativa, escala `08:00–12:00 / 13:00–18:00` e pontos `06:47 / 17:23` tem uma hora descontada antes do cálculo de extras.
- Funcionário sem a regra mantém o cálculo atual.
- Quatro pontos nunca sofrem desconto automático adicional.
- Ignorar hora extra zera somente o extra do dia, persiste após novo processamento e pode ser restaurado.
- Totais da tela, PDF e exportação de folha refletem a exceção.
