# Financeiro SaaS Multi-Provedor V2

Esta versão do Ponto Certo utiliza exclusivamente **Cora, Efí Bank e Mercado Pago** como provedores ativos de pagamento. O Financeiro mantém Mensalidade, Implantação e Cobrança Avulsa, vencimentos mensais 5/10/15, tolerância de 3 dias, bloqueio/desbloqueio automático, exceções administrativas e conciliação.

## 1. Regras de seleção

Em **Admin SaaS > Financeiro > Provedores de Pagamento** existe um padrão global:

- Provedor: `CORA`, `EFI` ou `MERCADO_PAGO`.
- Método: `HYBRID` (Boleto + Pix), `PIX` ou `BOLETO`.

Mensalidades e Implantações sempre copiam o padrão global quando a cobrança é criada. Cobranças Avulsas permitem escolher provedor e método manualmente. Depois da emissão, provedor e método ficam vinculados à cobrança e não mudam quando o padrão global é alterado.

Capacidades:

- Cora: Boleto + Pix, Pix, Boleto.
- Efí Bank: Boleto + Pix (Bolix), Pix, Boleto.
- Mercado Pago: Pix ou Boleto; não existe método híbrido único nesta integração.

## 2. Deploy

Faça backup do MySQL antes da migração.

```bash
cd ~/ponto-certo/apps/api
npm install
npm run db:status
npm run db:migrate
npm run build
```

A migration desta versão é `022_financial_multi_provider.sql`.

Depois compile o frontend:

```bash
cd ../web
npm install
npm run build
```

Reinicie a API com o processo PM2 usado no seu servidor:

```bash
pm2 list
pm2 restart NOME_DA_API --update-env
pm2 logs NOME_DA_API --lines 100
```

## 3. Variáveis gerais

No `.env` da API:

```env
FINANCIAL_WORKER_ENABLED=1
```

Nunca coloque `.env`, certificados, chaves privadas, `.p12` ou `.pfx` no Git.

## 4. Cora

A Integração Direta da Cora usa Client ID e certificado/chave do ambiente da integração.

```env
CORA_ENABLED=1
CORA_ENV=production
CORA_CLIENT_ID=SEU_CLIENT_ID
CORA_CERT_PATH=/opt/ponto-certo/secrets/cora.crt
CORA_KEY_PATH=/opt/ponto-certo/secrets/cora.key
CORA_WEBHOOK_URL=https://SEU_DOMINIO_API/webhooks/cora
```

Proteja os arquivos no servidor:

```bash
chmod 600 /opt/ponto-certo/secrets/cora.crt
chmod 600 /opt/ponto-certo/secrets/cora.key
```

Depois use **Provedores de Pagamento > Cora > Testar conexão** e configure o webhook.

## 5. Efí Bank

Crie uma aplicação na Efí e obtenha Client ID e Client Secret. Para Pix, configure também o certificado da API Pix e uma chave Pix da conta.

```env
EFI_ENABLED=1
EFI_ENV=production
EFI_CLIENT_ID=SEU_CLIENT_ID
EFI_CLIENT_SECRET=SEU_CLIENT_SECRET
EFI_PIX_CERT_PATH=/opt/ponto-certo/secrets/efi.p12
EFI_PIX_CERT_PASSWORD=SENHA_DO_CERTIFICADO_SE_HOUVER
EFI_PIX_KEY=SUA_CHAVE_PIX
EFI_WEBHOOK_URL=https://SEU_DOMINIO_API/webhooks/efi
```

Proteja o certificado:

```bash
chmod 600 /opt/ponto-certo/secrets/efi.p12
```

O Boleto/Bolix usa a API de Cobranças. O Pix isolado usa a API Pix. Em seguida use **Efí Bank > Testar conexão** e **Configurar webhook**.

## 6. Mercado Pago

Crie/abra uma aplicação em **Suas integrações** do Mercado Pago e obtenha o Access Token de produção. Cadastre o webhook de pagamentos e copie a assinatura secreta.

```env
MP_ENABLED=1
MP_ENV=production
MP_ACCESS_TOKEN=SEU_ACCESS_TOKEN
MP_WEBHOOK_SECRET=SEU_WEBHOOK_SECRET
MP_WEBHOOK_URL=https://SEU_DOMINIO_API/webhooks/mercadopago
MP_BOLETO_PAYMENT_METHOD_ID=bolbradesco
```

O Mercado Pago oferece Pix e Boleto separadamente nesta integração. A aplicação impede selecionar `Boleto + Pix` como um único método híbrido para esse provedor.

## 7. Webhooks

Endpoints públicos HTTPS:

```text
POST /webhooks/cora
POST /webhooks/efi
POST /webhooks/mercadopago
```

O webhook não baixa uma cobrança local apenas com base no payload recebido. O Financeiro localiza a cobrança e faz a reconciliação com o provedor antes da confirmação definitiva sempre que a API do provedor permite consulta.

## 8. Primeiro teste recomendado

1. Configure apenas um provedor.
2. Clique em **Testar conexão**.
3. Defina o provedor e o método padrão global.
4. Gere uma **Cobrança Avulsa** pequena com vencimento futuro.
5. Confirme no Ponto Certo o provider, método, QR/Pix ou boleto retornado.
6. Faça o pagamento de teste.
7. Confirme a chegada do webhook e a mudança para `PAGA`.
8. Verifique o recebimento, o relatório e o desbloqueio automático.
9. Só depois habilite o mesmo fluxo para mensalidades automáticas.

## 9. Relatórios

Cobranças e recebimentos exibem e filtram por provedor/método. Os relatórios CSV estão disponíveis na tela e nos endpoints:

```text
GET /api/saas/finance/reports/charges.csv
GET /api/saas/finance/reports/receipts.csv
```

Os arquivos registram o provedor de origem. Recebimentos incluem tarifa e valor líquido quando a API do provedor disponibiliza esses valores.

## 10. Segurança

O `.gitignore` desta versão bloqueia `.env`, `.key`, `.crt`, `.pem`, `.p12`, `.pfx` e pastas `secrets/`. As credenciais ficam somente no backend. O frontend recebe apenas estado de configuração, capacidades e status de teste, nunca os segredos.

---

## Evolução V3 — Pagadores e envio de cobranças por e-mail

A partir da V3, **pagador** e **Cliente SaaS (tenant)** são conceitos separados no domínio financeiro.

### Cobrança avulsa externa

`AD_HOC` pode ser emitida para uma PF/PJ que não possui conta no Ponto Certo. Nesse cenário:

- `payer_source = EXTERNAL`;
- `tenant_id = NULL`;
- os dados do pagador são armazenados como snapshot na cobrança;
- a cobrança não participa de inadimplência/bloqueio de tenants.

Mensalidades e implantação continuam usando `payer_source = TENANT` e exigem `tenant_id`.

### Cadastro financeiro do tenant

`saas_billing_profiles` passa a concentrar dados de faturamento, endereço e responsável financeiro. O envio automático de cobranças por e-mail vem habilitado por padrão e pode ser desativado por cliente ou na criação da cobrança.

### Snapshot e providers

Cora, Efí e Mercado Pago recebem os dados normalizados do snapshot persistido em `financial_charges`. Alterar o cadastro mestre depois não altera uma cobrança já criada.

Para boleto Mercado Pago, a validação exige e-mail e endereço completo antes da chamada ao provider. Pix não exige endereço completo.

### E-mail e histórico

Depois que o provider retorna com sucesso e seus artefatos são persistidos, o serviço financeiro pode enviar a cobrança via SMTP. Falha de e-mail não altera o estado monetário nem causa reemissão. Reenvios manuais usam a mesma cobrança e todas as tentativas ficam em `financial_charge_deliveries`.

### Migration

Aplicar:

```text
023_financial_payers_and_delivery.sql
```

Consulte `CHANGELOG_FINANCEIRO_PAGADORES_EMAIL_V3.md` para o procedimento completo de deploy e smoke test.
