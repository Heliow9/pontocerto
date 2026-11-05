# Diagnóstico de sincronização Control iD

## Intenção

Permitir que administradores acompanhem a sincronização sem recarregar a página e entendam, por funcionário, o que falhou e como corrigir manualmente.

## Escopo

- Atualizar o equipamento e seus diagnósticos automaticamente a cada 5 segundos, além de oferecer atualização manual.
- Listar todos os funcionários da empresa, inclusive os não enviados por estarem inativos ou sem foto facial.
- Exibir etapa, estado, tentativas, horário, mensagem técnica recebida e orientação prática.
- Manter isolamento por tenant/empresa e nunca retornar credenciais ou imagens.

## Abordagem

Estender a consulta administrativa já existente, juntando funcionário, mapeamento e o job mais recente da versão atual. Uma função pura transforma os dados persistidos em estados e orientações estáveis; a tela apenas renderiza esse contrato e faz polling. Isso evita nova tabela, migração e duplicação das regras no navegador.

## Não objetivos

- Alterar o protocolo Push/Monitor ou o firmware.
- Corrigir automaticamente cadastros de clientes.
- Exibir imagem facial, credencial secreta ou payload completo do equipamento.

