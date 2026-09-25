# CHANGELOG · Financeiro UI/UX Unificado

Este pacote reúne, em uma única atualização, as melhorias mais recentes de:

## Cobranças
- Visão padrão focada em **A vencer / em aberto**.
- Filtros rápidos: A vencer / em aberto, Em atenção, Pagas, Canceladas e Todas.
- Cards-resumo no topo.
- Busca por pagador, descrição, CPF/CNPJ e ID do provedor.
- Ordenação operacional por prioridade/status e vencimento.
- Diferenciação visual suave por status.
- Canceladas deixam de poluir a visão operacional por padrão.

## Provedores de Pagamento
- Cards executivos de status dos provedores.
- Bloco de padrão global mais organizado.
- Cards individuais mais profissionais para Cora, Efí e Mercado Pago.
- Chips de capacidades (Boleto + Pix, Pix, Boleto).
- Melhor visual para ambiente, credenciais, teste e webhook.

## Cora
- Mantida a validação de valor mínimo de R$ 5,00 para boleto/BolePix.
- Mantidas as condições de cobrança:
  - desconto antes do vencimento;
  - multa após o vencimento;
  - juros após o vencimento.
- Seção de condições da Cora redesenhada.

## Arquivos principais alterados
- `apps/web/src/pages/SaasFinance.tsx`
- `apps/web/src/pages/SaasFinanceProviders.tsx`
- `apps/web/src/pages/commercial.css`
