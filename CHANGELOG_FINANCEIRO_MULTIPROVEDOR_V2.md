# Changelog — Financeiro Multi-Provedor V2

## Adicionado
- Cora, Efí Bank e Mercado Pago como provedores ativos.
- Provider Registry com interface única de emissão, consulta, cancelamento e reconciliação.
- Provedor padrão global e método padrão global do SaaS.
- Escolha manual de provedor/método na Cobrança Avulsa.
- Provider/método persistidos na cobrança e no recebimento.
- Webhooks separados por provedor e eventos idempotentes.
- Dashboard de recebimento por provedor, tarifas e líquido quando disponíveis.
- Filtros por provedor/método e exportação CSV de cobranças e recebimentos.
- Configuração/teste dos três provedores na Administração SaaS.
- Suporte a Cora híbrido, Efí Bolix e Pix/Boleto Mercado Pago.

## Mantido
- Mensalidades com vencimento nos dias 5, 10 ou 15.
- Geração automática no dia 1.
- Cobrança de implantação e cobrança avulsa.
- Bloqueio financeiro após 3 dias corridos.
- Exceções administrativas +5/+10/+30 dias ou data personalizada.
- Desbloqueio automático após quitação de todas as pendências bloqueantes.

## Removido do fluxo ativo
- Integração, telas, rotas, variáveis e serviços operacionais do Banco Inter.
- A parte fiscal/NFS-e continua fora deste módulo.
