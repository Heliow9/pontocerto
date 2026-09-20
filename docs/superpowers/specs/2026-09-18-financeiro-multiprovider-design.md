# Financeiro SaaS Multi-Provedor — Design Final

**Data:** 18/09/2026  
**Escopo aprovado:** evoluir o Financeiro SaaS para uma camada multi-provedor com **Cora, Efí Bank e Mercado Pago**, sem Banco Inter, permitindo ao SUPER_ADMIN definir um **provedor padrão global** e um **método de pagamento padrão global** para novas cobranças automáticas. Cobranças avulsas podem sobrescrever ambos no momento da emissão.

## 1. Objetivo

Manter as regras financeiras já definidas no Ponto Certo e desacoplar emissão, consulta, cancelamento, webhook e reconciliação de qualquer provedor específico.

Regras financeiras preservadas:

- Tipos de cobrança: `MONTHLY`, `IMPLEMENTATION`, `AD_HOC`.
- Mensalidades com vencimento somente nos dias 5, 10 ou 15.
- Geração automática das mensalidades no dia 1 de cada mês.
- Tolerância fixa de 3 dias corridos antes do bloqueio financeiro.
- Exceção administrativa de bloqueio: +5, +10, +30 dias ou data personalizada.
- Baixa automática por webhook e reconciliação.
- Desbloqueio automático somente quando não existir outra cobrança bloqueante.
- Histórico/auditoria financeira preservado.
- Toda cobrança e todo recebimento identifica explicitamente o provedor e o método usados.
- Relatórios e exportações permitem filtrar e agrupar por provedor e método.

A parte fiscal/NFS-e continua fora deste escopo.

## 2. Provedores suportados

A aplicação suportará exclusivamente:

- `CORA`
- `EFI`
- `MERCADO_PAGO`

O Banco Inter será removido como integração, opção de configuração, webhook e provider selecionável.

Somente um provedor pode ser o **provedor padrão global** por vez.

A alteração do provedor padrão afeta somente novas cobranças. O campo `financial_charges.provider` é imutável depois da criação da cobrança, salvo uma cobrança `DRAFT` que nunca tenha sido enviada a nenhum provedor.

Exemplo:

```text
01/10: EFI é o padrão → cobrança #1001 criada com provider=EFI
02/10: admin troca o padrão para CORA
02/10: cobrança #1002 criada com provider=CORA

#1001 continua sendo consultada/reconciliada pela Efí.
#1002 continua sendo consultada/reconciliada pela Cora.
```

Um provider pode deixar de ser o padrão para novas cobranças e ainda continuar habilitado para conciliar cobranças antigas.

### 2.1 Migração do código atual do Inter

A implementação anterior do Inter será removida da aplicação ativa:

- remover tela e rotas administrativas específicas do Inter;
- remover `InterProvider`/`InterBillingService` e chamadas do worker;
- remover webhook do Inter;
- remover variáveis `INTER_*` da documentação e exemplos de ambiente;
- remover Inter dos filtros e seletores do frontend;
- não criar novas cobranças Inter.

Se existirem registros históricos `provider='INTER'` no banco, eles poderão ser preservados apenas como dados históricos somente leitura para integridade de auditoria. Isso não representa manutenção do Banco Inter como provider: não haverá emissão, consulta remota, webhook, reconciliação ou configuração Inter.

## 3. Método de pagamento padrão global

Criar configuração global:

```ts
type PaymentMethodCode = "HYBRID" | "PIX" | "BOLETO";
```

Opções exibidas ao SUPER_ADMIN:

- `HYBRID` → **Boleto + Pix**
- `PIX` → **Pix**
- `BOLETO` → **Boleto**

O método padrão é único para todo o SaaS.

### 3.1 Aplicação do padrão por tipo de cobrança

**Mensalidade (`MONTHLY`)**

- usa obrigatoriamente o provedor padrão global no instante da criação;
- usa obrigatoriamente o método padrão global no instante da criação;
- ambos são persistidos na cobrança e não mudam se a configuração global mudar depois.

**Implantação (`IMPLEMENTATION`)**

- usa obrigatoriamente o provedor padrão global;
- usa obrigatoriamente o método padrão global;
- ambos são persistidos na cobrança.

**Avulsa (`AD_HOC`)**

- o formulário permite escolher manualmente o provedor;
- o formulário permite escolher manualmente o método;
- o formulário inicia pré-selecionado com os padrões globais para agilizar o uso;
- o SUPER_ADMIN pode alterá-los antes de confirmar a cobrança;
- depois de emitida, provider e método ficam imutáveis.

### 3.2 Compatibilidade de método x provider

A interface deve conhecer as capacidades de cada provider e impedir combinações inválidas.

- Cora: `HYBRID`, `PIX`, `BOLETO` quando suportados/ativados na conta.
- Efí: `HYBRID` (Bolix), `PIX`, `BOLETO` quando suportados/ativados na aplicação.
- Mercado Pago: `PIX` e `BOLETO`; `HYBRID` não será apresentado como disponível.

Se o SUPER_ADMIN trocar o provider padrão para um provider que não suporta o método padrão atual, a troca deve exigir simultaneamente um método compatível. Nunca haverá fallback silencioso.

## 4. Capacidades por provedor

### 4.1 Cora

Integração Direta da Cora.

- Autenticação com `client_id`, certificado e private key conforme modalidade de Integração Direta.
- Token de acesso usado junto com mTLS nas APIs transacionais.
- Emissão de boleto com QR Code Pix usando `payment_forms: ["BANK_SLIP", "PIX"]`.
- Emissão de Pix usando `payment_forms: ["PIX"]`.
- Emissão de boleto tradicional usando `payment_forms: ["BANK_SLIP"]` quando suportada pelo endpoint/conta.
- `Idempotency-Key` persistente por cobrança.
- Retorno normalizado com ID da invoice, linha digitável, PDF/documento, Pix copia-e-cola e QR Code quando disponíveis.
- Webhook de `invoice` com gatilho de pagamento.
- Consulta confirmatória da invoice antes da baixa definitiva quando disponível.

Observação operacional: para o QR Pix no boleto híbrido, a conta precisa ter chave Pix cadastrada; se o provider não retornar QR Code, a aplicação não fabricará um QR Code por conta própria.

### 4.2 Efí Bank

Integração pela API Cobranças Efí e API Pix quando o método escolhido exigir Pix avulso.

- Autenticação conforme credenciais da aplicação Efí.
- Emissão `HYBRID` via **Bolix®**, com código de barras + QR Code Pix na mesma cobrança.
- Emissão `BOLETO` via cobrança de boleto tradicional quando configurada.
- Emissão `PIX` via endpoint/fluxo Pix correspondente quando necessário.
- Retorno normalizado com `charge_id`, linha digitável, link da cobrança, PDF, Pix copia-e-cola e QR Code quando disponíveis.
- Notificação/webhook normalizado e consulta confirmatória antes da baixa definitiva.
- Separar internamente credenciais/fluxos da API Cobranças e da API Pix se a Efí exigir isso, mantendo uma interface única para o Financeiro.

### 4.3 Mercado Pago

Mercado Pago participa do mesmo Financeiro, mas não será tratado como boleto híbrido.

- Autenticação por Access Token no backend.
- `X-Idempotency-Key` persistente por cobrança.
- `PIX` e `BOLETO` são métodos suportados e podem exigir fluxos/objetos distintos.
- `HYBRID` é incapacidade explícita (`hybridBoletoPix = false`).
- O adaptador normaliza Pix e boleto para a mesma `financial_charge` local.
- Webhook com validação da assinatura/segredo disponível e consulta da transação antes da baixa.
- Quando existir URL hospedada de pagamento, persistir em `provider_payment_url`.
- Se não houver PDF direto de boleto, o frontend somente exibe URL/documento realmente retornado pelo provider.

## 5. Interface comum de provedor

Criar contrato único:

```ts
export type PaymentProviderCode = "CORA" | "EFI" | "MERCADO_PAGO";
export type PaymentMethodCode = "HYBRID" | "PIX" | "BOLETO";

export type ProviderCapabilities = {
  pix: boolean;
  boleto: boolean;
  hybridBoletoPix: boolean;
  pdf: boolean;
  hostedCheckout: boolean;
  webhook: boolean;
};

export type ProviderIssueResult = {
  provider: PaymentProviderCode;
  requestedMethod: PaymentMethodCode;
  providerChargeId: string;
  status: "OPEN" | "PAID" | "PROCESSING";
  paymentUrl?: string | null;
  pdfUrl?: string | null;
  barcode?: string | null;
  digitableLine?: string | null;
  pixCopyPaste?: string | null;
  pixQrCode?: string | null;
  raw: unknown;
};

export type ProviderChargeSnapshot = ProviderIssueResult & {
  paidAt?: string | null;
  confirmedPaymentMethod?: "PIX" | "BOLETO" | "OTHER" | null;
  providerPaymentId?: string | null;
  providerFee?: number | null;
  netAmount?: number | null;
};

export interface PaymentProvider {
  code: PaymentProviderCode;
  capabilities(): ProviderCapabilities;
  connectionStatus(): Promise<ProviderConnectionStatus>;
  testConnection(): Promise<ProviderConnectionTest>;
  issue(input: ProviderIssueInput): Promise<ProviderIssueResult>;
  getCharge(
    providerChargeId: string,
    externalReference: string,
    requestedMethod: PaymentMethodCode
  ): Promise<ProviderChargeSnapshot | null>;
  cancel(providerChargeId: string): Promise<void>;
  getPdf?(providerChargeId: string): Promise<Buffer>;
}
```

Criar `PaymentProviderRegistry` responsável por:

- obter o provider padrão global para cobranças automáticas;
- obter o provider persistido em uma cobrança existente;
- validar se o método solicitado é compatível com o provider;
- impedir emissão se o provider não estiver habilitado/configurado;
- nunca usar outro provider silenciosamente como fallback;
- permitir reconciliação de provider não padrão para cobranças antigas.

## 6. Modelo de dados

Criar migration `022_financial_multi_provider.sql`.

### 6.1 `payment_provider_settings`

```text
provider                 VARCHAR(30) PK
is_default                TINYINT(1)
enabled                   TINYINT(1)
environment               ENUM('sandbox','production')
last_test_at              DATETIME NULL
last_test_status          ENUM('OK','ERROR','NEVER')
last_test_message         VARCHAR(500) NULL
created_at                DATETIME
updated_at                DATETIME
```

Seeds:

```text
CORA          enabled=0 is_default=0
EFI           enabled=0 is_default=0
MERCADO_PAGO  enabled=0 is_default=0
```

Nenhum provider deve ser forçado como padrão antes de estar configurado. Enquanto não houver provider padrão válido, emissão automática deve ficar bloqueada com mensagem administrativa clara, sem gerar cobrança remota.

A troca do provider padrão deve ser transacional e gerar auditoria com `from`, `to`, usuário e timestamp.

### 6.2 Configuração financeira global

Adicionar/persistir em tabela de configuração financeira existente ou nova `financial_settings`:

```text
default_payment_provider   VARCHAR(30) NULL
default_payment_method     ENUM('HYBRID','PIX','BOLETO') NULL
```

`default_payment_provider` deve apontar para provider habilitado e configurado.

Ao salvar, validar compatibilidade entre provider e método.

### 6.3 `financial_charges`

Provider aceito para novas cobranças:

```text
CORA | EFI | MERCADO_PAGO
```

Adicionar/padronizar:

```text
provider                 VARCHAR(30) NOT NULL
requested_payment_method ENUM('HYBRID','PIX','BOLETO') NOT NULL
provider_charge_id       VARCHAR(191) NULL
provider_payment_url     TEXT NULL
provider_pdf_url         TEXT NULL
barcode                   TEXT NULL
digitable_line            TEXT NULL
pix_copy_paste            LONGTEXT NULL
pix_qr_code               LONGTEXT NULL
idempotency_key           VARCHAR(100) NULL
```

Regras:

- `MONTHLY` e `IMPLEMENTATION` recebem provider e método globais no momento da criação;
- `AD_HOC` recebe provider e método escolhidos no formulário;
- mudar padrões globais nunca atualiza cobranças existentes;
- `provider_charge_id` representa o identificador remoto daquele provider;
- `idempotency_key` é único por tentativa lógica de emissão e reaproveitado em retry do mesmo envio.

### 6.4 `financial_payments`

Adicionar/padronizar:

```text
provider                 VARCHAR(30) NOT NULL
requested_payment_method ENUM('HYBRID','PIX','BOLETO') NOT NULL
payment_method           ENUM('PIX','BOLETO','OTHER','MANUAL') NOT NULL
provider_payment_id      VARCHAR(191) NULL
provider_fee             DECIMAL(12,2) NULL
net_amount               DECIMAL(12,2) NULL
```

`provider_payment_id` deve ser idempotente em conjunto com `provider` quando preenchido.

Pagamento manual usa `payment_method='MANUAL'` e não altera o provider original da cobrança.

### 6.5 `financial_webhook_events`

Providers aceitos:

```text
CORA | EFI | MERCADO_PAGO
```

A chave idempotente permanece `(provider,event_key)`.

## 7. Credenciais e segurança

Nenhum segredo será armazenado em `payment_provider_settings`, frontend, auditoria ou logs.

### Cora

```env
CORA_ENABLED=0
CORA_ENV=production
CORA_CLIENT_ID=
CORA_CERT_PATH=/opt/ponto-certo/secrets/cora.crt
CORA_KEY_PATH=/opt/ponto-certo/secrets/cora.key
CORA_WEBHOOK_URL=https://pontoocerto.duckdns.org/api/webhooks/cora
```

Se a modalidade/conta exigir segredo adicional, ele será mantido somente no `.env` e nunca persistido no frontend/banco.

### Efí

```env
EFI_ENABLED=0
EFI_ENV=production
EFI_CLIENT_ID=
EFI_CLIENT_SECRET=
EFI_CERT_PATH=/opt/ponto-certo/secrets/efi.p12
EFI_CERT_PASSWORD=
EFI_WEBHOOK_URL=https://pontoocerto.duckdns.org/api/webhooks/efi
```

Variáveis adicionais específicas da API Pix podem ser acrescentadas somente se necessárias para `payment_method=PIX`.

### Mercado Pago

```env
MP_ENABLED=0
MP_ENV=production
MP_ACCESS_TOKEN=
MP_WEBHOOK_SECRET=
MP_WEBHOOK_URL=https://pontoocerto.duckdns.org/api/webhooks/mercadopago
MP_RETURN_BASE_URL=https://pontoocerto.duckdns.org
```

`.gitignore` deve proteger:

```text
.env
.env.*
*.key
*.crt
*.pem
*.p12
*.pfx
secrets/
```

## 8. Emissão de cobrança

Fluxo comum:

1. determinar provider e método conforme o tipo de cobrança;
2. validar que o provider está habilitado/configurado;
3. validar que o método é suportado pelo provider;
4. criar/persistir `financial_charges` com provider, método e `idempotency_key` antes da chamada remota;
5. emitir via `registry.forCharge(charge).issue(...)`;
6. normalizar retorno e atualizar a cobrança;
7. registrar `CHARGE_ISSUED` com provider, método, providerChargeId e dados não sensíveis;
8. se falhar comprovadamente antes da criação remota, usar `FAILED`;
9. se houver timeout/resposta ambígua após o envio, manter `ISSUING` e reconciliar antes de permitir nova emissão.

Nunca reemitir automaticamente a mesma cobrança em outro provider.

## 9. Reconciliação e pagamento

`reconcileCharge(id)`:

1. lê `financial_charges.provider` e `requested_payment_method`;
2. resolve o adapter pelo registry;
3. consulta usando `provider_charge_id`/referência externa;
4. normaliza o status;
5. se pago, cria `financial_payments` com provider, método solicitado, método efetivamente usado, valor, tarifa e líquido quando disponíveis;
6. marca cobrança `PAID` e `paid_at`;
7. recalcula bloqueio do tenant.

Se um provider não retornar tarifa/líquido, os campos permanecem `NULL`; nunca estimar tarifa.

Em cobrança `HYBRID`, `requested_payment_method='HYBRID'` e o pagamento final registra `payment_method='PIX'` ou `payment_method='BOLETO'` conforme o canal realmente liquidado.

## 10. Webhooks

Rotas públicas separadas:

```text
POST /api/webhooks/cora
POST /api/webhooks/efi
POST /api/webhooks/mercadopago
```

Cada webhook terá parser/verificador isolado e produzirá evento normalizado.

O callback não marcará a cobrança como paga apenas por confiar no payload quando o provider permitir consulta confirmatória; ele dispara reconciliação com o provider.

### Cora

- persistir ID/chave do evento para idempotência;
- resolver invoice pela referência/ID;
- consultar invoice antes da baixa quando disponível.

### Efí

- validar o mecanismo de notificação previsto pela API usada;
- resolver `charge_id`/referência;
- consultar o status remoto antes da baixa definitiva quando disponível.

### Mercado Pago

- validar assinatura usando `MP_WEBHOOK_SECRET` quando configurado;
- extrair o ID/referência;
- consultar pagamento/order antes da baixa.

## 11. Worker

O worker será totalmente provider-agnostic.

Para cada cobrança `ISSUING`, `OPEN` ou `OVERDUE` elegível:

```text
provider = charge.provider
method = charge.requested_payment_method
adapter = registry.get(provider)
adapter.getCharge(...)
```

O provider padrão global não participa da reconciliação de cobrança existente.

Um provider que não seja mais o padrão continua disponível para reconciliar cobranças antigas enquanto estiver habilitado e suas credenciais existirem.

## 12. API administrativa

Rotas genéricas:

```text
GET  /saas/finance/settings
PUT  /saas/finance/settings/defaults
GET  /saas/finance/providers
GET  /saas/finance/providers/:provider/status
POST /saas/finance/providers/:provider/test
POST /saas/finance/providers/:provider/configure-webhook
```

`PUT /saas/finance/settings/defaults` aceita:

```json
{
  "provider": "CORA | EFI | MERCADO_PAGO",
  "paymentMethod": "HYBRID | PIX | BOLETO"
}
```

Valida:

- provider habilitado/configurado;
- compatibilidade de método;
- alteração auditada com valores anteriores e novos.

Criação avulsa recebe opcionalmente seleção explícita:

```json
{
  "provider": "CORA | EFI | MERCADO_PAGO",
  "paymentMethod": "HYBRID | PIX | BOLETO"
}
```

Para `AD_HOC`, os dois campos são obrigatórios no backend depois da resolução do formulário; o frontend pode pré-preencher os padrões globais.

Listagens financeiras recebem filtros opcionais:

```text
GET /saas/finance/charges?provider=EFI&paymentMethod=HYBRID
GET /saas/finance/receipts?provider=CORA&paymentMethod=PIX
GET /saas/finance/events?provider=MERCADO_PAGO
```

## 13. Interface SaaS

Criar/ajustar:

```text
Financeiro → Configurações
Financeiro → Provedores de pagamento
```

### 13.1 Configurações globais

```text
PROVEDOR PADRÃO
○ Cora
○ Efí Bank
○ Mercado Pago

MÉTODO PADRÃO
○ Boleto + Pix
○ Pix
○ Boleto

[ SALVAR CONFIGURAÇÕES ]
```

O método `Boleto + Pix` deve ser desabilitado/ocultado quando `Mercado Pago` estiver selecionado.

Se houver incompatibilidade entre provider/método, o botão salvar não deve prosseguir e o backend também rejeita a combinação.

### 13.2 Cards dos providers

Cada provider mostra:

- nome;
- badge `PADRÃO` quando selecionado;
- `Configurado`/`Não configurado`;
- ambiente;
- último teste;
- situação do webhook;
- capacidades (`Pix`, `Boleto`, `Boleto + Pix`, `PDF`, `Checkout hospedado`).

Ações:

- `Definir como padrão`;
- `Testar conexão`;
- `Configurar webhook` quando disponível por API;
- instrução quando o webhook precisar ser configurado no painel externo.

Nenhum segredo será exibido.

## 14. Nova cobrança avulsa

O modal/tela de `Nova cobrança avulsa` terá:

```text
Cliente
Descrição
Valor
Vencimento

Provedor
[ Cora | Efí Bank | Mercado Pago ]

Método
[ Boleto + Pix | Pix | Boleto ]

[ GERAR COBRANÇA ]
```

Comportamento:

- abre com provider e método globais pré-selecionados;
- o usuário pode trocar provider;
- ao trocar provider, recalcular métodos disponíveis;
- `HYBRID` nunca aparece como opção válida para Mercado Pago;
- antes da emissão, mostrar resumo final com provider/método escolhidos;
- após emissão, provider e método ficam imutáveis.

## 15. Cobranças, recebimentos, relatórios e dashboard

Toda linha de cobrança deve exibir:

```text
Provedor
Método solicitado
Status
```

Detalhe da cobrança:

```text
Provedor
Método solicitado
ID no provedor
Forma de pagamento confirmada
Valor bruto
Tarifa do provedor (quando disponível)
Valor líquido (quando disponível)
```

Filtros:

```text
Provedor:
Todos | Cora | Efí Bank | Mercado Pago

Método:
Todos | Boleto + Pix | Pix | Boleto
```

Dashboard adiciona agregações:

```text
recebidoPorProvider
recebidoPorMetodo
```

Relatórios/exportações financeiras incluem:

```text
provider
requested_payment_method
provider_charge_id
provider_payment_id
payment_method
provider_fee
net_amount
```

Eventos financeiros também carregam provider e método quando relacionados a cobrança/pagamento.

## 16. Tela do cliente bloqueado

A tela continua acessível quando o tenant está bloqueado financeiramente e deve explicitar:

```text
Processado por Cora
Processado por Efí Bank
Processado por Mercado Pago
```

E o método solicitado:

```text
Boleto + Pix
Pix
Boleto
```

Comportamento:

- `HYBRID`: exibir PDF/link, linha digitável e Pix quando retornados pelo provider;
- `PIX`: exibir QR Code/copia-e-cola quando retornados;
- `BOLETO`: exibir PDF/link/linha digitável quando retornados;
- Mercado Pago apresenta Pix e boleto conforme a cobrança efetivamente criada, sem rotular como híbrido.

A tela nunca fabrica QR Code, linha digitável ou PDF que o provider não tenha retornado.

## 17. Logs e auditoria

Registrar eventos como:

```text
FINANCE_DEFAULTS_UPDATED
CHARGE_CREATED
CHARGE_ISSUED
CHARGE_RECONCILED
PAYMENT_CONFIRMED
CHARGE_CANCELED
PROVIDER_TESTED
WEBHOOK_CONFIGURED
```

Cada evento relacionado a cobrança registra, quando aplicável:

```text
provider
requested_payment_method
provider_charge_id
payment_method confirmado
admin/user responsável
origem (UI | WORKER | WEBHOOK)
```

Troca de configuração global deve registrar explicitamente:

```text
provider anterior → provider novo
método anterior → método novo
```

## 18. Tratamento de erros

Princípios obrigatórios:

- nunca gerar uma segunda cobrança em outro provider como fallback automático;
- timeout depois do envio vira estado reconciliável (`ISSUING`/`PROCESSING`), não nova emissão;
- credenciais inválidas não derrubam o Financeiro inteiro; apenas marcam aquele provider como indisponível;
- provider padrão indisponível impede novas cobranças automáticas e gera alerta administrativo;
- cobranças existentes continuam sendo reconciliadas pelo provider de origem;
- payload bruto sensível nunca é gravado em log de aplicação;
- mensagens do provider são sanitizadas antes de exibir no frontend.

## 19. Testes obrigatórios

### Configuração global

- aceita somente `CORA`, `EFI`, `MERCADO_PAGO`;
- rejeita `HYBRID` com Mercado Pago;
- troca de provider/método é auditada;
- alteração de padrão não modifica cobrança existente.

### Cobranças automáticas

- mensalidade usa provider/método globais atuais;
- implantação usa provider/método globais atuais;
- geração automática no dia 1 mantém vencimentos 5/10/15;
- ausência de provider configurado impede emissão remota sem duplicidade.

### Cobrança avulsa

- inicia com padrões globais;
- permite alterar provider e método;
- opções de método mudam conforme capacidades do provider;
- seleção final é persistida e imutável após emissão.

### Providers

- Cora normaliza `HYBRID`, `PIX` e `BOLETO` conforme capacidades habilitadas;
- Efí normaliza Bolix, Pix e boleto;
- Mercado Pago normaliza Pix/boleto e declara `hybridBoletoPix=false`;
- todos respeitam idempotência;
- timeout ambíguo não causa reemissão.

### Webhooks e worker

- webhooks são idempotentes por `(provider,event_key)`;
- worker usa provider da cobrança e não o provider padrão atual;
- provider não padrão continua conciliando cobrança antiga;
- baixa registra provider, método solicitado e método efetivamente usado.

### Financeiro

- bloqueio em 3 dias permanece funcionando independentemente de provider;
- exceção +5/+10/+30/customizada permanece funcionando;
- pagamento confirmado remove bloqueio somente quando não existem outras pendências bloqueantes;
- relatórios e exportações incluem provider e método;
- tarifa/líquido só são persistidos quando realmente retornados pelo provider.

### Regressão/build

- testes financeiros atuais continuam passando após remoção do Inter;
- testes dos demais módulos continuam passando;
- `api`: TypeScript build sem erros;
- `web`: Vite/TypeScript build sem erros.

## 20. Critérios de aceite

A implementação é concluída quando:

1. Banco Inter não aparece em nenhuma configuração, emissão ou integração ativa.
2. Admin SaaS lista Cora, Efí Bank e Mercado Pago.
3. SUPER_ADMIN define um provider padrão global.
4. SUPER_ADMIN define um método padrão global compatível com o provider.
5. Mensalidade e implantação sempre usam os padrões vigentes no momento da criação.
6. Cobrança avulsa permite escolher provider e método manualmente.
7. Cobranças existentes preservam provider e método de origem após mudança dos padrões.
8. Cora emite boleto com Pix quando `HYBRID` estiver selecionado e a conta estiver apta.
9. Efí emite Bolix quando `HYBRID` estiver selecionado.
10. Mercado Pago oferece Pix e boleto sem ser rotulado como boleto híbrido.
11. Webhooks e worker são multi-provider e idempotentes.
12. Cobranças, recebimentos, dashboard, relatórios, eventos e exportações exibem provider e método.
13. Bloqueio/desbloqueio financeiro funciona independentemente do provider.
14. `provider_fee`/`net_amount` são persistidos somente quando retornados pelo provider.
15. Nenhum segredo é gravado em banco, frontend, log ou Git.
16. Builds da API e web e a suíte de regressão passam antes da entrega.

## 21. Fontes técnicas de referência para implementação

- Cora Integração Direta e autenticação: documentação oficial `developers.cora.com.br`.
- Cora emissão de boleto/QR Pix e webhooks: documentação oficial `developers.cora.com.br`.
- Efí API Cobranças/Bolix e API Pix: documentação oficial `dev.efipay.com.br`.
- Mercado Pago Pix/Boleto, credenciais e webhooks: documentação oficial `mercadopago.com.br/developers`.

A implementação deve validar novamente os endpoints e requisitos oficiais imediatamente antes de codificar cada adapter, evitando assumir comportamento de versões antigas das APIs.
