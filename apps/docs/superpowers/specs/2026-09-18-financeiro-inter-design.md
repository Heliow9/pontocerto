# Ponto Certo — Financeiro SaaS + Banco Inter

Data: 2026-09-18
Status: desenho aprovado em conversa, aguardando revisão deste documento antes da implementação.

## 1. Objetivo

Adicionar ao perfil SUPER_ADMIN do Ponto Certo um módulo financeiro próprio para gerir cobranças dos clientes SaaS, sem automatização fiscal/NFS-e nesta versão.

O módulo deve:
- emitir cobranças por Boleto com Pix via Banco Inter Empresas;
- gerir mensalidades recorrentes, implantação e cobranças avulsas;
- receber baixa automática por webhook;
- bloquear financeiramente o tenant após 3 dias corridos de atraso;
- liberar automaticamente quando não houver mais pendências bloqueantes;
- permitir exceção administrativa de 5, 10, 30 dias ou data personalizada sem marcar cobrança como paga;
- manter trilha completa de auditoria e eventos financeiros.

## 2. Escopo e regras de negócio

### 2.1 Tipos de cobrança

1. `MONTHLY` — Mensalidade
   - recorrente mensal;
   - vencimento permitido: dia 5, 10 ou 15;
   - uma cobrança por tenant e competência;
   - o valor é obtido do contrato comercial vigente (`tenant_contracts.price_monthly`, com fallback para `plans.price_monthly`);
   - geração automática no dia 1 da competência;
   - se o cliente for ativado após o dia 1, a competência corrente pode ser gerada manualmente pelo SUPER_ADMIN.

2. `IMPLEMENTATION` — Implantação
   - cobrança única;
   - valor sugerido a partir do contrato/proposta vigente (`implementation_fee`), mas editável antes da emissão;
   - vencimento definido no momento da geração;
   - emissão somente mediante ação explícita do SUPER_ADMIN.

3. `AD_HOC` — Cobrança avulsa
   - valor, descrição e vencimento informados no momento da geração;
   - emissão somente mediante ação explícita do SUPER_ADMIN.

### 2.2 Estados da cobrança

`DRAFT`, `ISSUING`, `OPEN`, `OVERDUE`, `PAID`, `CANCELED`, `FAILED`.

A cobrança vencida permanece `OVERDUE` mesmo quando houver liberação administrativa temporária.

### 2.3 Bloqueio financeiro

- tolerância padrão: 3 dias corridos após o vencimento;
- o tenant continua com `tenants.status='ACTIVE'`;
- inadimplência não altera `tenants.status`;
- o bloqueio é calculado a partir das cobranças vencidas e das exceções vigentes;
- qualquer cobrança `OPEN/OVERDUE` cuja data de bloqueio tenha sido atingida pode bloquear o tenant;
- o pagamento de uma cobrança não libera o tenant se existir outra pendência bloqueante;
- `subscriptions.status='PAST_DUE'` pode ser sincronizado para fins de apresentação comercial, mas não será a fonte única da regra de acesso.

### 2.4 Exceção administrativa

O SUPER_ADMIN poderá conceder:
- +5 dias;
- +10 dias;
- +30 dias;
- data personalizada.

Cada exceção registra:
- tenant;
- cobrança relacionada opcional;
- início e fim;
- motivo obrigatório;
- usuário SUPER_ADMIN responsável;
- data/hora;
- revogação, se houver.

A exceção não altera o status real da cobrança.

### 2.5 Boleto após vencimento

O prazo de bloqueio do Ponto Certo é independente do prazo de cancelamento bancário.

Configuração inicial:
- bloqueio do acesso: 3 dias corridos;
- `numDiasAgenda` do Inter: 30 dias, configurável no backend.

## 3. Integração com Banco Inter

### 3.1 Produto usado

API Cobrança (Boleto com Pix).

O Ponto Certo utilizará:
- OAuth2 com `client_id` e `client_secret`;
- certificado e chave privada da integração Inter;
- emissão de cobrança;
- consulta de cobrança;
- recuperação de PDF;
- cancelamento;
- webhook de cobrança.

### 3.2 Segredos

Os segredos não serão armazenados no frontend nem versionados no Git.

Variáveis propostas:
- `INTER_ENABLED`
- `INTER_ENV`
- `INTER_CLIENT_ID`
- `INTER_CLIENT_SECRET`
- `INTER_CERT_PATH`
- `INTER_KEY_PATH`
- `INTER_ACCOUNT` (opcional, somente se a integração tiver mais de uma conta)
- `INTER_BILLING_CANCEL_DAYS` (default 30)
- `INTER_WEBHOOK_URL`

O certificado `.crt` e a chave `.key` ficarão fora do repositório, em diretório protegido no servidor.

### 3.3 Token

Criar cache em memória do token OAuth respeitando sua validade, com margem de renovação. Não gerar token a cada requisição.

### 3.4 Webhook e segurança

Endpoint público dedicado ao callback do Inter.

Fluxo de processamento:
1. persistir o evento bruto com identificador idempotente;
2. localizar a cobrança local;
3. consultar a cobrança no Inter antes de efetivar baixa financeira;
4. validar identificadores, valor e situação;
5. registrar pagamento e origem (`BOLETO` ou `PIX`);
6. recalcular bloqueio financeiro do tenant;
7. registrar evento/auditoria.

Esse passo de reconciliação evita confiar exclusivamente no corpo de uma chamada recebida pela internet.

## 4. Modelo de dados

Nova migration SQL, preservando tabelas existentes.

### `saas_billing_profiles`
- `tenant_id` PK/FK
- `due_day` ENUM lógico 5/10/15
- `grace_days` default 3
- `auto_block_enabled`
- `auto_monthly_enabled`
- `inter_cancel_days` default 30
- `created_at`, `updated_at`

### `financial_charges`
- `id`
- `tenant_id`
- `type` (`MONTHLY`, `IMPLEMENTATION`, `AD_HOC`)
- `competence` nullable, `YYYY-MM` para mensalidade
- `description`
- `amount`
- `due_date`
- `block_at`
- `status`
- `provider` default `INTER`
- `provider_charge_id`
- `provider_your_number`
- `barcode`
- `digitable_line`
- `pix_copy_paste`
- `provider_payload_json`
- `issued_at`, `paid_at`, `canceled_at`
- `created_by`, `created_at`, `updated_at`

Índice único para impedir mensalidade duplicada por `tenant_id + type + competence`.

### `financial_payments`
- `id`
- `charge_id`
- `tenant_id`
- `provider_payment_id`
- `amount`
- `paid_at`
- `origin` (`BOLETO`, `PIX`, `MANUAL`)
- `payload_json`
- `created_at`

### `financial_access_exceptions`
- `id`
- `tenant_id`
- `charge_id` nullable
- `starts_at`
- `ends_at`
- `reason`
- `created_by`
- `revoked_at`, `revoked_by`
- `created_at`

### `financial_webhook_events`
- `id`
- `provider`
- `event_key` unique
- `account_reference`
- `payload_json`
- `received_at`
- `processed_at`
- `status`
- `error_message`

### `financial_events`
- `id`
- `tenant_id`
- `charge_id` nullable
- `event_type`
- `actor_user_id` nullable
- `details_json`
- `created_at`

## 5. Backend

### 5.1 Novos serviços

- `inter-billing.service.ts`: OAuth, mTLS, emissão, consulta, PDF, cancelamento e configuração de webhook.
- `financial.service.ts`: criação, emissão, status, pagamentos, exceções e consultas.
- `financial-access.service.ts`: cálculo de inadimplência/bloqueio/liberação.
- `financial-worker.service.ts`: mensalidades, marcação de vencidos, reconciliação e recuperação de falhas.

### 5.2 Novas rotas SUPER_ADMIN

Prefixo: `/saas/finance`

- `GET /dashboard`
- `GET /charges`
- `POST /charges/monthly`
- `POST /charges/implementation`
- `POST /charges/ad-hoc`
- `GET /charges/:id`
- `GET /charges/:id/pdf`
- `POST /charges/:id/cancel`
- `POST /charges/:id/reconcile`
- `GET /tenants/:id/profile`
- `PUT /tenants/:id/profile`
- `POST /tenants/:id/access-exceptions`
- `DELETE /access-exceptions/:id`
- `GET /receipts`
- `GET /events`
- `GET /inter/status`
- `POST /inter/test`
- `PUT /inter/webhook`

### 5.3 Rotas de autoatendimento do tenant

Prefixo: `/billing`

Somente `TENANT_ADMIN` recebe detalhes de valores/cobranças:
- `GET /self/status`
- `GET /self/charges`
- `GET /self/charges/:id/pdf`

Demais perfis recebem apenas estado genérico de indisponibilidade quando o tenant estiver bloqueado.

### 5.4 Webhook

- `POST /webhooks/inter/billing`

Sem JWT do Ponto Certo. Processamento idempotente e reconciliação com o Inter antes de dar baixa.

## 6. Controle de acesso

Criar middleware de bloqueio financeiro separado do `tenant.status`.

Com tenant bloqueado:
- SUPER_ADMIN continua operando normalmente;
- TENANT_ADMIN pode autenticar, ver a tela financeira e alterar a própria senha;
- outros usuários podem autenticar, mas recebem uma tela de indisponibilidade financeira sem valores;
- endpoints operacionais ficam bloqueados com código de erro estável `FINANCIAL_BLOCKED`;
- nenhum dado é apagado, desativado ou modificado por inadimplência.

A checagem ocorre em cada requisição autenticada, portanto sessões JWT já emitidas também passam a ser bloqueadas.

## 7. Worker financeiro

O projeto já possui workers iniciados em `api/src/server.ts`; o financeiro seguirá o mesmo padrão.

Rotina:
- execução inicial na subida;
- execução periódica em intervalo seguro;
- no dia 1, gerar mensalidades ausentes da competência;
- atualizar `OPEN -> OVERDUE` após vencimento;
- recalcular bloqueios;
- reconciliar cobranças em estado inconsistente ou eventos de webhook com falha;
- nunca duplicar mensalidade nem pagamento.

## 8. Frontend SUPER_ADMIN

Adicionar seção `Financeiro` ao `SaasPortal` com páginas:
- Dashboard Financeiro;
- Cobranças;
- Recebimentos;
- Inadimplentes;
- Banco Inter;
- Logs Financeiros.

Dashboard:
- recebido no mês;
- a receber;
- vencido;
- inadimplentes;
- tenants bloqueados;
- MRR contratual;
- recebimentos recentes.

A tela do cliente terá:
- situação financeira;
- vencimento da mensalidade 5/10/15;
- tolerância;
- histórico;
- implantação;
- cobrança avulsa;
- concessão/revogação de exceção.

## 9. Tela de bloqueio do tenant

Para TENANT_ADMIN:
- motivo;
- cobranças bloqueantes;
- valor e vencimento;
- Pix copia e cola;
- QR Code gerado localmente a partir do payload Pix;
- botão para baixar boleto;
- mensagem de liberação automática após confirmação.

Para demais perfis:
- mensagem genérica de indisponibilidade por pendência financeira;
- orientação para procurar o administrador da empresa;
- sem exposição de valores ou dados bancários.

## 10. Integração com o comercial existente

Preservar:
- `plans`;
- `subscriptions`;
- `tenant_contracts`;
- `commercial_proposals`;
- `commercial_contracts`;
- `tenants.status`.

O Financeiro consome o valor contratual, mas não substitui o módulo comercial.

`tenants.status='SUSPENDED'` continua reservado para suspensão administrativa.

## 11. Falhas e recuperação

- Falha ao emitir no Inter: cobrança `FAILED`, sem bloquear acesso por uma cobrança nunca emitida.
- Timeout após emissão: reconciliar pelo identificador antes de tentar novamente para evitar boleto duplicado.
- Webhook duplicado: ignorado por idempotência.
- Webhook fora de ordem: estado confirmado por consulta ao Inter.
- Inter indisponível: manter cobrança local e reprocessar posteriormente.
- Erro no worker não derruba a API.
- Pagamento parcial ou valor divergente: não dar baixa automática sem regra explícita; registrar para conciliação manual.

## 12. Auditoria

Registrar no audit existente e no ledger financeiro:
- criação/edição/emissão/cancelamento;
- baixa automática e manual;
- origem do pagamento;
- concessão/revogação de exceções;
- bloqueio e desbloqueio;
- alteração do vencimento 5/10/15;
- teste/configuração da integração Inter;
- falhas de webhook e reconciliação.

Segredos nunca entram em logs.

## 13. Testes mínimos obrigatórios

Backend:
- mensalidade única por competência;
- vencimentos 5/10/15;
- bloqueio exatamente após 3 dias corridos;
- exceções 5/10/30/customizada;
- pagamento de uma entre múltiplas pendências não libera indevidamente;
- pagamento da última pendência libera;
- webhook idempotente;
- reconciliação valida valor/identificador;
- falha no Inter não gera cobrança duplicada;
- segredo nunca é retornado pela API;
- tenant `SUSPENDED` administrativo continua funcionando separadamente.

Frontend:
- dashboard e filtros;
- criação dos 3 tipos;
- tela de exceção;
- tela de bloqueio TENANT_ADMIN;
- tela genérica para outros perfis;
- estados de loading/erro/vazio.

Verificação final:
- `npm run build` API;
- `npm run build` web;
- testes novos;
- testes/regressões existentes relevantes.

## 14. Fora do escopo desta versão

- emissão automática de NFS-e;
- integração fiscal;
- Pix Automático/mandatos recorrentes;
- cartão de crédito;
- contas a pagar;
- conciliação de extrato bancário geral;
- integração financeira direta dentro do PayHub.

O PayHub pode aparecer futuramente como produto/add-on cobrado por este Financeiro, sem misturar sua lógica funcional com o ledger de cobrança.

## 15. Sequência de entrega

1. Migration e domínio financeiro.
2. Cliente Inter e teste de conexão.
3. Emissão e consulta de cobrança.
4. Webhook + conciliação.
5. Regra de bloqueio/exceções.
6. Worker mensal.
7. APIs SUPER_ADMIN e tenant.
8. UI Financeiro SUPER_ADMIN.
9. UI de bloqueio/pagamento do tenant.
10. Testes e build completo.
11. Configuração de produção e cadastro do webhook no Inter.

