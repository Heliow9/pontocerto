# Importação de funcionários e lembretes de ponto

## Importação no painel web

Abra **Funcionários → Importar planilha → Baixar modelo Excel**. Preencha a aba `Funcionarios`, selecione a empresa e envie o arquivo. O sistema aceita `.xlsx` e `.csv` em UTF-8 (ou UTF-16 com BOM), com até 2 MB e 500 funcionários.

Colunas: `nome`, `cpf`, `matricula`, `pis`, `admissao`, `ctps`, `cargo`, `setor`, `grupo`, `jornada`, `local`. Nome e matrícula são obrigatórios. CPF é opcional e validado quando preenchido. CPF, matrícula e PIS devem ficar como texto para preservar zeros iniciais. Datas aceitam `AAAA-MM-DD`, `DD/MM/AAAA` ou células de data do Excel. Não são aceitas fórmulas, hyperlinks ou objetos nas células.

Grupo, jornada e local usam os nomes dos cadastros da empresa selecionada. Cadastre-os antes de importar; nomes desconhecidos ou ambíguos bloqueiam a linha. O modelo admite um local por funcionário. Jornadas e locais precisam estar ativos. Setor e grupo permanecem independentes.

A prévia mostra problemas por linha e não grava dados. Corrija os erros, envie novamente e confirme a importação. A confirmação é válida por 30 minutos, vinculada ao usuário/empresa e ao conteúdo conferido. Todos os funcionários são gravados na mesma transação. Uma repetição da mesma confirmação retorna o resultado anterior, sem duplicar os cadastros. O sistema revalida vínculos, CPF/matrícula e limite do plano ao confirmar.

Esta rotina cadastra **novos funcionários ativos**. Não atualiza funcionários existentes, não cria grupos automaticamente e não cria contas ou senhas de acesso. Configure o acesso ao aplicativo depois, no cadastro individual.

## Lembretes no PWA e no Android

Em **Perfil → Lembretes de ponto**, o funcionário ativa as notificações neste aparelho e concede a permissão solicitada. A tela também mostra os próximos horários previstos. O consentimento é individual; permitir a câmera ou o GPS não permite notificações automaticamente.

Exemplo de jornada e aviso:

| Marcação | Horário previsto | Envio do lembrete |
|---|---|---|
| Entrada | 07:00 | 06:55 |
| Saída para intervalo | 12:00 | 11:55 |
| Retorno do intervalo | 13:00 | 12:55 |
| Saída | 17:00 | 16:55 |

O servidor verifica os horários a cada 15 segundos, com referência de Brasília, inclusive quando a jornada passa da meia-noite. Não envia em folgas, feriados cadastrados para a empresa ou afastamentos aprovados. Marcações já realizadas também suprimem o aviso correspondente. Mudanças na escala são consideradas na próxima verificação; não há uma agenda semanal antiga gravada no celular.

As notificações são enviadas por Web Push no PWA e pelo Expo Push Service/FCM no Android. A entrega depende da internet, do serviço de push, das permissões, das configurações de bateria e do sistema operacional. Não há garantia de chegada no segundo exato. O aviso não registra o ponto. Cada evento é reservado uma vez por assinatura para evitar duplicidade entre processos/reinícios; falhas ambíguas de envio não são repetidas. Após indisponibilidade, avisos com mais de um minuto de atraso não são reenviados. O TTL do push é 60 segundos. Não se trata de registro offline nem de alarme local.

Desativar no perfil interrompe o recebimento naquele aparelho. Ao sair da conta, o aplicativo tenta desativar o destino no servidor e remover a assinatura local do navegador. Se a saída ocorrer sem conexão, a desativação no servidor pode não ser concluída; desative conectado antes de compartilhar o aparelho.

## Servidor e PWA

Na pasta do repositório do servidor, após atualizar para a revisão que contém esta funcionalidade:

```bash
git pull --ff-only origin main
bash scripts/rebuild-server.sh
sudo cp -a apps/web/dist/. /var/www/pontoocerto/
```

O rebuild agora aplica `011_imports_notifications.sql` e executa `npm run push:setup --workspace apps/api`, que gera as chaves Web Push no `.env` da API apenas na primeira configuração. As chaves existentes são preservadas; não apague nem regenere esse par a cada publicação. Reiniciar a API carrega as chaves. O worker de lembretes roda dentro do processo `ponto-certo-api`, sem cron adicional.

Publique também `apps/mobile/dist/.` no diretório do Nginx que serve o PWA. Se o Nginx aponta diretamente para essa pasta, o rebuild já atualiza os arquivos. Aceite **Atualizar aplicativo** no PWA para carregar o novo service worker e depois ative os lembretes no perfil.

Variáveis da API:

- `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`: geradas por `push:setup`.
- `VAPID_SUBJECT`: endereço HTTPS ou contato `mailto:` do responsável. O padrão usa o domínio atual do painel.
- `REMINDER_WORKER_ENABLED=1`: ativa o processamento. Use `0` para suspendê-lo.
- `EXPO_ACCESS_TOKEN`: opcional, caso a segurança adicional do Expo Push Service seja habilitada no projeto.

O PWA precisa de HTTPS, navegador compatível e permissão de notificações. No iPhone, use o PWA instalado pela tela inicial. Web Push funciona com a página fechada, sujeito ao suporte e às políticas do navegador; não exige configuração Firebase própria. Referência: [Push API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).

## Android — configuração externa ainda necessária

O projeto ainda não está vinculado ao Firebase/FCM e ao EAS para push. O código e o plugin `expo-notifications` estão preparados, mas o APK antigo não recebe estes lembretes. É necessário configurar o serviço e gerar um novo APK.

1. No Firebase, crie um projeto e registre o aplicativo Android com o pacote **`com.pontocerto.app`**. Baixe `google-services.json`.
2. Vincule `apps/mobile` ao projeto EAS. Defina `EXPO_PUBLIC_EAS_PROJECT_ID` com o ID UUID do projeto EAS e `GOOGLE_SERVICES_JSON` com o caminho do arquivo do Firebase no ambiente do build. `app.config.ts` usa esses valores.
3. Cadastre no EAS a conta de serviço para **FCM V1**, usando `eas credentials` ou o painel do EAS. A credencial privada deve ser enviada ao EAS, não ao repositório. Ela é diferente de `google-services.json`.
4. Para build remoto, configure `GOOGLE_SERVICES_JSON` como variável de arquivo no ambiente EAS escolhido e disponibilize `EXPO_PUBLIC_EAS_PROJECT_ID` nesse mesmo ambiente. O arquivo local está ignorado pelo Git e não deve ser presumido presente no servidor de build.
5. Gere o APK com o perfil `preview`, instale no celular e ative **Perfil → Lembretes de ponto**. O canal Android se chama “Lembretes de ponto”. Valide com a tela bloqueada antes de distribuir à equipe.

Fontes oficiais: [Configuração de push no Expo](https://docs.expo.dev/push-notifications/push-notifications-setup/), [Credenciais FCM V1](https://docs.expo.dev/push-notifications/fcm-credentials/), [Expo Notifications SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).

## Validação

Testes automatizados cobrem leitura de Excel/CSV, dados inválidos, limites, vínculos, isolamento, confirmação/idempotência, cálculo de antecedência, virada do dia, folgas, afastamentos, marcações realizadas, reserva única de envio e assinaturas revogadas. Testes de interface simulam permissões e serviços de push; isso não comprova entrega real por FCM ou pelo navegador de produção. A entrega em aparelho físico ainda depende da configuração externa e do teste após publicação.
