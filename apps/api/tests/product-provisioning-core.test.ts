import test from 'node:test';
import assert from 'node:assert/strict';
import {assertMovyoProvisioningCustomer,assertProductDocumentsReady,buildMovyoProvisioningPayload,firstProductDueDate} from '../src/services/product-provisioning-core.js';

const customer={
  id:55,legal_name:'Pizzaria Alfa LTDA',trade_name:'Pizzaria Alfa',document:'12345678000190',email:'contato@alfa.com.br',phone:'81999990000',
  financial_contact_name:'Maria',financial_contact_email:'financeiro@alfa.com.br',financial_contact_phone:'81999990000',
  zip_code:'50000000',street:'Rua A',number:'100',complement:'Sala 2',district:'Centro',city:'Recife',state:'PE'
};
const contract={id:10,company_name:'Pizzaria Alfa LTDA',responsible_name:'Maria',email:'financeiro@alfa.com.br',phone:'81999990000',start_date:'2026-09-19',due_day:10,price_monthly:179.90,template_id:90,template_version:1,rendered_content:'Contrato Movyo',product_plan_code:'professional'};
const proposal={id:9,template_id:80,template_version:1,rendered_content:'Proposta Movyo'};

test('first due date never falls before subscription start and clips invalid month days',()=>{
  assert.equal(firstProductDueDate('2026-09-19',10),'2026-10-10');
  assert.equal(firstProductDueDate('2026-09-05',10),'2026-09-10');
  assert.equal(firstProductDueDate('2026-09-10',10),'2026-10-10');
  assert.equal(firstProductDueDate('2026-02-20',31),'2026-02-28');
  assert.equal(firstProductDueDate('2026-03-31',30),'2026-04-30');
});

test('Movyo provisioning rejects incomplete billing customer before remote side effects',()=>{
  assert.doesNotThrow(()=>assertMovyoProvisioningCustomer(customer));
  assert.throws(()=>assertMovyoProvisioningCustomer({...customer,street:''}),(error:any)=>error?.code==='COMMERCIAL_CUSTOMER_BILLING_INCOMPLETE'&&error?.missing?.includes('street'));
});

test('Movyo provisioning requires rendered proposal and contract snapshots',()=>{
  assert.doesNotThrow(()=>assertProductDocumentsReady({contract,proposal}));
  assert.throws(()=>assertProductDocumentsReady({contract:{...contract,template_id:null},proposal}),(error:any)=>error?.code==='PRODUCT_DOCUMENTS_NOT_RENDERED');
  assert.throws(()=>assertProductDocumentsReady({contract,proposal:{...proposal,rendered_content:null}}),(error:any)=>error?.code==='PRODUCT_DOCUMENTS_NOT_RENDERED');
});

test('Movyo payload carries legal billing data and starts under Ponto Certo control',()=>{
  const payload=buildMovyoProvisioningPayload({customer,contract,proposal,productPlanCode:'professional',monthlyPrice:179.90,discountPercent:10,commercialCustomerId:55,productSubscriptionId:88});
  assert.equal(payload.nome,'Pizzaria Alfa LTDA');
  assert.equal(payload.cnpj,'12345678000190');
  assert.equal(payload.emailCobranca,'financeiro@alfa.com.br');
  assert.equal(payload.enderecoCep,'50000000');
  assert.equal(payload.planCode,'professional');
  assert.equal(payload.billingSource,'PONTO_CERTO');
  assert.equal(payload.billingStatus,'GRACE');
  assert.equal(payload.pontoCertoCustomerId,'55');
  assert.equal(payload.pontoCertoSubscriptionId,'88');
  assert.equal(payload.monthlyPrice,179.90);
  assert.equal(payload.discountPercent,10);
  assert.equal(payload.currentPeriodEnd,'2026-10-10T23:59:59-03:00');
  assert.equal(payload.graceUntil,'2026-10-13T23:59:59-03:00');
});
