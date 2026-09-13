# PONTO CERTO — Revisão do Escopo Global

Data: 13/09/2026

## Resultado da revisão

A base recebida já possuía boa parte do produto operacional: multi-tenant, ponto online/offline, PWA/Android, selfie, geolocalização, biometria do dispositivo, jornadas, importação, relatórios, WhatsApp/Baileys, horas extras, logs e parte da camada SaaS/comercial.

A revisão concentrou a implementação nas lacunas do escopo global sem substituir os fluxos operacionais existentes.

## Implementado/complementado nesta revisão

- Separação de segurança do `SUPER_ADMIN`: bloqueio no backend para rotas operacionais fora de `/saas` e `/auth`.
- Supervisores em modo fail-closed: ausência de registro de permissões passa a significar nenhum acesso.
- Permissões granulares sensíveis: `whatsapp.manage`, `overtime.manage`, `reports.export`, `points.adjust`, `adjustments.approve`, `audit.view`.
- Interface de criação/edição de Supervisores com permissões de módulo e permissões sensíveis.
- Recursos comerciais ampliados: WhatsApp, filiais, offline, PWA, Android, ERP, logs, auditoria e horas extras.
- Bloqueio efetivo backend/UI para recursos críticos de WhatsApp, offline e horas extras.
- Matriz/Filial explícito com `company_type = MATRIX | BRANCH`; novas empresas secundárias são `BRANCH`; matriz não é promovida automaticamente.
- Limite de filiais calculado somente sobre filiais ativas e validado ao trocar contrato/plano.
- Limite de funcionários preservado e integrado ao contrato/entitlements existente.
- Auditoria administrativa ampliada com executor, empresa, perfil, módulo, resultado, IP, User-Agent, antes/depois/detalhes e sanitização recursiva de segredos.
- Auditoria de acessos negados e falhas em requisições mutáveis.
- Filtros rápidos e avançados da auditoria.
- Exportação de auditoria em CSV, XLSX e PDF; XLSX inclui proteção contra formula injection.
- Retenção automática de auditoria por 12 meses, mantendo logs técnicos em 90 dias.
- Propostas com número sequencial, snapshot de nome do plano e condições comerciais, pesquisa por número/cliente/CNPJ, filtros por status/plano/período/vencidas/convertidas.
- Documentos de proposta versionados com SHA-256 preservados.
- Novo módulo `Contratos`, exclusivo do SaaS Admin.
- Contrato gerado apenas a partir de proposta aprovada, herdando o snapshot comercial.
- Estados contratuais `DRAFT`, `GENERATED`, `SENT`, `SIGNED`, `CANCELED`.
- Edição de dados contratuais antes do envio, com revisão.
- Geração DOCX/PDF do contrato; PDF reaproveita o mecanismo LibreOffice Headless existente.
- Armazenamento e download de revisões com SHA-256.
- Upload e download de contrato assinado em PDF.
- Histórico administrativo do contrato.
- Conversão para cliente somente após contrato `SIGNED`.
- Conversão transacional e idempotente, criando tenant, matriz, Master, assinatura, limites e recursos sem deixar criação parcial em caso de rollback.
- Dashboard SaaS ampliado: clientes por status, teste, funcionários, empresas, propostas, contratos, MRR, implantação e distribuição por plano.
- Configurações SaaS gerais adicionadas.
- SMTP/POP3 ampliado com segurança `NONE/STARTTLS/SSL_TLS`; SMTP inclui nome/e-mail do remetente; senha continua criptografada e não é retornada.
- Menu SaaS reorganizado conforme o escopo: Dashboard, Clientes/Empresas, Planos, Assinaturas e Recursos, Propostas, Contratos, Auditoria, Configurações SaaS, Configuração de e-mail e Alterar senha.
- Correção de colisão de rotas de download versus `/:id` em propostas/contratos.
- Correção de condição de concorrência na numeração de proposta/contrato.

## Migration adicionada

`apps/api/sql/017_global_saas_scope.sql`

É incremental e mantém os dados existentes. Em instalações legadas, a empresa mais antiga de cada tenant é usada somente como regra de migração para marcar a matriz inicial; a partir daí o tipo fica explícito e não depende mais da ordem de criação.

## Validações executadas

- TypeScript completo do frontend: `tsc -p apps/web/tsconfig.json --noEmit` — aprovado.
- Varredura sintática de todos os arquivos executáveis `.ts/.tsx` de API, Web e testes — 145 arquivos, 0 erros de sintaxe.
- TypeScript da API foi executado e não apresentou diagnóstico novo de lógica/tipagem fora das dependências ausentes no pacote de backup. O ZIP recebido não contém alguns módulos da API (`exceljs`, `pizzip`, `docxtemplater`, `web-push`, Baileys e outros) no backup local usado neste ambiente.
- O build Vite não pode ser finalizado neste ambiente porque o backup de dependências do ZIP contém o binário nativo do Rollup para Windows, enquanto a execução de validação é Linux. O deploy oficial já executa `npm ci`, que instala o binário correto no servidor.

## Publicação no Lightsail

O projeto já possui `scripts/deploy-server.sh` e `scripts/rebuild-server.sh`. O fluxo existente executa `npm ci`, build da API/Web/Mobile, migrations, setup de push/WhatsApp e restart do PM2.

Após subir esta versão para o Git, use o mesmo comando de deploy que você já utiliza. A migration `017_global_saas_scope.sql` será detectada automaticamente por `scripts/migrate-db.ts`.

## Observação jurídica

O DOCX contratual é um modelo comercial editável e contém a estrutura operacional prevista. Conforme o próprio escopo, o texto definitivo deve passar por revisão jurídica antes de uso contratual final.
