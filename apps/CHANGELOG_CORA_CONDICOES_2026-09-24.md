# Cora — desconto, multa e juros — 2026-09-24

## Implementado

- Configuração no painel `Financeiro > Provedores > Cora`:
  - desconto fixo em R$ antes do vencimento;
  - multa fixa em R$ após o vencimento;
  - juros em percentual após o vencimento.
- Persistência das condições no banco em `payment_provider_settings.settings_json`.
- Nova migration `api/sql/031_cora_payment_terms.sql`.
- Novo endpoint `PUT /saas/finance/providers/CORA/payment-terms`.
- As condições são aplicadas somente a novas emissões Cora.
- Valores iguais a zero desativam a respectiva condição.
- O payload Cora passa a enviar `payment_terms.discount`, `payment_terms.fine` e `payment_terms.interest` quando configurados.
- Validação impede desconto fixo igual ou superior ao valor nominal da cobrança.

## Reconciliação

A validação de pagamento foi atualizada para reconhecer diferenças legítimas entre valor nominal e valor recebido quando a própria Cora informar:

- desconto configurado para pagamento antecipado;
- multa paga;
- juros pagos.

Diferenças que não correspondam aos ajustes informados pelo provedor continuam sendo mantidas em `HOLD` para segurança.

## Implantação

Após atualizar os arquivos:

```bash
cd /home/ubuntu/ponto-certo/apps/api
npm run db:migrate
npm run build

cd /home/ubuntu/ponto-certo/apps/web
npm run build
sudo rsync -av --delete dist/ /var/www/pontoocerto/

cd /home/ubuntu/ponto-certo
pm2 restart ponto-certo-api --update-env
sudo nginx -t && sudo systemctl reload nginx
```

A migration precisa ser executada antes do restart da API porque o novo código consulta a coluna `settings_json`.
