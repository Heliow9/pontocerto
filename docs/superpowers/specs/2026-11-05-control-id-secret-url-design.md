# Control iD Secret URL Design

## Intent

Permitir que iDFace com painel iDCloud personalizado limitado a “Endereço do Servidor” e “Período” autentique Push e Monitor no Ponto Certo, mantendo isolamento por equipamento e empresa.

## Approach

O segredo de 64 caracteres já gerado para o terminal poderá ser enviado no cabeçalho Bearer existente ou em um segmento de caminho HTTPS. O endereço-base do Push será `/control-id/device/:credential`; o equipamento acrescentará `/push` e `/result`. O Monitor usará `/control-id/device/:credential/monitor`, ao qual o equipamento acrescentará `/dao` e `/device_is_alive`.

Foram descartados segredo em query string (mais sujeito a vazamento e incompatível com a concatenação do iDFace) e autenticação somente por `deviceId` (não é segredo). O segredo no caminho é compatível com o equipamento real e preserva a validação conjunta de credencial e `deviceId`.

## Security and compatibility

- HTTPS é obrigatório nas instruções de produção.
- O segredo nunca é persistido em texto puro e continua sendo mostrado apenas na criação/rotação.
- Rotas Bearer existentes permanecem compatíveis.
- Credenciais malformadas, desconhecidas ou associadas a outro `deviceId` são rejeitadas.
- O painel exibe endereços completos somente enquanto possui a credencial em memória.
- Documentação alerta para não registrar a URL secreta nem compartilhá-la em capturas.

## Scope

Alterar resolução da credencial, rotas públicas, painel de equipamento, testes e roteiro de instalação. Não altera banco de dados nem o protocolo dos comandos Push.
