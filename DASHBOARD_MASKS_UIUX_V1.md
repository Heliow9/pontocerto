# Dashboard SaaS, Máscaras e Moeda BRL — V1

## Escopo

Esta atualização padroniza entradas cadastrais e financeiras no painel web e reorganiza o Dashboard SaaS para leitura executiva.

### Máscaras globais

- CPF: `000.000.000-00`
- CNPJ: `00.000.000/0000-00`
- Telefone fixo: `(00) 0000-0000`
- Celular: `(00) 00000-0000`
- Telefone com DDI 55: `+55 (00) 00000-0000`
- CEP: `00000-000`
- PIS/PASEP: `000.00000.00-0`

As máscaras aceitam dados antigos com ou sem pontuação. Integrações que precisam de somente dígitos continuam normalizando no limite do payload.

### Moeda brasileira

Os campos financeiros prioritários usam `CurrencyInput`, com estado interno numérico e apresentação em BRL. A digitação é feita em centavos: `1` = `R$ 0,01`, `120000` = `R$ 1.200,00`.

Aplicado em planos, mensalidade contratada, implantação, propostas e cobranças avulsas. Campos de quantidade, prazo, raio, ID e limites permanecem numéricos normais.

### Dashboard SaaS

O Dashboard SaaS agora separa:

- KPIs financeiros: MRR, recebido no mês, a receber e vencido;
- saúde da carteira: clientes ativos, testes, suspensos, funcionários, empresas/filiais e contratos;
- distribuição por plano;
- funil comercial;
- atenção necessária, incluindo inadimplência/bloqueios e pendências comerciais;
- ações rápidas para novo cliente, nova cobrança, nova proposta e inadimplentes.

O endpoint `GET /api/saas/dashboard` mantém os campos anteriores e acrescenta `finance`.

## Deploy no Lightsail

Depois do `git pull`:

```bash
cd ~/ponto-certo/apps/api
npm install
npm run build

cd ~/ponto-certo/apps/web
npm install
npm run build
```

O Nginx deste ambiente publica o painel a partir de `/var/www/pontoocerto`. Portanto, o build Web precisa ser publicado:

```bash
sudo cp -a ~/ponto-certo/apps/web/dist/. /var/www/pontoocerto/
```

Depois reinicie somente a API do Ponto Certo:

```bash
pm2 restart ponto-certo-api --update-env
pm2 logs ponto-certo-api --lines 100
```

Se o navegador ainda exibir o bundle antigo, faça recarregamento forçado ou limpe o cache/PWA após confirmar que `/var/www/pontoocerto` contém os arquivos novos.

## Banco Inter

A integração operacional com Banco Inter não faz parte do Financeiro atual. O sistema de cobrança usa Cora, Efí Bank e Mercado Pago conforme o provider configurado. Referências antigas de documentação/testes do Inter foram removidas deste pacote. A migration multiprovedor pode conter apenas referência histórica a `INTER` para converter registros antigos para `LEGACY` durante upgrade.
