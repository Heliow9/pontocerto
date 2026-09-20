# Arquitetura Multi-Tenant

## Regra principal

O backend é a única camada autorizada a decidir o tenant ativo.

Fluxo:

1. Usuário autentica.
2. JWT recebe `tenantId`.
3. Middleware valida o token.
4. Toda consulta operacional inclui `WHERE tenant_id = ?`.
5. IDs recebidos do cliente são sempre validados contra o tenant do token.

## Tenants e empresas

Um tenant pode ter uma ou várias empresas/CNPJs.

```text
Tenant
 ├── Company 1
 │   ├── Employees
 │   ├── Work schedules
 │   └── Time entries
 └── Company 2
     ├── Employees
     ├── Work schedules
     └── Time entries
```

## Papéis

- SUPER_ADMIN: administração do SaaS
- TENANT_ADMIN: administrador do cliente
- RH: cadastros, ajustes e relatórios
- GESTOR: equipe
- SUPERVISOR: acompanhamento
- FUNCIONARIO: próprio ponto

## Segurança

- Nunca confiar em `tenant_id` vindo do navegador/app.
- Senhas com bcrypt.
- JWT com segredo forte.
- Logs de auditoria em alterações sensíveis.
- Em produção, usar HTTPS.
- Se possível, restringir o acesso ao MySQL à API/servidor.
