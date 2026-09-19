import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const sql=fs.readFileSync(new URL('../api/sql/026_commercial_document_templates.sql',import.meta.url),'utf8');
test('026 creates seller and versioned product templates',()=>{assert.match(sql,/commercial_seller_profiles/);assert.match(sql,/commercial_document_templates/);assert.match(sql,/product_id/);assert.match(sql,/document_type/);assert.match(sql,/template_version/);assert.doesNotMatch(sql,/REGEXP_REPLACE/i);});
test('026 makes legacy proposal plan nullable for non Ponto products',()=>{assert.match(sql,/commercial_proposals MODIFY COLUMN plan_id BIGINT UNSIGNED NULL/);assert.match(sql,/commercial_contracts MODIFY COLUMN plan_id BIGINT UNSIGNED NULL/);});
const route=fs.readFileSync(new URL('../api/src/routes/commercial-documents.routes.ts',import.meta.url),'utf8');const movyoProposal=fs.readFileSync(new URL('../api/src/templates/movyo/proposal-v1.ts',import.meta.url),'utf8');const movyoContract=fs.readFileSync(new URL('../api/src/templates/movyo/contract-v1.ts',import.meta.url),'utf8');
test('commercial document API manages seller versions and activation',()=>{assert.match(route,/\/seller/);assert.match(route,/document-templates/);assert.match(route,/activate/);assert.match(route,/preview/);});
test('Movyo proposal and contract are product specific',()=>{assert.match(movyoProposal,/MOVYO/);assert.match(movyoProposal,/Movyo Desktop/);assert.match(movyoContract,/SOFTWARE SaaS — MOVYO/);assert.match(movyoContract,/INADIMPLÊNCIA, BLOQUEIO E RESTABELECIMENTO/);assert.doesNotMatch(movyoContract,/registro de ponto|jornada de trabalho/i);});
const portal=fs.readFileSync(new URL('../web/src/pages/SaasPortal.tsx',import.meta.url),'utf8');
test('portal exposes seller and document templates',()=>{assert.match(portal,/Empresa Vendedora/);assert.match(portal,/Modelos de documentos/);assert.match(portal,/SaasDocumentTemplates/);});
const proposalRoute=fs.readFileSync(new URL('../api/src/routes/proposals.routes.ts',import.meta.url),'utf8');
const contractRoute=fs.readFileSync(new URL('../api/src/routes/contracts.routes.ts',import.meta.url),'utf8');
test('proposal and contract routes select templates by product before document generation',()=>{
  assert.match(proposalRoute,/ensureProposalRendered/);
  assert.match(contractRoute,/ensureContractRendered/);
  assert.match(proposalRoute,/commercial_products/);
  assert.match(contractRoute,/commercial_products/);
  assert.match(contractRoute,/product_id/);
});
test('non Ponto documents cannot silently use legacy tenant conversion',()=>{
  assert.match(proposalRoute,/PRODUCT_PROVISIONING_REQUIRED|MOVYO/);
  assert.match(contractRoute,/PRODUCT_PROVISIONING_REQUIRED|MOVYO/);
});
const proposalUi=fs.readFileSync(new URL('../web/src/pages/ProposalsPage.tsx',import.meta.url),'utf8');
test('proposal UI chooses product and Movyo plan independently',()=>{assert.match(proposalUi,/Produto/);assert.match(proposalUi,/Plano Movyo/);assert.match(proposalUi,/productPlanId/);assert.match(proposalUi,/BolePix \/ Boleto/);});
const contractUi=fs.readFileSync(new URL('../web/src/pages/ContractsPage.tsx',import.meta.url),'utf8');
test('contract UI identifies product-specific contract',()=>{assert.match(contractUi,/product_name/);assert.match(contractUi,/Provisionar Movyo/);});

const templatesUi=fs.readFileSync(new URL('../web/src/pages/SaasDocumentTemplates.tsx',import.meta.url),'utf8');
test('document template UI exposes version-safe duplicate preview and archive actions',()=>{for(const label of ['Duplicar versão','Pré-visualizar','Arquivar'])assert.match(templatesUi,new RegExp(label));assert.match(templatesUi,/status==='DRAFT'/);});
