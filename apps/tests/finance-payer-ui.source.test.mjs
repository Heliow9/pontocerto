import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('migration 023 cria perfil completo, snapshot e histórico de entrega',()=>{
  const sql=read('api/sql/023_financial_payers_and_delivery.sql');
  for(const token of [
    'billing_legal_name','billing_trade_name','billing_document','billing_email','billing_phone',
    'financial_contact_name','financial_contact_document','financial_contact_email','financial_contact_phone',
    'billing_zip_code','billing_street','billing_number','billing_complement','billing_district','billing_city','billing_state',
    'auto_email_charges','payer_source','payer_person_type','payer_name','payer_document','send_email_after_issue',
    'financial_charge_deliveries'
  ]) assert.match(sql,new RegExp(token));
  assert.match(sql,/MODIFY(?: COLUMN)? tenant_id BIGINT UNSIGNED NULL/);
});

test('emissão persiste cobrança antes de tentar email financeiro',()=>{
  const service=read('api/src/services/financial.service.ts');
  const email=read('api/src/services/financial-email.service.ts');
  assert.match(service,/applyProviderDetails[\s\S]*sendFinancialChargeEmail/);
  assert.match(service,/emailDelivery:\{status:"FAILED"/);
  assert.match(email,/financial_charge_deliveries/);
  assert.match(email,/CHARGE_EMAIL_SENT/);
  assert.match(email,/CHARGE_EMAIL_FAILED/);
});

test('cadastro SaaS possui faturamento responsável financeiro endereço e auto envio',()=>{
  const page=read('web/src/pages/SaasPage.tsx');
  for(const text of ['Dados de faturamento','Responsável financeiro','Endereço de faturamento','Enviar cobranças automaticamente']) assert.match(page,new RegExp(text));
  assert.match(page,/mask="cnpj"/);
  assert.match(page,/mask="cpf"/);
  assert.match(page,/mask="phone"/);
  assert.match(page,/mask="cep"/);
});

test('listagem financeira mascara CPF e CNPJ do pagador',()=>{
  const page=read('web/src/pages/SaasFinance.tsx');
  assert.match(page,/formatCpfCnpj\(c\.payer_document\)/);
});

test('modal avulso permite Cliente SaaS ou Pagador avulso e envio automático',()=>{
  const page=read('web/src/pages/SaasFinance.tsx');
  for(const text of ['Cliente SaaS','Pagador avulso','Enviar cobrança por e-mail após emissão','Reenviar por e-mail','Histórico de envios']) assert.match(page,new RegExp(text));
  assert.match(page,/payerSource/);
  assert.match(page,/sendEmailAfterIssue/);
  assert.match(page,/mask="cpf"|mask="cnpj"/);
  assert.match(page,/mask="cep"/);
});

test('API de tenants aceita perfil financeiro completo e sinaliza completude',()=>{
  const routes=read('api/src/routes/saas.routes.ts');
  const provisioning=read('api/src/services/tenant-provisioning.service.ts');
  for(const field of ['billingLegalName','financialContactName','financialContactEmail','billingZipCode','billingStreet','billingCity','autoEmailCharges']) assert.match(routes,new RegExp(field));
  assert.match(routes,/financial_profile_complete/);
  assert.match(routes,/financial_contact_email/);
  assert.match(provisioning,/auto_email_charges/);
  assert.match(provisioning,/d\.autoEmailCharges/);
});

test('API mantém aliases de contrato para envio e reenvio descritos na especificação',()=>{
  const routes=read('api/src/routes/saas-finance.routes.ts');
  assert.match(routes,/charges\/:id\/send-email/);
  assert.match(routes,/sendEmail:z\.boolean\(\)\.optional\(\)/);
});
