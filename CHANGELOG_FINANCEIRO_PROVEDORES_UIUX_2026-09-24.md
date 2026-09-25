# CHANGELOG · UI/UX da tela Provedores de Pagamento

## Objetivo
Melhorar a experiência visual e operacional da tela **Financeiro → Provedores de Pagamento**, deixando a configuração mais clara, moderna e organizada.

## Melhorias aplicadas

### 1) Visão executiva no topo
- Cards-resumo com:
  - provedor padrão atual
  - quantidade de provedores prontos para uso
  - quantidade pendente de configuração
  - quantidade com suporte a Boleto + Pix

### 2) Bloco de padrão global mais elegante
- Melhor hierarquia visual para o provedor e método padrão.
- Card lateral mostrando a configuração atual.
- Texto explicativo mais claro sobre impacto apenas em novas cobranças.

### 3) Cards de provedores mais profissionais
- Cada provedor agora tem:
  - cabeçalho mais limpo
  - badge de status
  - selo de provedor padrão quando aplicável
  - capacidades exibidas como chips visuais
  - dados técnicos mais legíveis

### 4) Melhorias específicas na Cora
- A seção **Condições da cobrança Cora** ficou visualmente destacada.
- Separação clara entre:
  - **Antes do vencimento** → desconto
  - **Após o vencimento** → multa e juros
- Botão de salvar com mais destaque visual.

### 5) Responsividade
- Layout ajustado para desktop, tablet e mobile.
- Melhor adaptação dos cards e dos blocos de configuração em telas menores.

## Arquivos alterados
- `apps/web/src/pages/SaasFinanceProviders.tsx`
- `apps/web/src/pages/commercial.css`
