# Validação V4.1.3

## Resultado automatizado

- Core financeiro/API: **48/48 aprovados**.
- Testes `.mjs` de regressão/source/UI: **106/106 aprovados**.

## Escopos cobertos

- regras financeiras;
- acesso e bloqueio financeiro;
- worker financeiro;
- provedores e webhooks;
- dashboard financeiro;
- pagador e e-mail;
- pró-rata;
- reemissão/desconto pontual;
- CPF/CNPJ;
- parser de erros de provedor;
- Movyo HMAC/cutover/rollout;
- frontend financeiro e multiproduto;
- compatibilidade de migrations legado/MySQL;
- facial/AutoPonto e regressões de source existentes.

## Limitação do ambiente de empacotamento

O build completo da API não pôde ser reproduzido aqui porque o arquivo `apps(5).zip` enviado continha `node_modules` parcial/incompleto (faltando módulos declarados no `package.json`). Isso não foi contornado com dependências inventadas. O deploy deve executar `npm run build` no repositório/servidor que possui a instalação completa das dependências antes de reiniciar o PM2.
