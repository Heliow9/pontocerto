# Análise de UI e UX — Ponto Certo

Data: 09/09/2026. Escopo: painel React/Vite, experiência web do aplicativo Expo (candidata a PWA) e aplicativo Android.

Análise estática de componentes, estilos, fluxos, configurações e trechos de API relevantes. Não foram executados fluxos autenticados, inspeção visual em navegador, testes em aparelho, build EAS ou testes de usabilidade. Os problemas de código abaixo são observáveis na implementação; sobreposições, contraste final e comportamento por aparelho precisam de validação visual. Nenhum código funcional foi alterado.

## Direção recomendada

Manter o painel voltado a RH e gestores e a experiência do funcionário centrada em registrar e consultar sua jornada. Compartilhar identidade visual, terminologia e regras, com componentes adequados a cada plataforma. A base azul, cartões claros e ação principal contextual do app são um bom ponto de partida.

Priorizar confiança no resultado, recuperação de falhas e redução de esforço. Refinamento visual vem junto desses fluxos: textos legíveis, hierarquia clara, estados consistentes e menos informações técnicas na primeira tela.

## Achados prioritários

P0: corrigir antes de disponibilizar o fluxo afetado. P1: próxima rodada de melhorias. P2: evolução posterior. Esforço relativo: pequeno, médio ou grande; não é estimativa de prazo.

| Prioridade | Evidência | Impacto e proposta | Esforço |
|---|---|---|---|
| P0 | `apps/web/src/pages/EmployeesPage.tsx:62`: a edição abre antes da consulta dos locais; a falha transforma os vínculos em lista vazia. `apps/api/src/routes/employees.routes.ts:221` substitui os vínculos ao salvar. | Uma falha de leitura pode levar à remoção involuntária dos locais autorizados. Exibir carregamento/erro, impedir salvar formulário incompleto e preservar os vínculos quando a leitura falhar. | Pequeno/médio |
| P0 | `apps/mobile/app/index.tsx` usa `Alert.alert` para login, bloqueios, sucesso e navegação ao perfil, inclusive em `Platform.OS === "web"`. | A documentação do React Native Web lista Alert como não implementado. Criar aviso/modal compatível com web e nativo, com ações acessíveis. Validar na versão instalada antes da liberação PWA. | Médio |
| P0 | `loadToday` e `loadHistory` substituem dados por `[]` em qualquer erro; restauração de sessão remove token em qualquer falha de `/auth/me`. O painel também encerra sessão nessa situação. | Falta de internet pode parecer ausência de ponto ou sessão expirada. Separar carregando, vazio, erro, desatualizado e não autorizado; conservar dados conhecidos e oferecer tentar novamente. | Médio |
| P0 | `loadScheduleContext` e `loadDeviceStatus` falham retornando `null`; a ação usa uma sequência alternativa fixa de quatro marcações. | A tela pode anunciar a próxima ação incorreta, especialmente em jornadas de duas batidas. A API determina o tipo efetivo, mas a interface precisa aguardar contexto válido e mostrar indisponibilidade quando não puder consultar. | Médio |
| P1 | Horário em `index.tsx:421` é calculado com `new Date()` no render, sem temporizador; não há atualização ao retomar o aplicativo. | O relógio e a jornada podem ficar desatualizados. Atualizar relógio e dados ao retornar/virar o dia; distinguir horário de referência do aparelho do horário confirmado pelo servidor. | Médio |
| P1 | `ReportsPage.tsx:13`: datas mudam sem invalidar relatório existente; só a troca de funcionário limpa o resultado. | Filtros podem indicar um período enquanto os dados mostram outro. Associar o resultado aos filtros consultados e mostrar “Atualize para aplicar este período”. | Pequeno |
| P1 | `PointsPage.tsx` usa `toISOString()` para “hoje”, apesar de existir utilitário de data local. | No fim do dia no Brasil, o filtro pode iniciar no dia seguinte em UTC. Padronizar datas pela zona de negócio definida para a aplicação. | Pequeno/médio |

Também adicionar estados de envio nos formulários administrativos: vários botões Salvar permanecem habilitados durante a requisição. Para o registro de ponto, diferenciar falha confirmada de resposta perdida: consultar o resultado antes de orientar uma nova marcação. Idempotência exige trabalho coordenado na API; não presumir que desabilitar o botão resolve sozinho.

## Painel web

**Navegação e estrutura.** Em `styles.css`, abaixo de 760 px a sidebar vira um bloco no topo e distribui todos os itens em duas colunas. Isso empurra o conteúdo para baixo. Adotar cabeçalho compacto e menu recolhível no celular. No desktop, agrupar Operação, Cadastros e Administração. O menu atual só diferencia o Admin SaaS; adaptar ações aos demais perfis autorizados. Usar URLs por tela e filtros relevantes: hoje a navegação fica em estado/localStorage, sem histórico próprio por página.

**Dashboard.** Tornar os cartões atalhos para listas filtradas. Priorizar pendências acionáveis: ajustes, pessoas sem jornada/local e problemas de vínculo. Mostrar quando os indicadores foram calculados: o próprio dashboard informa que atraso/falta dependem de processamento. Evitar aparentar acompanhamento em tempo real sem atualização. Em erro de `/dashboard`, oferecer recuperação; atualmente pode ficar em “Carregando...”.

**Listagens.** Tabelas têm largura mínima de 720 px; Funcionários apresenta dez colunas e várias ações por linha. No celular, mostrar cartões com nome, situação, jornada e ação de detalhes. No desktop, oferecer busca, filtros por empresa/situação, paginação e menu de ações secundárias. Manter informações frequentes visíveis e evidências de GPS, foto e dispositivo em detalhes da marcação.

**Formulários.** Funcionário e Empresa concentram muitas configurações no mesmo modal. Organizar em etapas ou seções expansíveis: identificação, vínculo/jornada, locais, acesso e políticas. Mostrar obrigatoriedade, validação junto ao campo e resumo das consequências de alterações. Adicionar proteção contra fechamento com alterações não salvas: o modal fecha ao clicar no fundo. No editor de jornada, identificar cada horário — Entrada, Intervalo, Retorno, Saída — e permitir copiar horários para outros dias, com resumo semanal antes de salvar.

**Locais.** Hoje o formulário pede latitude e longitude. Propor busca de endereço e mapa com círculo do raio permitido, mantendo alternativa textual e coordenadas avançadas. Exibir a política efetiva da empresa e dos locais para reduzir interpretações erradas de herança e exceções.

**Linguagem.** Traduzir `ALLOWED`, `WARN`, `BLOCK`, `APPROVED` e outros códigos. No painel operacional, trocar “tenant” por “organização” e “Timezone” por “Fuso horário”. Relatórios precisam de legendas para CH, HT_NORMAIS, EX_EN, AT e FA. A tela pode usar nomes completos mesmo se o documento exportado precisar preservar abreviações.

**Acessibilidade.** O modal não implementa semântica de diálogo, foco inicial, contenção/restauração de foco ou Escape. Os avisos não têm região viva. Há textos de 9–12 px e controles pequenos. Padronizar foco visível, rótulos, mensagens persistentes quando exigirem ação e texto principal de 14–16 px como direção inicial de design. Medir contraste na renderização antes de declarar conformidade.

**Detalhes úteis.** Remover contas de demonstração pré-preenchidas dos logins de produção; oferecer mostrar senha e recuperação de acesso (esta última requer backend). A lista de feriados limita-se aos primeiros 20 sem navegação: adicionar paginação/filtro. A abertura de PDF após requisição assíncrona merece alternativa de download quando o navegador bloquear a janela.

## Experiência do funcionário: PWA e Android

**Tela Ponto.** Ordem proposta: identificação compacta → situação da jornada e próxima marcação → ação principal → marcações de hoje → detalhes de local/segurança. Preservar o botão contextual existente. Substituir a faixa de informações técnicas por um estado útil, por exemplo “Aparelho pronto” ou “Conclua a configuração”. Status devem refletir consulta recente; não afirmar “biometria pronta” apenas porque existe vínculo, pois a credencial local pode ter sido invalidada.

**Primeiro acesso.** Oferecer configuração guiada a partir da tela inicial: explicar permissões, vincular aparelho quando exigido e confirmar que o usuário está pronto para registrar. Hoje ele precisa descobrir o Perfil e voltar ao Ponto. Expor restrições de plataforma antes da selfie, sem orientar o funcionário a alterar políticas do RH.

**Fluxo de registro.** Consultar contexto e detectar impedimentos conhecidos; explicar/obter permissões necessárias; preparar localização; capturar e confirmar selfie; autenticar quando exigido; enviar; apresentar confirmação persistente. A localização deve ter atualidade suficiente no envio e a API continua validando as regras. Já há indicador textual de etapa: expandi-lo para estados claros e recuperação específica de erro. Não adicionar uma confirmação redundante depois de “Confirmar e registrar”.

**Confirmação.** Mostrar tipo, horário devolvido pela API, data e identificação da marcação, com acesso pelo histórico. Hoje o resultado fica principalmente em alerta. Isso deve ser chamado de confirmação de registro, sem presumir requisitos de um comprovante legal.

**Permissões e falhas.** Diferenciar câmera negada, GPS desligado, precisão insuficiente, fora da área, biometria cancelada e internet indisponível. Oferecer ação correspondente: abrir configurações quando aplicável, tentar localização novamente, revisar local ou consultar ajuda. No código web, a mensagem de GPS manda abrir o Safari independentemente do navegador; adequar instruções ao ambiente.

**Histórico.** A lista atual mostra marcações individuais dos últimos 15 dias. Agrupar por dia, permitir período, mostrar jornada prevista/realizada e detalhar registros. Solicitação de ajuste e acompanhamento pelo funcionário são propostas de evolução, dependentes de API, permissões e fluxo de aprovação; não são funcionalidades já prontas.

## PWA especificamente

Existe tratamento web no app Expo, mas não foram encontrados manifest PWA, service worker ou fluxo de instalação nos arquivos versionados analisados. Isso não permite afirmar que a implantação externa já tem esses recursos.

Adicionar identidade de instalação (nome, ícones, modo standalone e tema), orientação contextual de instalação e experiência explícita sem conexão. Manifest e cache offline têm funções distintas, conforme a [documentação Expo para PWA](https://docs.expo.dev/guides/progressive-web-apps/).

Com a política atual, propor offline inicialmente para a estrutura visual e consulta controlada de dados já obtidos, com indicação de última atualização. Mostrar que o registro precisa de conexão. Registro offline seria uma mudança de produto/API porque o fluxo usa horário e validações do servidor. Evitar cache indiscriminado de fotos, respostas autenticadas e credenciais; limpar dados locais adequadamente na troca de conta. Atualizações da PWA devem acontecer fora de uma marcação em andamento.

O código atual bloqueia a biometria nativa no caminho web. Mostrar a compatibilidade logo no início e orientar o uso do aplicativo nativo quando a política exigir. WebAuthn seria uma integração distinta, sujeita a avaliação; não equivale automaticamente ao fluxo SecureStore já implementado.

Criar uma camada de feedback multiplataforma: a [matriz oficial do React Native Web](https://necolas.github.io/react-native-web/docs/react-native-compatibility/) lista Alert sem implementação e também diferenças em recursos como RefreshControl. Para atualização manual, oferecer botão na web e gesto nativo onde suportado.

## Android e preparação Expo

O projeto já é Expo e `eas.json` tem development, preview APK e production app-bundle. Isso confirma a estrutura prevista, não certifica que os builds passaram ou que há projeto remoto configurado.

Antes da distribuição:

- Usar áreas seguras reais nos cabeçalhos, câmera e navegação inferior. O app importa SafeAreaView do React Native e posiciona abas com `bottom: 12`; validar navegação por gestos e três botões. A [orientação Expo](https://docs.expo.dev/develop/user-interface/safe-areas/) cobre o uso de safe-area-context, já presente nas dependências.
- Fazer o login acompanhar o teclado e manter campos/ação acessíveis em aparelhos pequenos. Testar fonte ampliada, TalkBack e rótulos/estados dos botões. Adotar áreas interativas de pelo menos 48 × 48 dp, conforme [Android Developers](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views).
- Substituir pontos e emojis por ícones consistentes com rótulos. Aumentar textos de apoio que hoje usam 9–11 unidades.
- Definir tema coerente: `userInterfaceStyle` está em automatic, mas a interface tem cores claras fixas. Implementar ambos os temas ou configurar intencionalmente a aparência clara até haver suporte completo.
- Configurar ícone, ícone adaptativo e abertura com identidade Ponto Certo; não estão definidos no app.json analisado.
- Testar voltar do Android durante câmera/envio, retorno das configurações e restauração após alternar de aplicativo. Abas hoje são estado local apesar do Expo Router presente.
- Validar em build instalado, com API de homologação e aparelho físico: câmera, biometria, credencial invalidada, GPS, permissões negadas e rede instável. Executar verificação de dependências/Expo Doctor e gerar preview antes da distribuição de produção.

## Sequência de execução e critérios

1. **Confiabilidade:** corrigir P0, estado de envio, datas e atualização do contexto. Aceite: erro de rede não vira “sem registros”, não apaga vínculos e não permite anunciar sucesso sem resposta confirmada.
2. **Uso diário:** refazer primeiro acesso, tela Ponto, confirmação e histórico; ajustar navegação/tabelas/formulários web. Aceite: usuário encontra a próxima ação sem precisar interpretar códigos ou buscar configuração escondida.
3. **Plataformas:** completar instalação/atualização PWA e detalhes Android; validar em build preview. Aceite: mensagens funcionam no navegador; teclado, áreas seguras e permissões permitem completar o fluxo no aparelho.
4. **Evolução:** mapa de locais, solicitações de ajuste, filtros avançados e atalhos do dashboard.

Matriz sugerida: painel em 360, 390, 768 e 1440 px; Chrome Android e Safari para web; Android físico com fonte normal/ampliada e gestos/três botões. Cenários: jornadas de duas/quatro marcações, fim do dia, sessão expirada versus offline, recusa de permissões, envio com resposta perdida, mudança de período e falha ao carregar locais do funcionário.

Medir após implementação: conclusão do primeiro vínculo, tempo e tentativas por registro, erros por etapa e solicitações de ajuda. Não foram coletadas métricas de usuários nesta análise.
