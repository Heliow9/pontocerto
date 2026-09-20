# Ponto Certo — Pagadores, Cadastro Financeiro e Envio de Cobranças por E-mail

**Data:** 19/09/2026  
**Status:** Especificação para aprovação  
**Base:** `ponto-certo-dashboard-mascaras-uiux-v1.zip`

## 1. Objetivo

Evoluir o Financeiro do Ponto Certo para que:

1. todo Cliente SaaS tenha dados completos de faturamento, endereço e responsável financeiro;
2. cobranças avulsas possam ser emitidas tanto para um Cliente SaaS quanto para qualquer pagador externo, sem criar tenant;
3. toda cobrança guarde um snapshot imutável do pagador usado na emissão;
4. cobranças emitidas possam ser enviadas automaticamente por e-mail usando o SMTP já configurado no Ponto Certo;
5. a cobrança possa ser reenviada manualmente, com histórico de tentativas e resultados;
6. cobranças de pagadores externos nunca participem do bloqueio de acesso do SaaS.

## 2. Princípios do desenho

- `tenant` continua sendo a identidade de um cliente SaaS, não um cadastro genérico de pagadores.
- O cadastro financeiro do Cliente SaaS fica no perfil financeiro do tenant, evitando ambiguidade com empresas/filiais existentes no módulo operacional.
- Cobrança avulsa externa não cria tenant, usuário, empresa ou assinatura.
- Dados do pagador são copiados para a cobrança no momento da criação; alterações futuras no cadastro não modificam cobranças antigas.
- Mensalidade e implantação permanecem obrigatoriamente vinculadas a um tenant.
- Cobrança avulsa pode ter `tenant_id = NULL`.
- Falha de e-mail não desfaz uma cobrança já emitida no provedor.
- SMTP existente é reutilizado; não haverá segundo servidor/configuração de e-mail.

## 3. Cadastro financeiro do Cliente SaaS

O `saas_billing_profiles` passa a representar também o cadastro mestre de faturamento do Cliente SaaS.

### 3.1 Dados empresariais

- `billing_legal_name` — Razão Social
- `billing_trade_name` — Nome Fantasia
- `billing_document` — CNPJ ou CPF, armazenado normalizado (somente dígitos)
- `billing_email` — e-mail principal de faturamento
- `billing_phone` — telefone de faturamento normalizado

### 3.2 Responsável financeiro

- `financial_contact_name`
- `financial_contact_document` — CPF, normalizado
- `financial_contact_email`
- `financial_contact_phone`

O destinatário padrão das cobranças será `financial_contact_email`. Se estiver vazio, o sistema poderá usar `billing_email` como fallback, mas o painel deverá indicar que o responsável financeiro está incompleto.

### 3.3 Endereço de faturamento

- `billing_zip_code`
- `billing_street`
- `billing_number`
- `billing_complement`
- `billing_district`
- `billing_city`
- `billing_state`

### 3.4 Preferência de envio

- `auto_email_charges TINYINT(1) NOT NULL DEFAULT 1`

A preferência vem **ativada por padrão** para todos os Clientes SaaS.

## 4. Cobrança avulsa e tipos de pagador

Ao selecionar `Cobrança avulsa`, o modal passa a exibir:

### Pagador

- `Cliente SaaS`
- `Pagador avulso`

### 4.1 Cliente SaaS

O usuário seleciona o tenant. O sistema carrega automaticamente o perfil financeiro completo.

Os dados exibidos no modal são uma prévia do pagador que será enviado ao provedor.

Se o meio de pagamento exigir dados ausentes — por exemplo, endereço completo para boleto Mercado Pago — o botão de emissão fica bloqueado e a UI informa exatamente quais campos precisam ser preenchidos no cadastro do Cliente SaaS.

### 4.2 Pagador avulso

Nenhum tenant é criado. O usuário informa diretamente:

- Tipo de pessoa: PF / PJ
- Nome / Razão Social
- CPF / CNPJ
- E-mail
- Telefone
- CEP
- Logradouro
- Número
- Complemento
- Bairro
- Cidade
- UF

Máscaras existentes do projeto devem ser reutilizadas para CPF, CNPJ, telefone e CEP.

## 5. Snapshot do pagador na cobrança

`financial_charges` passa a aceitar `tenant_id NULL` apenas quando `type='AD_HOC'`.

Campos novos:

- `payer_source ENUM('TENANT','EXTERNAL') NOT NULL`
- `payer_person_type ENUM('PF','PJ') NOT NULL`
- `payer_name VARCHAR(190) NOT NULL`
- `payer_document VARCHAR(20) NOT NULL`
- `payer_email VARCHAR(190) NULL`
- `payer_phone VARCHAR(30) NULL`
- `payer_zip_code VARCHAR(12) NULL`
- `payer_street VARCHAR(190) NULL`
- `payer_number VARCHAR(30) NULL`
- `payer_complement VARCHAR(120) NULL`
- `payer_district VARCHAR(120) NULL`
- `payer_city VARCHAR(120) NULL`
- `payer_state CHAR(2) NULL`
- `send_email_after_issue TINYINT(1) NOT NULL DEFAULT 1`

Para cobranças existentes, a migration fará backfill do snapshot a partir dos dados disponíveis do tenant/empresa quando possível; registros antigos incompletos continuam consultáveis e não são reemitidos automaticamente.

## 6. Integridade de tenant em pagamentos e eventos

Como cobranças externas não possuem tenant:

- `financial_payments.tenant_id` passa a aceitar `NULL`;
- `financial_events.tenant_id` passa a aceitar `NULL`;
- índices e consultas devem continuar funcionando para registros com tenant;
- `financial_access_exceptions` permanece obrigatoriamente vinculada a tenant, pois não faz sentido para pagador externo.

Qualquer rotina de bloqueio financeiro deve conter condição explícita `tenant_id IS NOT NULL`.

## 7. Regras por tipo de cobrança

### Mensalidade

- tenant obrigatório;
- usa perfil financeiro do Cliente SaaS;
- usa provedor/método padrão global;
- participa de atraso e bloqueio;
- envio automático segue `auto_email_charges`.

### Implantação

- tenant obrigatório;
- usa perfil financeiro do Cliente SaaS;
- usa provedor/método padrão global;
- participa das regras financeiras definidas para tenant;
- envio automático segue `auto_email_charges`.

### Avulsa para Cliente SaaS

- tenant preenchido;
- `payer_source='TENANT'`;
- provedor/método selecionáveis conforme regra já existente;
- snapshot vem do perfil financeiro;
- participa de bloqueio apenas se a regra de negócio atual da cobrança avulsa associada ao tenant assim determinar; a implementação deve preservar a regra atual e não ampliar bloqueio silenciosamente.

### Avulsa para Pagador Externo

- `tenant_id=NULL`;
- `payer_source='EXTERNAL'`;
- nunca bloqueia acesso ao Ponto Certo;
- não gera perfil de cobrança mensal;
- não gera assinatura/contrato/cliente SaaS.

## 8. Envio automático de cobrança

No modal de criação/emissão haverá:

`☑ Enviar cobrança por e-mail após emissão`

### Valor padrão

- Cliente SaaS: herdado de `saas_billing_profiles.auto_email_charges`, inicialmente `true`;
- Pagador externo: `true` por padrão.

Se o checkbox estiver marcado, um e-mail válido é obrigatório.

Se `Emitir imediatamente` estiver desmarcado, o envio automático não ocorre naquele momento; quando a cobrança for efetivamente emitida depois, o sistema respeita `send_email_after_issue`.

## 9. Conteúdo do e-mail

Assunto padrão:

`Ponto Certo | Cobrança disponível - Vencimento DD/MM/AAAA`

Corpo deve conter:

- saudação ao responsável financeiro/pagador;
- razão social/nome;
- descrição;
- valor;
- vencimento;
- provedor;
- forma de pagamento;
- link do boleto/pagamento quando disponível;
- linha digitável quando disponível;
- Pix Copia e Cola quando disponível;
- QR Code Pix quando o provedor retornar conteúdo seguro/renderizável;
- identificação do Ponto Certo.

Nesta etapa, não será criado um novo portal público de pagamento. O e-mail usa os artefatos/links retornados pelo provedor.

## 10. Serviço de e-mail

Reutilizar a configuração SMTP já existente em `saas_settings(setting_key='email')` e as rotinas de segurança/validação já usadas por propostas e contratos.

Criar serviço específico para Financeiro, sem acoplar cobrança a `commercial_email_deliveries`.

Comportamento:

1. cobrança é emitida no provedor;
2. artefatos de pagamento são persistidos;
3. tentativa de e-mail é executada;
4. se e-mail falhar, cobrança continua `OPEN`/estado financeiro apropriado;
5. falha fica registrada e pode ser reenviada.

## 11. Histórico de envios

Nova tabela `financial_charge_deliveries`:

- `id`
- `charge_id`
- `tenant_id NULL`
- `recipient_email`
- `cc_email NULL`
- `subject`
- `delivery_type ENUM('AUTO','MANUAL')`
- `status ENUM('PENDING','SENT','FAILED')`
- `smtp_message_id NULL`
- `error_message NULL`
- `sent_by NULL` — `NULL` para worker/automático
- `created_at`
- `sent_at NULL`

Cada tentativa gera um registro próprio; reenvio nunca sobrescreve o histórico anterior.

Também criar `financial_events` como `CHARGE_EMAIL_SENT` ou `CHARGE_EMAIL_FAILED` para auditoria resumida.

## 12. Reenvio manual

Na visualização da cobrança emitida:

- botão `Reenviar por e-mail`;
- destinatário preenchido com o snapshot da cobrança;
- campo editável;
- CC opcional;
- o reenvio usa a mesma cobrança e os mesmos dados de pagamento;
- não cria nova cobrança no provedor;
- toda tentativa entra no histórico.

## 13. UI/UX do cadastro do Cliente SaaS

No modal/página de Cliente SaaS, organizar em seções:

1. **Identificação**
2. **Plano e contrato**
3. **Dados de faturamento**
4. **Responsável financeiro**
5. **Endereço de faturamento**
6. **Preferências de cobrança**

Campos com máscaras devem usar os componentes compartilhados já introduzidos no projeto.

O cadastro não deve exigir endereço para criar o tenant se isso quebrar clientes legados; entretanto, a UI mostrará estado `Cadastro financeiro incompleto` e a emissão de métodos que exigem endereço será bloqueada até o preenchimento.

## 14. UI/UX da cobrança avulsa

Fluxo:

`Tipo: Cobrança avulsa` → `Pagador: Cliente SaaS | Pagador avulso`

### Cliente SaaS

- seletor de cliente;
- resumo visual de documento, e-mail financeiro, responsável e endereço;
- ação `Editar cadastro financeiro` quando incompleto.

### Pagador avulso

- formulário inline com PF/PJ;
- documento e endereço mascarados;
- sem necessidade de cadastrar tenant.

A validação deve explicar requisitos do provedor/método antes de chamar a API.

## 15. API

### Perfil financeiro do tenant

- `GET /api/saas/finance/tenants/:tenantId/profile`
  - passa a retornar cadastro financeiro e preferência de e-mail.

- `PUT /api/saas/finance/tenants/:tenantId/profile`
  - passa a salvar os novos campos com validação e normalização.

### Criar cobrança avulsa

`POST /api/saas/finance/charges/ad-hoc`

Aceita uma das formas:

```json
{
  "payerSource": "TENANT",
  "tenantId": 123,
  "amount": 5,
  "dueDate": "2026-09-19",
  "description": "Treinamento adicional",
  "provider": "MERCADO_PAGO",
  "paymentMethod": "BOLETO",
  "issue": true,
  "sendEmail": true
}
```

ou:

```json
{
  "payerSource": "EXTERNAL",
  "payer": {
    "personType": "PJ",
    "name": "Empresa Externa Ltda",
    "document": "12345678000190",
    "email": "financeiro@empresa.com.br",
    "phone": "81999999999",
    "zipCode": "50000000",
    "street": "Rua Exemplo",
    "number": "100",
    "complement": "Sala 3",
    "district": "Centro",
    "city": "Recife",
    "state": "PE"
  },
  "amount": 5,
  "dueDate": "2026-09-19",
  "description": "Treinamento adicional",
  "provider": "MERCADO_PAGO",
  "paymentMethod": "BOLETO",
  "issue": true,
  "sendEmail": true
}
```

### Reenvio

- `POST /api/saas/finance/charges/:id/send-email`

Body:

```json
{
  "to": "financeiro@empresa.com.br",
  "cc": "contabilidade@empresa.com.br"
}
```

### Histórico

- `GET /api/saas/finance/charges/:id/deliveries`

## 16. Validação por provedor

A validação deve acontecer no backend mesmo que a UI já tenha validado.

### Mercado Pago

- Pix: usar os requisitos mínimos reais aceitos pela integração;
- Boleto: endereço completo obrigatório conforme necessidade do provider adapter atual.

### Efí e Cora

O mesmo snapshot do pagador é passado aos adapters. Cada adapter é responsável por informar de forma clara quais campos obrigatórios faltam para o método selecionado.

Nenhum provider deve receber um tenant cru; recebe sempre o snapshot normalizado do pagador.

## 17. Segurança e privacidade

- Nunca registrar tokens/segredos do provedor em eventos ou e-mails.
- Documento deve ser mascarado nas telas e logs visuais, embora armazenado normalizado para integração.
- O payload bruto do provedor continua protegido pelas regras existentes do Financeiro.
- Reenvio exige autenticação de SUPER_ADMIN/SaaS Admin conforme o controle atual das rotas financeiras.
- Não permitir que usuário de tenant envie/reenvie cobrança de outro tenant.

## 18. Relatórios e listagens

A listagem de cobranças passa a mostrar `Pagador` a partir do snapshot, não somente `tenant_name`.

Exemplos:

| Pagador | Origem | Documento | Tipo | Provedor | Status |
|---|---|---|---|---|---|
| Real Energy Ltda | Cliente SaaS | 00.000.000/0001-00 | Mensalidade | Mercado Pago | Aberta |
| João da Silva | Avulso | 000.000.000-00 | Avulsa | Efí | Paga |

CSV/relatórios devem incluir:

- origem do pagador;
- nome;
- documento;
- e-mail;
- tenant quando existir;
- status de último envio de cobrança quando disponível.

## 19. Worker e automações

O worker de mensalidades deve:

1. criar cobrança com snapshot do perfil financeiro;
2. emitir no provedor padrão;
3. se `auto_email_charges=1`, enviar e-mail;
4. se o e-mail falhar, registrar falha sem cancelar emissão;
5. não ficar reemitindo cobrança por causa de falha de e-mail.

Nenhuma rotina automática de mensalidade deve considerar pagadores externos.

## 20. Migração e compatibilidade

Nova migration sugerida: `023_financial_payers_and_delivery.sql`.

A migration deve ser segura para instalações existentes:

- tornar `financial_charges.tenant_id` nullable;
- tornar `financial_payments.tenant_id` nullable;
- tornar `financial_events.tenant_id` nullable;
- adicionar campos de perfil e snapshot;
- criar `financial_charge_deliveries`;
- fazer backfill sem apagar registros;
- não alterar status de cobranças já existentes;
- não reenviar e-mails de cobranças antigas automaticamente.

## 21. Critérios de aceite

1. Cliente SaaS pode salvar razão social/CNPJ/endereço/responsável financeiro.
2. Campos de documento, telefone e CEP usam máscaras existentes e são normalizados na API.
3. Cobrança avulsa pode ser criada para Cliente SaaS ou Pagador Avulso.
4. Pagador avulso não cria tenant.
5. Boleto Mercado Pago para tenant usa endereço do perfil financeiro.
6. Boleto Mercado Pago para pagador externo usa endereço digitado no modal.
7. Cobrança externa persiste com `tenant_id=NULL` e nunca bloqueia qualquer tenant.
8. Snapshot permanece igual mesmo se o cadastro do Cliente SaaS for alterado depois.
9. `Enviar cobrança por e-mail após emissão` vem marcado por padrão.
10. E-mail é disparado somente depois de emissão bem-sucedida.
11. Falha de SMTP não desfaz a cobrança.
12. Reenvio manual não cria nova cobrança no provedor.
13. Histórico mostra cada tentativa de envio e seu resultado.
14. Mensalidades automáticas enviam cobrança quando a preferência do tenant estiver ativa.
15. Listagens e relatórios mostram pagador externo corretamente.
16. Fluxos existentes de Cora, Efí e Mercado Pago continuam usando o provider armazenado na própria cobrança.
