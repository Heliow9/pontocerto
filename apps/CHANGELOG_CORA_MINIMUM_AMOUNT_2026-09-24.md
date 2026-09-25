# Hotfix Cora — valor mínimo de emissão (2026-09-24)

## Motivo
Cobranças Cora de Boleto/Boleto + Pix abaixo de R$ 5,00 eram enviadas à API e retornavam erro genérico `Request has invalid parameters`.

## Ajustes
- Validação central no backend: Cora + `BOLETO`/`HYBRID` exige mínimo de R$ 5,00.
- A validação acontece antes de qualquer chamada de emissão ao provedor.
- Reemissão/ajuste valida o novo valor **antes de cancelar a cobrança original**.
- O provider Cora possui uma segunda validação defensiva na borda da integração.
- Nova cobrança mostra aviso explícito no frontend e bloqueia o botão enquanto o valor estiver abaixo do mínimo.
- O campo de valor usa mínimo dinâmico de R$ 5,00 quando Cora + boleto/BolePix estiver selecionado.
- Ajustar/reemitir também bloqueia descontos que reduzam uma cobrança Cora abaixo de R$ 5,00.
- Pix puro não recebe essa restrição local; a regra foi aplicada especificamente às modalidades com boleto.

## Mensagem apresentada
`A Cora exige valor mínimo de R$ 5,00 para emissão de Boleto + Pix (BolePix).`

## Testes
- Unitário em `api/tests/payment-provider-core.test.ts`.
- Regressão de fonte em `tests/cora-minimum-amount.source.test.mjs`.
