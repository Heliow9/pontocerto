export const MOVYO_CONTRACT_V1=`CONTRATO DE LICENÇA DE USO E PRESTAÇÃO DE SERVIÇOS DE SOFTWARE SaaS — MOVYO

Contrato nº {{contract.number}}
Data: {{contract.date}}

CONTRATADA
{{seller.legal_name}}, CNPJ {{seller.cnpj}}, com endereço em {{seller.address}}, representada por {{seller.representative_name}}, {{seller.representative_role}}.

CONTRATANTE
{{customer.legal_name}}, {{customer.document}}, com endereço em {{customer.address}}.

CLÁUSULA 1 — OBJETO
O presente contrato tem por objeto a concessão temporária, não exclusiva e intransferível de licença de uso da plataforma SaaS Movyo, bem como os serviços correlatos de disponibilização, manutenção evolutiva/corretiva e suporte, de acordo com o plano contratado.

CLÁUSULA 2 — PRODUTO E PLANO
Produto: {{product.name}} ({{product.code}}).
Plano contratado: {{plan.name}} ({{plan.code}}).
A disponibilização de recursos observará os limites e funcionalidades do plano vigente e as condições comerciais registradas neste contrato.

CLÁUSULA 3 — FUNCIONALIDADES
A Movyo poderá disponibilizar, conforme o plano: Desktop/PDV; Hub; caixa; mesas, comandas e garçons; balcão; vitrine/cardápio digital; delivery; impressão; relatórios; estoque e receitas; automações de WhatsApp; gestão de entregas/motoristas; e integrações contratadas. Recursos não pertencentes ao plano não integram o objeto até que haja upgrade ou aditivo comercial.

CLÁUSULA 4 — IMPLANTAÇÃO
A implantação compreenderá a habilitação da conta e parametrizações previstas no escopo contratado. Dados, cardápios, credenciais e informações necessárias deverão ser fornecidos pela CONTRATANTE em tempo hábil.

CLÁUSULA 5 — SERVIÇOS E INTEGRAÇÕES DE TERCEIROS
Mercado Pago, Pagar.me, iFood, 99Food, WhatsApp, mapas e outras integrações são serviços independentes. A CONTRATADA não controla indisponibilidades, alterações de API, políticas, tarifas, bloqueios, credenciais ou homologações de terceiros, comprometendo-se a manter a integração dentro dos limites tecnicamente disponíveis.

CLÁUSULA 6 — PREÇO E PAGAMENTO
Mensalidade: {{subscription.effective_price}}.
Vencimento: dia {{contract.due_day}}.
Forma de pagamento: {{contract.payment_method}}.
Provedor de cobrança: {{billing.provider}} / método {{billing.method}}.
Multa por atraso: {{billing.fine_percent}}.
Juros de mora: {{billing.interest_daily_percent}}.
Tolerância de acesso financeiro: {{billing.grace_days}} dia(s).

CLÁUSULA 7 — INADIMPLÊNCIA, BLOQUEIO E RESTABELECIMENTO
Após o vencimento e observada a tolerância contratada, o acesso ao produto poderá ser bloqueado financeiramente enquanto persistir obrigação vencida, sem apagar os dados operacionais. A regularização do pagamento autorizará o restabelecimento automático ou administrativo do acesso, conforme confirmação do provedor. Exceções temporárias concedidas pela CONTRATADA não implicam novação ou renúncia ao crédito.

CLÁUSULA 8 — ALTERAÇÃO DE PLANO
Alterações de plano, preço, desconto ou funcionalidades devem ser registradas no sistema comercial da CONTRATADA e produzirão efeitos conforme a data acordada, preservando-se os documentos históricos já emitidos.

CLÁUSULA 9 — DISPONIBILIDADE E SUPORTE
A CONTRATADA empregará esforços técnicos compatíveis com serviço SaaS para manter a plataforma disponível, ressalvadas manutenções, força maior, falhas de telecomunicações e dependências de terceiros. O suporte observará os canais e níveis disponibilizados para o plano contratado.

CLÁUSULA 10 — RESPONSABILIDADES DA CONTRATANTE
Compete à CONTRATANTE manter suas credenciais seguras; cadastrar informações verdadeiras; observar a legislação aplicável ao seu negócio; manter equipamentos, rede e contas de terceiros necessários; e utilizar a plataforma de modo lícito.

CLÁUSULA 11 — PROPRIEDADE INTELECTUAL
A titularidade do software, marca, código, documentação e demais ativos intelectuais da Movyo permanece com seus respectivos titulares. Este contrato concede apenas direito de uso durante a vigência.

CLÁUSULA 12 — PROTEÇÃO DE DADOS E LGPD
As partes deverão observar a legislação de proteção de dados aplicável. Dados pessoais serão tratados para execução do serviço, suporte, segurança, prevenção a fraude, faturamento e obrigações legais, mediante controles técnicos e organizacionais compatíveis com a natureza do serviço.

CLÁUSULA 13 — LIMITAÇÃO E RESPONSABILIDADE
Cada parte responderá pelos danos diretamente decorrentes de atos sob seu controle, observada a legislação aplicável. A CONTRATADA não assume resultados comerciais, vendas, disponibilidade de terceiros ou prejuízos decorrentes de dados/configurações incorretas fornecidas pela CONTRATANTE.

CLÁUSULA 14 — VIGÊNCIA, CANCELAMENTO E RESCISÃO
Início da vigência: {{contract.start_date}}.
Prazo: {{contract.term_months}}.
Cancelamento e rescisão observarão as condições comerciais, valores vencidos, obrigações pendentes e eventuais períodos mínimos formalizados entre as partes.

CLÁUSULA 15 — REAJUSTE
{{contract.adjustment_rule}}

CLÁUSULA 16 — FORO
Fica eleito o foro {{contract.forum}}, ressalvadas hipóteses legais de competência obrigatória.

CLÁUSULA 17 — ASSINATURAS
As partes reconhecem a validade de assinaturas eletrônicas e dos registros de evidência utilizados no processo de formalização, quando aplicáveis.

Observações: {{contract.notes}}
`;
