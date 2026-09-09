# Ponto Certo v0.4.2 — Biometria por funcionário

A empresa pode continuar exigindo biometria como regra geral, mas RH/Admin agora pode dispensá-la para um funcionário específico.

## No painel

Acesse:

`Funcionários`

Na coluna **Biometria** será exibido:

- `Obrigatória`
- `Dispensada`

Você pode usar o botão:

- **Desabilitar biometria**
- **Habilitar biometria**

A mesma opção está disponível ao editar o funcionário:

`Segurança do registro de ponto > Desabilitar biometria para este funcionário`

## O que continua obrigatório

Desabilitar a biometria NÃO desabilita:

- autenticação do funcionário;
- jornada;
- horário oficial do servidor;
- GPS;
- precisão mínima do GPS;
- bloqueio por raio;
- detecção de localização simulada;
- aparelho vinculado, quando a empresa exigir aparelho registrado.

## Segurança da troca

Ao habilitar ou desabilitar a biometria de um funcionário, todos os aparelhos ativos dele são revogados.

Isso é necessário porque uma credencial criada anteriormente pode estar protegida pela biometria do SecureStore.

O funcionário deverá entrar novamente em:

`Perfil > Vincular este aparelho`

Se a biometria estiver dispensada, o vínculo é feito sem Face ID / Touch ID / impressão digital.

## Banco

Migration:

`api/sql/006_employee_biometric_override.sql`

Novo campo:

`employees.biometric_exempt`

Valores:

- `0` = segue a política biométrica da empresa;
- `1` = biometria dispensada para o funcionário.

## Atualização

Preserve seu `apps/api/.env` e execute:

```powershell
npm install
npm run db:init
```

A migration 006 será aplicada automaticamente.
