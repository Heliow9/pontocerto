# Control iD Punch Cooldown Design

## Intent

Evitar que a permanência ou uma segunda aproximação do rosto ao iDFace gere marcações sucessivas acidentais no Ponto Certo.

## Behavior

- A regra é aplicada no servidor, por funcionário e tenant.
- Uma marcação Control iD aceita inicia uma janela de 60 minutos.
- Novos eventos Control iD do mesmo funcionário com intervalo menor que 60 minutos não criam `time_entries`.
- A tentativa ignorada fica auditada em `control_id_events` como duplicada, com motivo explícito de cooldown; não é tratada como erro.
- Tentativas ignoradas não reiniciam a janela.
- Aos 60 minutos exatos, a próxima marcação é aceita e inicia uma nova janela.
- Marcações manuais, web, mobile e AutoPonto não iniciam o cooldown do Control iD.

## Approach

Consideramos configurar o bloqueio apenas no equipamento, mas isso variaria por firmware e não produziria auditoria central. A abordagem escolhida aplica a regra durante o processamento transacional do evento, sob o lock já existente do funcionário. Assim, a regra é consistente para todas as empresas e segura contra eventos concorrentes.

## Non-goals

- Tornar o intervalo configurável nesta entrega.
- Apagar o evento bruto recebido do equipamento.
- Alterar a sequência de entrada, intervalo, retorno e saída.

