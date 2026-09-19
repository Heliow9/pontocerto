# API — Ponto Certo SaaS v0.4

Documentação principal da segurança do ponto: `API_V04.md`.

Módulos disponíveis:

- `/auth`
- `/companies`
- `/employees`
- `/schedules`
- `/locations`
- `/devices`
- `/time-entries`
- `/absences`
- `/holidays`
- `/calculations`
- `/reports`
- `/dashboard`
- `/settings`
- `/saas`

Toda operação de cliente é isolada por `tenant_id` obtido do JWT; o frontend não escolhe o tenant autorizado.
