# Redesign UI/UX — Administração SaaS — 13/09/2026

## Escopo aplicado
- Novo shell SaaS com sidebar, agrupamento de navegação, topbar e versão mobile.
- Dashboard com cards de indicadores, distribuição por plano, pipeline comercial e ações rápidas.
- Clientes/Empresas com resumo de carteira, tabela e cadastro mais consistente.
- Planos com cards comerciais, status, limites e recursos.
- Assinaturas e Recursos com status semântico e tabela padronizada.
- Propostas com filtros em painel, badges, tabela, modal estruturado, documentos e histórico.
- Contratos com filtros, badges, modal estruturado, documentos, anexos assinados e histórico.
- Auditoria SaaS com filtros reorganizados, exportações, status semântico e paginação.
- Configurações SaaS, e-mail e senha alinhadas ao mesmo sistema visual.
- Responsividade para desktop, tablet e celular.
- Estados vazios, mensagens de sucesso/erro, foco de teclado e carregamento preservados.

## Segurança e comportamento
Nenhuma rota de API, payload, regra de permissão, entitlement, migration ou estrutura de banco foi alterada nesta etapa. O redesign atua somente na apresentação e experiência do SaaS Admin.

## Verificação
- TypeScript do frontend validado com `tsc --noEmit` usando as dependências do projeto original.
- Build Vite não executável neste ambiente porque o backup de dependências contém Rollup nativo de Windows, enquanto o ambiente de validação é Linux. No Lightsail, `npm ci` instala o binário correto antes do build.
