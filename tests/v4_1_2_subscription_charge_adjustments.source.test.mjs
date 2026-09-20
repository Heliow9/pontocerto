import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const subscriptionUi=fs.readFileSync('web/src/pages/SaasProductSubscriptions.tsx','utf8');
const financeUi=fs.readFileSync('web/src/pages/SaasFinance.tsx','utf8');
const financeService=fs.readFileSync('api/src/services/financial.service.ts','utf8');
const financeRoutes=fs.readFileSync('api/src/routes/saas-finance.routes.ts','utf8');
const productRoutes=fs.readFileSync('api/src/routes/commercial-products.routes.ts','utf8');
const migration=fs.readFileSync('api/sql/029_financial_charge_adjustments.sql','utf8');

test('subscription editor exposes commercial billing controls',()=>{
  for(const token of ['Editar assinatura','Desconto recorrente','Próximo vencimento','E-mail de cobrança','Bloqueio automático','Pró-rata automático']) assert.match(subscriptionUi,new RegExp(token));
  assert.match(productRoutes,/financialContactEmail/);
  assert.match(productRoutes,/SUBSCRIPTION_UPDATED/);
});

test('charge screen exposes one-off discount and reissue workflow',()=>{
  for(const token of ['Ajustar / reemitir','Desconto pontual','Confirmar e reemitir','Aplicar este percentual também às próximas mensalidades']) assert.match(financeUi,new RegExp(token));
  assert.match(financeRoutes,/reissue-adjusted/);
  assert.match(financeService,/reissueChargeWithAdjustment/);
  assert.match(financeService,/CHARGE_ADJUSTMENT_CREATED/);
  assert.match(financeService,/CHARGE_REISSUED/);
});

test('migration preserves reissue lineage and charge-only discount metadata',()=>{
  for(const token of ['revision','discount_scope','discount_type','discount_value','discount_amount','reissued_from_charge_id','replaced_by_charge_id','reissue_reason']) assert.match(migration,new RegExp(token));
  assert.match(migration,/uq_financial_subscription_competence/);
});
