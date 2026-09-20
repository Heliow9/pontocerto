# Ponto Certo V4.1.1 — Edição de Clientes Comerciais

## Ajustes
- Adiciona coluna **Ações** na tela **Clientes Comerciais**.
- Adiciona botão **Editar** para cada Cliente Comercial.
- Reaproveita o endpoint existente `PUT /saas/commercial-customers/:id`.
- Modal de cadastro passa a funcionar para criação e edição.
- Permite editar razão social/nome, nome fantasia, CPF/CNPJ, status, e-mail, telefone, responsável financeiro, documento/e-mail/telefone financeiro e endereço completo.
- Adiciona máscaras para CPF/CNPJ, telefone e CEP.
- Exibe estado de salvamento e mantém mensagens de erro da API.

## Banco de dados
Nenhuma migration nova é necessária.

## API
Nenhuma mudança de contrato foi necessária: o endpoint de atualização já existia na V4.1.
