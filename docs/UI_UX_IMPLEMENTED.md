# Melhorias implementadas — 09/09/2026

## Identidade visual

A logo fornecida foi adaptada para uso em fundo branco no acesso e no menu do painel, e no acesso mobile. O símbolo do relógio com seta aparece nos cabeçalhos, nos favicons, nos ícones de instalação PWA, no ícone Android e na tela de abertura nativa. O ícone adaptativo e o ícone maskable têm margem para os recortes do sistema. Os favicons e os ícones do manifest usam uma URL de versão para distinguir a nova identidade.

Após publicar, o dashboard deve mostrar “Visão geral”, “Última consulta”, o botão “Atualizar”, indicadores clicáveis e “Atalhos da equipe”. A distribuição principal dos cartões foi preservada. Ver a estrutura antiga não permite concluir que seja cache: primeiro confirme o commit no servidor e a pasta servida pelo Nginx.

Para esta atualização de marca, passaram novamente a compilação web/API, a verificação TypeScript mobile, as exportações PWA/Android e os 10 testes de interface. Alterações do ícone e da abertura Android exigem um novo build nativo e sua instalação; publicar a PWA não modifica o APK instalado.

## Web

- Navegação por URL, menu adaptado ao celular, foco visível e acesso por teclado.
- Tabelas com paginação e cartões em telas pequenas, estados vazios, carregamento e recuperação de erros.
- Formulários com proteção contra envio repetido, confirmação de descarte e organização de campos longos.
- Filtros de funcionários, permissões de edição por perfil e mapa de localização com raio de geofence.
- Indicadores do painel com acesso às páginas relacionadas, relatórios que descartam resultados de filtros antigos e jornadas com cópia de horários.
- Revisão de solicitações de ajuste pelo RH e orientações de acesso sem credenciais demo no login.

## Mobile PWA e Android

- Layout com áreas seguras, navegação inferior, acessibilidade de botões e tratamento do teclado.
- Mensagens e confirmações compatíveis com navegador e aplicativo nativo.
- Preparação guiada de aparelho, câmera e GPS antes do registro; bloqueio enquanto as condições atuais não puderem ser verificadas.
- Confirmação persistente de registro, histórico agrupado e solicitações de ajuste.
- Última consulta preservada e identificada como desatualizada quando a API não responde. Registrar ponto exige conexão.
- Ícones, manifest, instalação e atualização da PWA com cache apenas de arquivos estáticos.

## API e manutenção

- Chave persistente por tentativa, consulta de reconciliação e serialização do registro para evitar duplicação após falhas de conexão.
- Ajustes com validação de funcionário, tenant, perfil e revisão concorrente.
- Migrações incrementais 008/009 e comando de atualização sem criação de dados demo.
- Script de rebuild para o processo PM2 `ponto-certo-api`; instruções em [REBUILD_SERVER.md](REBUILD_SERVER.md).

## Verificações executadas

- Compilação da API e build de produção do painel web.
- TypeScript do mobile, exportação web/PWA e exportação do bundle Android.
- 10 testes da API e 10 testes de interface no Chromium, incluindo layout estreito, falhas de rede, permissões, envio duplicado e navegação offline da PWA.
- Expo Doctor: 21 de 21 verificações aprovadas.
- Lockfile validado com `npm ci --dry-run --ignore-scripts --include=dev`.
- Migrações aplicadas no banco configurado neste ambiente; nenhuma pendente na consulta final.

Os testes de interface usam respostas simuladas da API. A exportação Android valida o bundle, mas não substitui gerar o APK/AAB no EAS nem testar câmera, GPS, biometria e retomada em aparelho físico. O deploy no Lightsail e a configuração Nginx devem seguir o guia de rebuild. Não foram executados no servidor durante esta entrega.
