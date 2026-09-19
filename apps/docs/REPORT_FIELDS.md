# Relatório mensal de ponto

O relatório foi estruturado para conter:

## Dados do funcionário/empresa
- Nome
- CPF
- PIS
- Matrícula
- Data de admissão
- CTPS
- Cargo
- Empresa
- CNPJ
- Período

## Jornada
- Horários de trabalho por dia da semana
- Folgas

## Tabela diária
- DATA
- STATUS
- PONTOS
- CH
- HT_NORMAIS
- EX_EN
- AT
- FA

## Totais
- AT — Atraso
- FA — Falta
- CH — Carga Horária
- HT_NORMAIS — Horas Normais
- EX_EN — Horas Extras

## Assinaturas
- Assinatura do Funcionário
- Assinatura do Responsável

A rota inicial é:

`GET /reports/monthly/:employeeId?start=YYYY-MM-DD&end=YYYY-MM-DD`
