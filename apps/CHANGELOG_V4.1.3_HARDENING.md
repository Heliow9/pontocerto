# Ponto Certo V4.1.3 — Hardening Financeiro Multiproduto

Data da release: 20/09/2026

## Objetivo

A V4.1.3 consolida os ajustes da V4.1.2 e endurece o financeiro multiproduto para Ponto Certo, Movyo e PayHub antes da emissão real em produção.

## Principais correções

### Cobranças e provedores
- Recuperação automática de cobranças `ISSUING` sem `provider_charge_id` usando a referência externa da cobrança.
- Efí: busca por `custom_id`; Pix Efí: recuperação determinística pelo TXID.
- Cora: busca da fatura pelo `code`/referência externa.
- Mercado Pago: busca pelo `external_reference`.
- Cobrança `ISSUING` não localizada pode ser marcada como `FAILED` somente após janela segura de reconciliação, permitindo nova tentativa sem duplicação silenciosa.
- Mensagens de erro estruturadas dos provedores são convertidas para texto legível; elimina casos como `[object Object]`.

### Reemissão / desconto pontual
- Desconto apenas na cobrança atual em percentual ou valor fixo.
- Alteração apenas do vencimento da cobrança atual.
- Reemissão em três fases: preparar substituta, confirmar cancelamento no provedor e finalizar a troca local.
- Processo retomável/idempotente em caso de queda entre cancelamento remoto e commit local.
- Cobrança anterior permanece auditável e vinculada à substituta.
- Busca de cobrança mensal duplicada prioriza `revision DESC, id DESC`.
- Desconto recorrente continua separado do desconto pontual e só é alterado por opção explícita.

### Financeiro multiproduto
- `+ Nova cobrança` passa a oferecer `Mensalidade de Produto` para assinaturas Movyo/PayHub/Ponto Certo.
- Dashboard financeiro considera assinaturas de produto sem `tenant_id` na inadimplência, bloqueio e atenção financeira.
- Identificação visual da origem da cobrança e assinatura de produto.

### Assinaturas Movyo
- Tela usa o endpoint correto `/saas/products`.
- Assinaturas migradas do Movyo legado não podem receber pró-rata retroativo.
- Alterar o plano de uma assinatura migrada não a transforma em nova adesão.
- Pró-rata permanece disponível para novas assinaturas quando aplicável.

### CPF/CNPJ
- Validação real dos dígitos verificadores de CPF e CNPJ na API.
- Validação também aplicada aos pagadores e clientes comerciais antes da emissão.
- Utilitário equivalente adicionado no frontend para feedback consistente.

### Build / manutenção
- Script PWA incluído no pacote em `apps/scripts/build-pwa.mjs`.
- `.env.example` da API atualizado para cobrir todas as variáveis configuradas em `config/env.ts`.
- Remoção da página legada específica do Banco Inter no frontend.
- Ajustes de compatibilidade MySQL 5.6 preservados.
- Hotfix de DATETIME do importador Movyo preservado.
- Versão da API, Web e Mobile alinhada para `4.1.3`.
- Android `versionCode` e iOS `buildNumber` avançados para `12`.

## Segurança do pacote

O artefato oficial V4.1.3 é gerado sem:
- arquivos `.env` reais;
- `node_modules`;
- `dist` antigos;
- `.test-dist`;
- selfies e conteúdo de `storage`;
- certificados, chaves ou backups locais.

Use somente os arquivos `.env.example` como referência. Preserve os `.env` existentes do servidor durante o deploy.

## Validação executada

- `npm run test:core`: 48/48 testes aprovados.
- `node --test tests/*.mjs`: 106/106 testes aprovados.
- Build completo da API não foi reproduzido no ambiente de empacotamento porque o ZIP de origem continha `node_modules` incompleto. Os testes TypeScript isolados das rotinas alteradas compilaram e passaram. Execute `npm run build` no servidor/repositório com dependências completas antes do restart.

## Banco de dados

A V4.1.3 não adiciona migration nova além da `029_financial_charge_adjustments.sql` introduzida na V4.1.2. Em ambiente já atualizado para V4.1.2, `npm run db:status` deve retornar zero migrations pendentes.
