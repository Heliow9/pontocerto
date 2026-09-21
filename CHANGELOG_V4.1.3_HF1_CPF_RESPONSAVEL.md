# V4.1.3 HF1 — CPF do responsável financeiro

- Campo em Clientes Comerciais renomeado para **CPF do responsável financeiro**.
- Máscara alterada de CPF/CNPJ para CPF exclusivamente.
- Cadastros antigos com CNPJ nesse campo deixam o campo em branco ao abrir a edição, evitando truncamento silencioso para 11 dígitos.
- Backend continua aceitando o campo como opcional, mas quando preenchido valida exclusivamente CPF.
- Erros de validação comercial agora retornam HTTP 400 com códigos explícitos em vez de `Erro interno do servidor`.
- Adicionado teste de regressão para rejeitar CNPJ no responsável financeiro e aceitar CPF válido.
