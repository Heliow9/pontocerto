# Administração SaaS e propostas comerciais

**Objetivo:** implementar o escopo aprovado pelo usuário em 13/09/2026, preservando ponto, offline, WhatsApp e logs.

**Arquitetura:** administração global sob `/saas`, separada das rotas operacionais. Contratos e exceções de recursos são persistidos no banco e conferidos na API. Propostas versionadas geram DOCX a partir do documento fornecido e PDF por conversão LibreOffice; documentos gerados ficam armazenados e associados à revisão da proposta.

**Tecnologias:** React, Express, MySQL, Docxtemplater, LibreOffice e AES-256-GCM.

## Escopo aprovado

- Essencial: 15 funcionários, R$ 69,90; Profissional: 100, R$ 99,90; Corporativo: 150, R$ 250,00; Personalizado: limite e preço contratados manualmente.
- Plano define recursos padrão; administrador SaaS pode substituir por empresa.
- Master continua representado pelo papel TENANT_ADMIN; Supervisores têm permissões individuais persistidas e auditadas.
- Sem transmissão de e-mail. SMTP/POP3 são apenas configuração protegida para uso futuro.
- Modelo: Proposta_REALENERGY_atualizada.docx fornecido pelo usuário; substituir identificadores do cliente por marcadores antes de versionar.

## Entregas e verificação

- [ ] Migração 016: planos comerciais, contratos, exceções por empresa, permissões, propostas e arquivos versionados.
- [ ] Regras de recursos e limites na API, com testes de sobrescrita, papéis e validação.
- [ ] Rotas de administração de clientes/contratos, planos, supervisores e auditoria com CSV.
- [ ] Modelo DOCX com variáveis, geração DOCX/PDF, histórico e conversão transacional idempotente em cliente.
- [ ] Configurações SMTP/POP3 cifradas, sem conexões ou envio de mensagens.
- [ ] Painel SaaS exclusivo e navegação de Master/Supervisor conforme permissões.
- [ ] Testes de autorização, limites, documentos, conversão, UI e regressões; build API/web; documentação e comandos Ubuntu.
- [ ] Commit e push no GitHub incluindo melhorias de carregamento e alertas de horas extras anteriores.

## Padrões comerciais iniciais

Essencial e Profissional iniciam sem WhatsApp e sem filiais. Corporativo permite ambos. Recursos operacionais existentes ficam habilitados por padrão; planos antigos são preservados. Limite de filiais conta apenas unidades adicionais à matriz e pode ser definido pelo administrador. Nenhuma assinatura existente muda de preço automaticamente.
