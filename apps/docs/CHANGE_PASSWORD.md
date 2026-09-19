# Alteração da própria senha

- Web (empresa e SaaS): menu **Minha conta → Alterar senha**.
- PWA e Android: aba **Perfil → Segurança da conta → Alterar senha**.

O formulário exige senha atual, nova senha com pelo menos 8 caracteres e confirmação. A nova senha precisa ser diferente da atual. A API também limita a nova senha a 72 bytes UTF-8, evitando truncamento do bcrypt; caracteres acentuados e emojis podem ocupar vários bytes.

O endpoint autenticado `POST /auth/password` usa somente o usuário e tenant da sessão. Verifica a conta ativa e a senha atual, grava o hash bcrypt e protege contra sobreposição de alterações concorrentes. Senha atual incorreta retorna 400, sem encerrar a sessão. Os campos são apagados da tela após sucesso; o mobile também os descarta ao cancelar ou sair da aba.

Esta opção altera a própria senha de um usuário conectado. Recuperação sem a senha atual continua dependendo do RH/administrador. Não envia e-mails nem altera a senha de terceiros. Sessões JWT já emitidas mantêm sua validade original; a nova senha passa a ser exigida nos próximos logins.

## Publicação

Depois de atualizar o repositório e executar `bash scripts/rebuild-server.sh`, publique `apps/web/dist/.` em **`/var/www/pontoocerto/`**, pasta confirmada para **`pontoocerto.duckdns.org`**. A grafia inclui dois “o” antes de “certo”. O script de rebuild compila os arquivos, mas não os copia para o Nginx.

Publique `apps/mobile/dist` na pasta que serve a PWA (ainda precisa ser identificada no servidor). Para o Android, gere e instale um novo APK/AAB pelo EAS. Não é necessária uma nova migração de banco para esta funcionalidade.
