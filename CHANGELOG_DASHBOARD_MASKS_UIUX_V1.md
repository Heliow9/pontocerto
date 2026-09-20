# Changelog — Dashboard SaaS + Máscaras + Moeda BRL V1

## Web
- Adicionados `MaskedInput` e utilitários para CPF, CNPJ, telefone, CEP e PIS/PASEP.
- Adicionado `CurrencyInput` em BRL, com digitação orientada a centavos e estado numérico.
- Aplicadas máscaras nos cadastros prioritários de funcionários, empresas, clientes SaaS, propostas e automação WhatsApp.
- Aplicada formatação de CNPJ em listagens comerciais e contratos.
- Aplicada moeda BRL em planos, mensalidade contratada, propostas, implantação e cobranças avulsas.
- Dashboard SaaS redesenhado com KPIs financeiros, saúde operacional, carteira por plano, funil comercial, prioridades e ações rápidas.
- Removida a página legada `SaasFinanceInter.tsx`; o Financeiro permanece multiprovedor (Cora, Efí e Mercado Pago).

## API
- `GET /saas/dashboard` passa a retornar `finance` sem remover os campos anteriores.
- Adicionadas agregações de recebido no mês, a receber, vencido, clientes vencidos, clientes bloqueados e itens prioritários.

## Deploy
Após compilar o Web, publique o bundle em `/var/www/pontoocerto/`:

```bash
sudo cp -a ~/ponto-certo/apps/web/dist/. /var/www/pontoocerto/
```
