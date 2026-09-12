# Horas extras, WhatsApp e ponto remoto

## Configuração pelo painel

Em **Empresas → Editar**, há uma seção **Horas extras, WhatsApp e ponto remoto**, com seu próprio botão **Salvar automação da empresa**. Para uma empresa nova, salve primeiro o cadastro e depois abra a edição.

- Ative o acompanhamento mensal e cadastre até 20 destinatários com nome e telefone, DDI + DDD + número, somente dígitos.
- Em **Funcionários → Grupos**, selecione um grupo salvo e defina **Horas extras por mês → Salvar referência mensal**. Exemplo: 40 horas para cada integrante, não uma cota compartilhada.
- No cadastro de um funcionário salvo, a referência individual tem prioridade. Deixe vazia e salve para voltar a herdar do grupo. Sem referência individual ou de grupo não há alertas de percentual.
- As referências não cortam a apuração, não limitam a exportação e não bloqueiam marcações.
- **Atualizar totalizador**, na empresa, permite consultar a competência e a origem individual/grupo. São horas decimais: 1,50 h equivale a 1h30.

## WhatsApp por empresa

Após salvar as configurações, clique em **Conectar WhatsApp**. Aguarde até o QR Code aparecer (o serviço verifica conexões a cada 5 segundos). No celular que será o remetente: **WhatsApp → Aparelhos conectados → Conectar aparelho**. Escaneie o QR Code. O painel deve mostrar **Conectado** e o número.

Conectar habilita os envios automáticos para os destinatários salvos. Não há conexão nem envio de teste automático antes dessa ação. Use um número e destinatários de teste para a primeira validação.

A apuração é atualizada aproximadamente a cada minuto para empresas habilitadas. Ela usa pares de registros concluídos e inclui ajustes salvos. A referência atual se aplica ao acumulado mensal atual, inclusive se alterada no meio do mês. São três marcos: 50%, 100% e maior que 100%. Um salto acima de 100% pode gerar os três avisos ainda não enviados. Cada marco é único por empresa, funcionário, mês e destinatário.

Envios pendentes são atualizados/cancelados conforme a apuração seguinte. Alertas já enviados ficam no histórico. Ao mudar o mês, avisos ainda pendentes do mês anterior expiram e não são disparados com atraso. Ajustes de meses anteriores aparecem no totalizador consultado, mas não disparam novos avisos retroativos.

Há uma fila independente por empresa. A cada ciclo, é enviado no máximo um alerta por empresa conectada. **Enviado** significa que o serviço aceitou a operação; **Entregue** depende da confirmação recebida. Uma falha depois da tentativa vira **Envio não confirmado**, sem repetição automática para evitar duplicatas. Consulte o remetente para conferir esse caso. Se houver desconexão comum, o serviço tenta reconectar. Logout/revogação no WhatsApp exige novo pareamento.

Baileys é uma integração não oficial. Mudanças no protocolo ou restrições da conta podem interromper o serviço. O histórico e o totalizador permanecem no painel. Fontes: [Baileys](https://github.com/WhiskeySockets/Baileys), [armazenamento de sessões](https://github.com/WhiskeySockets/docs/blob/main/authentication/session-management.mdx).

As sessões são criptografadas com AES-256-GCM no MySQL, separadas por tenant/empresa. Preserve **WHATSAPP_ENCRYPTION_KEY** no `.env` da API e nos backups privados. Não publique a chave. O sistema não armazena conversas recebidas nem solicita sincronização do histórico completo.

## Ponto online e offline de qualquer lugar

Na empresa, ative **Permitir ponto de qualquer lugar**. Para permitir captura sem internet, ative também **Permitir capturar offline e enviar depois**, e salve. Essas opções começam desativadas.

No PWA ou novo Android, a tela Ponto passa a mostrar **Ponto de qualquer lugar → Registrar ponto remoto**. Escolha entrada, saída para intervalo, retorno ou saída, capture a selfie e confirme. Este fluxo dispensa GPS, raio e janela da jornada. O fluxo padrão de ponto continua disponível com suas regras originais.

As regras de aparelho e biometria existentes continuam valendo. Se a empresa exigir biometria nativa, utilize Android. Para acesso pelo PWA, configure a dispensa de biometria nativa no funcionário ou a política da empresa; não há simulação de biometria no navegador.

Para usar offline:

1. Acesse a conta com internet e abra a tela Ponto no aparelho que será utilizado. Vincule o aparelho pelo Perfil se exigido. Permita a câmera.
2. A autorização em cache permite iniciar o fluxo offline por até 7 dias desde a última consulta online. Ela não substitui a conferência das permissões atuais no servidor.
3. Ao confirmar, a foto, o horário e o identificador único ficam na fila local. O app só informa confirmação definitiva depois da resposta do servidor.
4. A fila tenta sincronizar com o aplicativo aberto na tela Ponto, ao recuperar conexão, ao voltar ao primeiro plano e a cada 30 segundos. Também há **Sincronizar marcações**. Se houver biometria obrigatória, o envio depende da ação do usuário para autenticar.
5. As tentativas enviadas em repetição retornam o mesmo comprovante. Um registro só sai automaticamente da fila depois da confirmação. Rejeições ficam visíveis e preservadas para orientação pelo RH, sem impedir o envio das marcações seguintes. Após tratar o caso com o RH, o usuário pode descartar uma tentativa rejeitada com confirmação explícita; essa ação apaga somente a cópia local.

O horário remoto vem do aparelho e aparece identificado na tela **Marcações** do painel e nos detalhes do histórico do funcionário, junto à indicação de envio posterior. A referência de horário do servidor também fica registrada no recebimento. Não se trata de um carimbo de tempo imune à alteração do relógio local. Datas futuras acima de 5 minutos e capturas com mais de 30 dias não são aceitas automaticamente; nesses casos, o RH deve avaliar um ajuste.

A fila comporta até 10 registros e tem limite de tamanho. A selfie é reduzida antes do armazenamento. Ao atingir o limite ou faltar espaço, a captura não é anunciada como salva: sincronize antes de continuar. Não desinstale, não limpe os dados do navegador e não use navegação privada para registros pendentes. Sair da conta preserva a fila do funcionário; outra conta não pode enviá-la como se fosse sua. O primeiro login e o primeiro vínculo do aparelho exigem internet. Não há garantia de sincronização com o PWA fechado ou o Android encerrado.

## Publicação no servidor

Requer Node.js 22.13+, MySQL e o processo PM2 `ponto-certo-api`. Utilize uma instância da API em modo fork nesta versão. O worker usa um lock no MySQL para impedir que duas instâncias assumam as mesmas sessões, mas o estado/QR é consultado na instância que as mantém.

Na raiz do repositório:

```bash
git pull --ff-only origin main
bash scripts/deploy-server.sh
```

O script identifica o diretório estático do domínio **hubpontocerto.duckdns.org** pelo `nginx -T`, confirma que contém o PWA Expo e preserva cópias dos arquivos publicados em `.deploy-backups/`. O painel usa a pasta já confirmada **/var/www/pontoocerto**. Configuração por proxy, pasta ausente ou ambígua interrompe a publicação e requer conferir o bloco do domínio. Não altera os blocos do Nginx.

O rebuild instala dependências, compila API/painel/PWA, aplica a migração **013_company_automation.sql**, cria ou preserva a chave privada de sessões WhatsApp e reinicia a API. Mantenha também o backup habitual do banco e do `.env`. O diretório de backups estáticos não é um backup do banco.

Depois, abra o PWA e aceite **Atualizar aplicativo**. Se estiver com registros pendentes da nova versão, confira sua sincronização antes de qualquer limpeza manual de dados.

## Android

É necessário um novo APK, pois há módulos nativos novos para foto e identificação das tentativas. Na raiz do projeto, configure o EAS se ainda não houver projeto e execute:

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli init
npx eas-cli build --platform android --profile preview
```

Se o EAS informar que não pode alterar a configuração dinâmica, configure `EXPO_PUBLIC_EAS_PROJECT_ID` com o ID do projeto criado, disponível no painel Expo, no ambiente utilizado pelo build. O `app.config.ts` já lê essa variável.

Confira `EXPO_PUBLIC_API_URL` no ambiente de build: deve apontar para a API de produção que o PWA utiliza, não para localhost. Ao terminar, o EAS fornece o link do APK para instalar. A funcionalidade de ponto remoto não depende de Firebase; os lembretes push do Android implementados anteriormente continuam dependendo da configuração FCM/EAS descrita em `IMPORTACAO_E_LEMBRETES.md`.

## Roteiro de teste com aparelho e WhatsApp reais

1. Use uma empresa/funcionário de teste. Cadastre como destinatário apenas um telefone seu. Ative o acompanhamento e conecte o remetente com QR Code.
2. Configure o grupo com 2h/mês. No funcionário de teste, configure 1h/mês. Na competência atual, utilize marcações de teste ou ajustes do RH que produzam 30 minutos extras: confira o alerta de 50% e a origem individual no totalizador.
3. Complete 60 minutos extras e depois ultrapasse 60: confira 100% e ultrapassagem. Atualize novamente e confirme que não chegaram duplicatas. Remova a configuração individual: a referência deve passar a 2h do grupo.
4. Habilite remoto/offline na empresa. No PWA, faça uma marcação remota online fora do local cadastrado, com selfie, e confira o comprovante no histórico/painel.
5. Ainda na mesma conta, desligue Wi-Fi e dados móveis. Faça outra marcação remota. Verifique **aguardando confirmação**. Feche e reabra o aplicativo instalado e confira que a fila continua lá.
6. Reative a internet e toque em **Sincronizar marcações**. Confira que o horário preservado é o da captura, que há uma única marcação e que ela aparece como remota com envio posterior.
7. Repita no novo APK Android, incluindo a autenticação biométrica quando exigida. Não altere registros reais apenas para forçar os percentuais.

Os testes automatizados usam banco com dados temporários e câmera/transporte WhatsApp simulados. Pareamento real, recebimento em telefones e execução em Android físico devem ser validados neste roteiro; não são inferidos do resultado dos testes locais.
