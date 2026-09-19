# Sessão persistente no PWA e Android

O login do funcionário agora solicita uma sessão persistente. Fechar e reabrir o aplicativo ou ultrapassar as antigas 8 horas não exige uma nova senha. A sessão permanece até sair da conta, mudar a senha ou perder o acesso (conta, funcionário, empresa ou tenant inativo). Limpar os dados do navegador/aplicativo também remove o login local.

O servidor armazena apenas o SHA-256 de um token aleatório de 256 bits e confere o acesso atual em cada chamada. O token não possui expiração por tempo. O logout elimina a sessão no servidor e o token/dados em cache do aparelho. Sem conexão, a saída local continua funcionando, mas a revogação remota depende de conseguir acessar o servidor. Falhas de rede ou banco não são interpretadas como senha expirada.

O painel administrativo mantém seu login JWT atual. Os logins antigos do PWA continuam com a validade anterior: após a atualização, entre novamente uma vez para criar a sessão persistente.

## Publicação

Execute a migração `012_persistent_sessions.sql` pelo comando `npm run db:migrate --workspace apps/api`, antes de reiniciar a API. O script `scripts/rebuild-server.sh` já executa as migrações. Publique também o novo build do PWA; no Android, gere um novo APK para enviar a opção de sessão persistente no login.

## Verificação

Há testes para sessão válida após um ano simulado, hash do token, revogação ao sair, mudança de senha, conta desativada, falha de banco e preservação do login administrativo. O teste de navegador fecha e reabre a página no mesmo contexto, simula indisponibilidade da API e verifica que sair permanece efetivo após recarregar.
