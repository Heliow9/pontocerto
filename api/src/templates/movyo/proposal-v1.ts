export const MOVYO_PROPOSAL_V1=`PROPOSTA COMERCIAL — MOVYO

Proposta nº {{proposal.number}}
Data: {{proposal.created_at}}
Validade: {{proposal.valid_until}}

PROPONENTE / EMPRESA VENDEDORA
{{seller.legal_name}} — CNPJ {{seller.cnpj}}
{{seller.address}}
E-mail: {{seller.email}} | Telefone: {{seller.phone}}
Representante: {{seller.representative_name}} — {{seller.representative_role}}

CLIENTE
{{customer.legal_name}} — {{customer.document}}
{{customer.address}}
Responsável financeiro: {{customer.financial_contact_name}}
E-mail financeiro: {{customer.financial_contact_email}}

1. PRODUTO
Produto: {{product.name}} ({{product.code}})
Plano: {{plan.name}} ({{plan.code}})

A Movyo é uma plataforma SaaS para gestão da operação de restaurantes, lanchonetes e negócios de alimentação, com recursos disponibilizados conforme o plano contratado. A comercialização, faturamento e relação contratual desta proposta são realizados pela empresa vendedora acima identificada.

2. ESCOPO FUNCIONAL DO PLANO
O plano contratado poderá disponibilizar, conforme sua configuração: Movyo Desktop; Movyo Hub; frente de caixa e abertura/fechamento de caixa; mesas, comandas e garçons; balcão; cardápio/vitrine digital; delivery; impressão operacional; relatórios; controle de estoque e receitas; automações de WhatsApp; gestão de entregas e motoristas nos planos que incluam esses recursos; integrações com meios de pagamento e marketplaces quando habilitadas.

3. INTEGRAÇÕES DE TERCEIROS
Integrações com Mercado Pago, Pagar.me, iFood, 99Food, WhatsApp, serviços de mapas e demais terceiros dependem da disponibilidade, credenciais, regras comerciais, homologações e APIs mantidas por seus respectivos fornecedores. A contratação Movyo não substitui contratos ou taxas cobradas por esses terceiros.

4. IMPLANTAÇÃO E SUPORTE
Prazo estimado de implantação: {{proposal.implementation_days}} dia(s).
Valor de implantação: conforme condição comercial registrada na proposta.
O suporte será prestado pelos canais disponibilizados pela contratada, dentro do escopo do plano contratado.

5. CONDIÇÕES COMERCIAIS
Mensalidade de referência: {{subscription.monthly_price}}
Desconto comercial: {{subscription.discount_percent}}
Mensalidade efetiva: {{subscription.effective_price}}
Vencimento: dia {{subscription.due_day}}
Forma de cobrança: {{billing.method}} pelo provedor {{billing.provider}}.
Tolerância financeira: {{billing.grace_days}} dia(s), conforme configuração contratual.
Multa por atraso: {{billing.fine_percent}}
Juros de mora: {{billing.interest_daily_percent}}

6. DADOS E LGPD
As partes se comprometem a tratar dados pessoais em conformidade com a legislação aplicável, utilizando-os apenas para as finalidades necessárias à execução do serviço, suporte, segurança, faturamento e cumprimento de obrigações legais.

7. VALIDADE E ACEITE
Esta proposta é válida até {{proposal.valid_until}}. O aceite comercial deverá ser formalizado antes da contratação, e as condições definitivas serão consolidadas no contrato específico do produto Movyo.

Observações: {{proposal.notes}}
`;
