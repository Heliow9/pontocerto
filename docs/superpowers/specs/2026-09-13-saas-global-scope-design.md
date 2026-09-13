# Ponto Certo — Convergência ao Escopo SaaS Global

## Objetivo
Convergir a base 0.4.x existente ao escopo SaaS global fornecido, preservando ponto online/offline, selfie, biometria do dispositivo, geolocalização, jornadas, relatórios, importação e WhatsApp.

## Decisões de arquitetura
1. `SUPER_ADMIN` permanece isolado em `/saas`; rotas operacionais negam seu uso mesmo quando papéis legados ainda o listem.
2. Supervisores operam em fail-closed: ausência de `user_permissions` equivale a acesso negado. Permissões de módulo e ações sensíveis são verificadas no backend.
3. Entitlements resolvem Plano → Contrato do tenant → Exceção por empresa. Recursos comerciais incluem WhatsApp, Filiais, Offline, PWA, Android, ERP, Logs/Auditoria e Horas Extras.
4. `companies.company_type` identifica explicitamente `MATRIX` ou `BRANCH`; cada tenant possui uma única matriz e o limite conta somente filiais ativas.
5. Propostas e contratos armazenam snapshots comerciais imutáveis em vez de depender de joins mutáveis com planos.
6. Contratos comerciais são módulo SaaS próprio e documentos são versionados com SHA-256. Conversão em cliente ocorre transacionalmente e idempotentemente a partir do contrato/proposta.
7. Auditoria administrativa registra contexto e resultado, sanitiza segredos e tem retenção de 12 meses; logs técnicos permanecem separados com retenção de 90 dias.
8. Exportações de auditoria oferecem CSV/XLSX/PDF e protegem XLSX/CSV contra formula injection.

## Compatibilidade
Migrations são incrementais e MariaDB-compatible. JSON persistido usa LONGTEXT. Dados existentes são preservados; a empresa mais antiga de cada tenant é marcada como matriz apenas durante a migração inicial para compatibilidade, mas toda lógica posterior usa `company_type` explicitamente.
