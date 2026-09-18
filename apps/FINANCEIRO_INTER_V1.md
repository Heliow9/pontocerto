# Financeiro SaaS + Banco Inter — V1

## Escopo desta versão

Esta versão adiciona o módulo financeiro da Administração SaaS sem automação fiscal/NFS-e.

Tipos de cobrança:

- `MONTHLY`: mensalidade recorrente com vencimento nos dias 5, 10 ou 15; geração automática no dia 1 de cada mês.
- `IMPLEMENTATION`: implantação, cobrança única.
- `AD_HOC`: cobrança avulsa, com valor, descrição e vencimento definidos no momento da criação.

Regras principais:

- tolerância padrão de 3 dias corridos depois do vencimento;
- bloqueio financeiro independente de `tenants.status`;
- exceções administrativas de +5, +10, +30 dias ou data personalizada;
- baixa por conciliação com a API Cobrança (Boleto com Pix) do Banco Inter;
- webhook idempotente;
- pagamento confirmado libera automaticamente o acesso quando não existem outras cobranças bloqueantes;
- mensalidade nunca é duplicada para o mesmo tenant/competência.

## Arquivos do Banco Inter

A integração usa quatro informações privadas:

- `ClientId`;
- `ClientSecret`;
- certificado `.crt`;
- chave privada `.key`.

Não coloque `.crt`, `.key` nem o `ClientSecret` no Git. O `.gitignore` desta versão já ignora certificados e pastas `secrets`.

## Local recomendado no servidor

Exemplo Linux/Lightsail:

```bash
sudo mkdir -p /opt/ponto-certo/secrets
sudo chown -R $USER:$USER /opt/ponto-certo/secrets
chmod 700 /opt/ponto-certo/secrets
```

Copie os arquivos entregues pelo Inter para:

```text
/opt/ponto-certo/secrets/inter.crt
/opt/ponto-certo/secrets/inter.key
```

Depois:

```bash
chmod 600 /opt/ponto-certo/secrets/inter.crt
chmod 600 /opt/ponto-certo/secrets/inter.key
```

O usuário que executa o processo PM2 da API precisa ter permissão de leitura nesses dois arquivos.

## Variáveis da API

Acrescente ao arquivo `api/.env` do servidor:

```env
FINANCIAL_WORKER_ENABLED=1

INTER_ENABLED=1
INTER_ENV=production
INTER_CLIENT_ID=COLE_AQUI_O_CLIENT_ID
INTER_CLIENT_SECRET=COLE_AQUI_O_CLIENT_SECRET
INTER_CERT_PATH=/opt/ponto-certo/secrets/inter.crt
INTER_KEY_PATH=/opt/ponto-certo/secrets/inter.key

# Só preencher se a integração exigir identificação explícita de uma conta corrente.
INTER_ACCOUNT=

# Prazo bancário da cobrança. Não é a tolerância de acesso do Ponto Certo.
INTER_BILLING_CANCEL_DAYS=30

# Use a URL HTTPS pública que chega na API Node.
INTER_WEBHOOK_URL=https://SEU_DOMINIO_DA_API/webhooks/inter/billing
```

Se seu Nginx publicar a API sob um prefixo como `/api`, o webhook precisa incluir esse prefixo, por exemplo:

```text
https://SEU_DOMINIO/api/webhooks/inter/billing
```

Não use `localhost`, IP privado ou HTTP no webhook de produção.

## Publicação no servidor

Antes da atualização, faça backup do banco MySQL.

Na pasta da API:

```bash
cd apps/api
npm install
npm run db:status
npm run db:migrate
npm run build
```

A migração nova é:

```text
api/sql/021_financial_billing.sql
```

Ela cria as tabelas:

- `saas_billing_profiles`
- `financial_charges`
- `financial_payments`
- `financial_access_exceptions`
- `financial_webhook_events`
- `financial_events`

No web:

```bash
cd ../web
npm install
npm run build
```

Depois publique o `web/dist` da mesma maneira usada atualmente no Ponto Certo e reinicie a API com o nome real do processo PM2:

```bash
pm2 list
pm2 restart NOME_DO_PROCESSO_API --update-env
pm2 logs NOME_DO_PROCESSO_API --lines 100
```

## Primeira ativação no Ponto Certo

1. Entre como `SUPER_ADMIN`.
2. Abra **Financeiro > Banco Inter**.
3. Confirme que o certificado e a chave aparecem como encontrados.
4. Clique em **Testar conexão**.
5. Configure/cadastre o webhook usando a URL definida em `INTER_WEBHOOK_URL`.
6. Abra o cliente no Financeiro e escolha vencimento 5, 10 ou 15.
7. Antes do primeiro boleto, confira os dados cadastrais da empresa matriz: razão social, CNPJ, endereço, cidade, UF e CEP.
8. Gere uma cobrança de teste de baixo valor e confirme boleto, Pix, retorno do webhook e baixa antes de ativar cobranças em lote.

## Fluxo de cobrança

```text
Ponto Certo cria cobrança
        ↓
API Inter aceita solicitação
        ↓
Cobrança local fica ISSUING enquanto o Inter processa
        ↓
worker/reconciliação consulta o resultado
        ↓
OPEN / OVERDUE
        ↓
cliente paga por boleto ou Pix
        ↓
Webhook Inter
        ↓
Ponto Certo reconcilia com a API do Inter
        ↓
PAID
        ↓
Acesso liberado se não houver outra pendência bloqueante
```

A API Cobrança do Inter é assíncrona. Por isso uma emissão aceita não é repetida imediatamente quando a consulta ainda não encontra a cobrança; o worker fará a reconciliação para evitar boleto duplicado.

## Worker financeiro

Com `FINANCIAL_WORKER_ENABLED=1`, o worker inicia junto com a API e executa periodicamente. Ele:

- marca cobranças vencidas;
- no dia 1 gera a mensalidade da competência atual para clientes habilitados;
- reconcilia emissões que ficaram em estado ambíguo/processando;
- tenta reprocessar callbacks com falha;
- sincroniza o status financeiro de acesso.

## Segurança

- Nunca commitar `api/.env`.
- Nunca commitar `.key`, `.crt`, `.pem`, `.p12` ou `.pfx`.
- Nunca exibir `INTER_CLIENT_SECRET` em tela, log ou endpoint.
- Guarde uma cópia segura das credenciais originais fora do servidor.
- Ao trocar/renovar o certificado, substitua os arquivos e reinicie o processo PM2.

## Verificação feita neste pacote

Os testes unitários financeiros, webhook, worker, acesso e integração core foram executados com sucesso, além dos testes de regressão existentes do AutoPonto e do módulo de e-mail.

O build completo da API e do web deve ser executado no servidor depois de `npm install`. O ambiente usado para empacotamento não tinha todas as dependências do projeto disponíveis localmente e não tinha acesso ao registry NPM para reinstalá-las.
