# Exportação de pontos para a folha de pagamento

Acesse **Relatórios → Exportar para ERP** com uma conta de administrador da empresa, RH ou administrador SaaS. Escolha empresa, destino, período de apuração e competência. Selecione um ou mais funcionários, informe os códigos da folha e clique em **Preparar exportação**. Confira os eventos e use **Baixar arquivo para ERP**.

As configurações de empresa, rubricas e matrículas são salvas por empresa e formato ao clicar em **Salvar configuração da empresa**. Os códigos internos do Ponto Certo não são usados automaticamente como códigos do ERP: a matrícula cadastrada é sugerida e pode ser substituída nesta tela. Rubricas em branco excluem aquele tipo de hora; a conferência informa as quantidades omitidas.

## Formatos e situação da compatibilidade

| Destino | Arquivo | Implementação |
| --- | --- | --- |
| Domínio Sistemas | TXT, registro 10 | Posicional de 43 caracteres, sem cabeçalho, horas decimais com duas casas implícitas. |
| Sage / IOB Gestão Contábil | TXT | Registro de 55 caracteres com pipes, horas sexagesimais HHHMM, código de funcionário e eventos de até cinco dígitos. |
| Questor | CSV configurável | Uma coluna de funcionário e colunas identificadas pelas rubricas; **modelo ainda dependente de validação na instalação do ERP**. |
| Outros ERPs | CSV de eventos | Intercâmbio com cabeçalho. A importação depende do mapeamento aceito pelo sistema de destino. |

O Domínio inclui matrícula, competência, rubrica, processo, quantidade e empresa. Selecione a interpretação decimal de horas no importador: 150 minutos são enviados como 2,50 horas. O processo sugerido é 11, mas deve corresponder ao processo da folha utilizada. Implementado conforme a tabela posicional da [documentação oficial do Domínio](https://suporte.dominioatendimento.com/ctsfiles/leiaute_importao_lanamentos_do_relgio_ponto_eletrnico.pdf?id=8207268).

No Sage/IOB, selecione empresa e competência na importação de horas/valores e localize funcionários pelo código. O arquivo envia apenas horas, mantém o valor monetário zerado e o vínculo vazio. Eventos acima de 999 usam o campo estendido; a quantidade máxima é 999:59 por evento. Consulte o [layout oficial](https://ajudaonline.iob.com.br/SGC/crhmodpagimphvlay.htm). As rubricas de faltas já configuradas na digitação diária podem ser ignoradas pelo importador; confira a [orientação de importação](https://ajudaonline.iob.com.br/SGC/crhmodpagimphv.htm) e processe essa rotina separadamente quando aplicável.

O Questor documenta a importação de planilhas de eventos variáveis a partir da versão 23.3.0.0, em Cálculo → Eventos Variáveis → Importação Planilha. O CSV implementado usa `Funcionario` e os códigos de eventos no cabeçalho, com horas `HH:MM` ou decimais. Foi possível confirmar a existência da rotina, mas não verificar integralmente o modelo de planilha publicado: parte da documentação ficou indisponível durante a implementação. Compare este CSV com o modelo da instalação antes de utilizá-lo. Fontes: [notas oficiais da versão](https://central.questor.com.br/?produto=1000&r=planejamento%2Fversao%2Fajuda&versao=23.3.0.0) e [documentação da rotina](https://docs-consulta.questor.com.br/docs/folha-de-pagamento/eventos--variaveis-importacao-de-dados-por-arquivo).

Nenhum desses arquivos foi importado em uma instalação real dos ERPs durante o desenvolvimento. Os testes automatizados verificam a geração, conversões, posições, seleção, acesso e download. A conferência inicial no ERP precisa usar as rubricas e matrículas reais da empresa.

## Escopo da apuração

- Funcionários ativos com escala, uma empresa por arquivo, até 500 selecionados e 62 dias por solicitação. Período e competência são independentes para permitir fechamentos que cruzam meses.
- Apenas dias encerrados, até ontem no horário de Brasília. Ajustes pendentes ou número ímpar de marcações no dia impedem a geração.
- Exporta horas normais, extras totais, atrasos e faltas em horas. Descontos usam quantidades positivas; a rubrica define seu efeito na folha.
- Reutiliza a apuração atual do sistema, com escala e ocorrências aprovadas. Dias anteriores à admissão não entram nos totais exportados.
- Não separa adicionais de 50%/100%, não envia adicional noturno, DSR, banco de horas, afastamentos ou documentos fiscais AFD/AEJ. Não introduz regras novas de cálculo nem substitui o fechamento da folha.
- Eventos zerados não geram linhas. Reexportar não estorna eventos anteriores no ERP; confira a política de substituição da importação, especialmente quando um evento antes existente passou a zero.
- A prévia é uma fotografia dos dados da geração. O download entrega exatamente esse conteúdo. Alterar os filtros ou códigos exige gerar outra prévia; mudanças posteriores nos pontos também exigem nova geração.

## Instalação e API

Execute `npm run db:migrate --workspace apps/api` para criar `payroll_export_profiles` (migração 008). As configurações são JSON serializado em LONGTEXT para compatibilidade com o MySQL da aplicação. Depois, reinicie a API se ela estiver executando sem recarga automática e atualize o aplicativo web.

Todas as rotas abaixo usam a autenticação de Relatórios e restringem papéis a SUPER_ADMIN, TENANT_ADMIN e RH. O tenant vem da sessão; quando ela está vinculada a uma empresa, a exportação fica restrita a essa empresa.

- `GET /reports/payroll/options`: empresas, funcionários ativos, eventos e formatos.
- `GET /reports/payroll/profiles/:companyId/:format`: lê o perfil da empresa/formato.
- `PUT /reports/payroll/profiles/:companyId/:format`: salva o perfil e registra auditoria.
- `POST /reports/payroll/generate`: recebe empresa, formato, início/fim, competência, IDs selecionados e perfil; retorna conteúdo, nome de arquivo, conferência e avisos. Registra auditoria com hash SHA-256 do conteúdo e não importa dados no ERP.

Arquivos usam UTF-8 sem BOM e linhas CRLF. Os dois TXT contêm apenas caracteres ASCII. O CSV genérico escapa campos e neutraliza fórmulas nos textos. Nenhuma migração modifica configurações existentes da empresa.
