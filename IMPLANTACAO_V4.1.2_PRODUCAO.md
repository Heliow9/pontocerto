# Implantação Ponto Certo V4.1.2 em produção

## Conteúdo da versão

- editor completo de assinatura por produto;
- e-mail financeiro editável pela assinatura;
- desconto recorrente;
- alteração de próximo vencimento;
- desconto pontual na cobrança atual;
- cancelamento + reemissão auditável;
- opção de aplicar desconto percentual também nas mensalidades futuras;
- migration 029 compatível com MySQL 5.6;
- hotfixes V4.1/V4.1.1 já incorporados.

## Ordem recomendada

1. Fazer backup do código atual e do banco.
2. Copiar os arquivos da V4.1.2 preservando `.env`, uploads e dados persistentes.
3. Executar build da API.
4. Executar `db:status` e depois `db:migrate`.
5. Confirmar migration 029 aplicada.
6. Reiniciar apenas `ponto-certo-api` sem `--update-env`.
7. Validar `/health`.
8. Executar build do frontend e publicar no root do Nginx.
9. Testar edição de uma assinatura.
10. Testar ajuste/reemissão inicialmente com cobrança piloto de baixo valor.

## Atenções

- Não editar diretamente uma cobrança já emitida: use **Ajustar / reemitir**.
- O desconto pontual não altera as mensalidades futuras por padrão.
- A opção de desconto recorrente só é disponibilizada para desconto percentual em cobrança ligada a uma assinatura.
- Cobrança `ISSUING` precisa ser reconciliada antes de cancelar/reemitir.
- Cobranças pagas ou canceladas não podem ser reemitidas pelo fluxo de ajuste.
- Para Movyo, mantenha o rollout em piloto até concluir os testes de acesso, cobrança, bloqueio e desbloqueio.
