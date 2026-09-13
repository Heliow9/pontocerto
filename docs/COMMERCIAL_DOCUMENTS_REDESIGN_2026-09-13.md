# Revisão dos documentos comerciais - 13/09/2026

## Proposta comercial

- Mantido o nível de detalhamento do modelo comercial anterior.
- Preservadas as seções de funcionalidades, WhatsApp, integrações de folha/ERP, segurança, rastreabilidade e conformidade REP-P/MTE.
- Incluída seção específica de privacidade e LGPD sem retirar o conteúdo regulatório já existente.
- Reorganização das páginas para evitar quebra da seção legal entre páginas e melhorar a distribuição de conteúdo.
- Cabeçalho e rodapé padronizados com marca PONTO CERTO, CNPJ, confidencialidade e paginação.
- Dados comerciais permanecem dinâmicos por proposta.

## Contrato

- Contrato ampliado para modelo comercial detalhado.
- Todas as funcionalidades-base e todos os recursos opcionais efetivamente contratados são descritos no documento.
- Recursos não contratados são identificados separadamente.
- Cláusulas ampliadas para implantação, suporte, disponibilidade, segurança, confidencialidade, LGPD, obrigações das partes, valores, vigência, conformidade, propriedade intelectual, integridade documental e disposições gerais.
- Página final dedicada às assinaturas, posicionadas próximas ao rodapé.
- Cabeçalho e rodapé padronizados com marca PONTO CERTO e paginação.

## Código

- `commercial-document-utils.ts` centraliza textos e descrições das funcionalidades contratadas.
- `proposal-documents.service.ts` continua utilizando template DOCX e LibreOffice para PDF.
- `contract-documents.service.ts` passou a renderizar o contrato profissional a partir do template DOCX.
- `scripts/build-commercial-templates.py` permite reconstruir os templates comerciais de forma reproduzível.
