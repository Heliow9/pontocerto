# PWA e grupos — setembro de 2026

## Experiência do funcionário

- A tela de ponto informa o próximo registro a partir da jornada consultada no servidor. As etapas mostram o que foi registrado e o que vem a seguir, respeitando jornadas com ou sem intervalo.
- O comprovante aparece no topo após confirmação do servidor, com tipo, data, horário e número do registro. Tentativas sem resposta continuam identificadas como pendentes e usam o mesmo identificador para evitar duplicação.
- A preparação do primeiro acesso explica câmera, localização, aparelho e jornada; a conclusão fica salva por funcionário neste aparelho. A ajuda pode ser aberta novamente a qualquer momento.
- A ajuda explica recuperação de permissões, verificação do local e solicitação de ajuste. No Android nativo há atalho para configurações; no navegador há instruções para as permissões do site.
- O histórico tem calendário, contagem de marcações e seleção do dia. Solicitar uma marcação ausente usa a data selecionada. Os detalhes de uma marcação existente continuam permitindo pedir correção e acompanhar o status do RH.
- Previsto, trabalhado e saldo do dia vêm de `daily_time_calculations`, com data da apuração. Sem cálculo, aparece uma explicação em vez de valores zerados. Saldo do dia não representa banco acumulado. O endpoint `GET /time-entries/my/summary?days=15` aceita de 1 a 60 dias e usa exclusivamente o funcionário autenticado.
- A conexão e o retorno à aba atualizam o estado. Sem rede, os registros salvos permanecem identificados como dados da última consulta; registrar exige reconexão e confirmação. Não foi implementado registro offline.
- O convite de instalação pode ser adiado por sete dias. Atualizações não são oferecidas durante câmera, envio, ajuste ou confirmação pendente. Botões têm rótulos acessíveis e estados não dependem apenas de cores.
- A base compartilhada do Android vibra brevemente após a confirmação. É necessário gerar e instalar um novo APK/AAB para distribuir mudanças nativas; publicar o PWA não atualiza um APK existente.

## Grupos e ERP

Veja [Exportação ERP](EXPORTACAO_ERP.md#grupos-de-funcionários). O fluxo começa em **Funcionários → Gerenciar grupos** e termina em **Relatórios → Exportar para ERP → Funcionários → Exportar por**.

## Publicação no servidor

Esta versão altera banco, API, painel web e PWA. Apenas copiar o painel não é suficiente.

Na pasta do repositório do servidor, depois que a revisão estiver no Git remoto:

```bash
git pull --ff-only origin main
bash scripts/rebuild-server.sh
sudo cp -a apps/web/dist/. /var/www/pontoocerto/
```

O script instala dependências, compila API/painel/PWA, aplica migrações e reinicia `ponto-certo-api` no PM2. A migração nova é `010_employee_groups.sql`; ela já foi aplicada no ambiente local de desenvolvimento.

Publique também **todo o conteúdo de `apps/mobile/dist/`** no diretório que o Nginx usa para o endereço do PWA. Esse diretório pode ser diferente de `/var/www/pontoocerto/`; confirme o bloco do domínio do PWA antes de copiar:

```bash
sudo nginx -T 2>/dev/null | grep -E 'server_name|root |alias '
```

Após publicar, abra o PWA conectado à internet e aceite **Atualizar aplicativo** quando aparecer. Verifique o cadastro de um grupo, seus integrantes, a prévia da exportação e o histórico no PWA. A compatibilidade do CSV Questor continua dependendo de validação no ERP de destino, conforme o guia de exportação.
