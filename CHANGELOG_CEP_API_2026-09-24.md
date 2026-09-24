# Integração de CEP — 24/09/2026

## Objetivo
Preencher automaticamente o endereço ao informar um CEP nos cadastros do Ponto Certo, mantendo o número do imóvel para digitação manual.

## Backend
- Novo endpoint autenticado: `GET /postal-code/:cep`.
- Validação estrita de CEP com 8 dígitos.
- ViaCEP como fonte principal.
- BrasilAPI como contingência quando a consulta principal estiver indisponível.
- Timeout de 5 segundos por tentativa.
- Cache em memória por 12 horas para reduzir chamadas repetidas.
- Respostas normalizadas: CEP, logradouro, complemento, bairro, cidade, UF e IBGE quando disponível.
- CEP inexistente retorna `404`; formato inválido retorna `400`; indisponibilidade dos provedores retorna `502`.

## Frontend
Novo componente reutilizável `CepLookupInput` com consulta automática ao completar 8 dígitos, feedback de carregamento, sucesso e erro.

Telas atualizadas:
- Empresas / unidades;
- Novo cliente SaaS (endereço de faturamento);
- Clientes Comerciais;
- Empresa Vendedora;
- Financeiro > cobrança avulsa;
- Financeiro > perfil de faturamento do cliente.

## Regra de preenchimento
Ao localizar um novo CEP:
- logradouro, complemento, bairro, cidade e UF são preenchidos automaticamente;
- o campo `Número` é limpo e permanece manual;
- os campos continuam editáveis caso a base de CEP não tenha algum detalhe;
- em Empresas/Unidades, coordenadas e `mapboxPlaceId` anteriores são limpos para impedir geofence vinculada ao endereço antigo; a geocodificação será recalculada ao salvar/localizar o endereço.

## Configuração
Não há nova variável de ambiente nem chave de API obrigatória.

## Validação executada
- `apps/web` validado com TypeScript (`tsc -b`) sem erros.
- `postal-code.service.ts` compilado isoladamente sem erros.
- comportamento de normalização/validação do serviço testado com resposta simulada.
- build completo da API não foi usado como critério porque o pacote de entrada contém dependências opcionais/antigas ausentes no backup local (`web-push`, `exceljs`, `qrcode`, entre outras), problema preexistente e não relacionado a esta alteração.
