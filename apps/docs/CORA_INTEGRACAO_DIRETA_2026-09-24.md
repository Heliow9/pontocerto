# Cora — Integração Direta no Financeiro Ponto Certo

Data de revisão: 24/09/2026

## Escopo já suportado

O Financeiro multiprovedor já possui adaptador Cora para:

- Boleto + Pix (HYBRID): `payment_forms: ["BANK_SLIP", "PIX"]`;
- Pix: `payment_forms: ["PIX"]`;
- Boleto: `payment_forms: ["BANK_SLIP"]`;
- emissão em `/v2/invoices`;
- consulta por invoice id e recuperação por referência externa (`code`);
- cancelamento;
- PDF do boleto quando disponibilizado;
- cadastro remoto de webhook de invoice;
- conciliação confirmatória antes de baixar a cobrança local;
- processamento idempotente do webhook;
- preservação dos IDs enviados nos headers do webhook Cora para retry automático.

## Credenciais necessárias

Utilize a modalidade **Integração Direta** da Cora. A autenticação é mTLS + OAuth2 Client Credentials.

No servidor são necessários:

```env
CORA_ENABLED=1
CORA_ENV=production
CORA_CLIENT_ID=SEU_CLIENT_ID_DE_PRODUCAO
CORA_CERT_PATH=/opt/ponto-certo/secrets/cora/certificate.pem
CORA_KEY_PATH=/opt/ponto-certo/secrets/cora/private-key.key
CORA_WEBHOOK_URL=https://pontoocerto.duckdns.org/api/webhooks/cora
```

Não existe `CORA_CLIENT_SECRET` na Integração Direta usada por este projeto.

## Arquivos no Ubuntu

Diretório recomendado:

```bash
sudo mkdir -p /opt/ponto-certo/secrets/cora
sudo chown -R ubuntu:ubuntu /opt/ponto-certo/secrets/cora
sudo chmod 700 /opt/ponto-certo/secrets/cora
```

Copie os arquivos recebidos/gerados pela Cora para:

```text
/opt/ponto-certo/secrets/cora/certificate.pem
/opt/ponto-certo/secrets/cora/private-key.key
```

Proteja os arquivos:

```bash
chmod 600 /opt/ponto-certo/secrets/cora/certificate.pem
chmod 600 /opt/ponto-certo/secrets/cora/private-key.key
```

Nunca versionar esses arquivos no Git.

## Teste direto do token

Antes de testar pelo painel, valide o mTLS no servidor:

```bash
curl --cert /opt/ponto-certo/secrets/cora/certificate.pem \
  --key /opt/ponto-certo/secrets/cora/private-key.key \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -X POST 'https://matls-clients.api.cora.com.br/token' \
  -d 'grant_type=client_credentials&client_id=SEU_CLIENT_ID'
```

Se retornar `access_token`, certificado, chave e Client ID estão coerentes com produção.

## Ativação no Ponto Certo

Depois de salvar o `.env` da API:

```bash
cd /home/ubuntu/ponto-certo/apps/api
npm run build
pm2 restart all --update-env
pm2 logs --lines 100
```

No SaaS:

1. Abra **Financeiro > Provedores de Pagamento**.
2. Localize **Cora**.
3. Confirme que aparece `Servidor: Habilitado` e `Credenciais: Configuradas`.
4. Clique **Testar conexão**.
5. Com o teste OK, clique **Configurar webhook**.
6. Se desejar Cora como padrão, selecione **Cora** e o método **Boleto + Pix** e salve o padrão global.

A troca do padrão só afeta cobranças novas. Cobranças antigas continuam no provedor em que foram emitidas.

## Webhook

URL esperada pelo backend:

```text
POST https://pontoocerto.duckdns.org/api/webhooks/cora
```

O adaptador cadastra o recurso `invoice` com trigger `*`.

A Cora envia os identificadores importantes principalmente nos headers:

```text
webhook-event-id
webhook-event-type
webhook-resource-id
```

O Ponto Certo usa `webhook-resource-id` como invoice id e consulta a Cora antes de confirmar a baixa local.

## Chave Pix

Para boleto híbrido ou cobrança Pix, a conta Cora precisa ter ao menos uma chave Pix cadastrada. Sem chave Pix, o boleto híbrido pode ser emitido sem QR Code Pix.

## Primeiro teste controlado

1. Crie uma cobrança avulsa de teste com valor >= R$ 5,00.
2. Selecione `CORA` + `HYBRID`.
3. Emita.
4. Confirme no Ponto Certo:
   - `provider = CORA`;
   - invoice id da Cora preenchido;
   - linha digitável;
   - URL/PDF do boleto;
   - Pix Copia e Cola quando a Cora retornar.
5. Pague preferencialmente via Pix.
6. Confira a chegada do webhook e a cobrança mudando para `PAGA` após reconciliação.
7. Confirme que o acesso financeiro é liberado normalmente após a baixa.

## Erros típicos

- `CORA_CLIENT_ID` ausente: variável não preenchida.
- `CORA_CERT_PATH` / `CORA_KEY_PATH`: arquivo inexistente ou sem permissão para o processo Node.
- 401: credenciais/certificado de ambiente diferente ou token inválido.
- erro TLS: par certificado/chave incorreto, arquivo inválido ou permissão do Linux.
- QR Pix ausente: conferir se existe chave Pix cadastrada na conta Cora.
- 400 ao emitir: validar CPF/CNPJ, data de vencimento, valor mínimo e `Idempotency-Key`.
- webhook não baixa cobrança: conferir acesso HTTPS público e logs; o sistema também possui reconciliação periódica.
