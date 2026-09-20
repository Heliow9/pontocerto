import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMovyoImport} from '../src/services/movyo-import-core.js';
import {productSubscriptionFinancialState,shouldGenerateProductMonthly} from '../src/services/financial-worker-core.js';
import {isFirstPaymentTransition} from '../src/services/financial-service-core.js';
import {addOneCalendarMonthDate} from '../src/services/product-subscription-core.js';
import {buildMovyoBillingPayload} from '../src/services/product-integration-core.js';

test('piloto Movyo percorre importação, cobrança, tolerância, bloqueio, pagamento e renovação idempotente',()=>{
  const remote={id:'movyo-1',nome:'Pizzaria Piloto',cnpj:'12.345.678/0001-90',email:'financeiro@piloto.test',emailCobranca:'financeiro@piloto.test',telefone:'81999990000',enderecoCep:'50000000',enderecoRua:'Rua A',enderecoNumero:'10',enderecoBairro:'Centro',enderecoCidade:'Recife',enderecoEstado:'PE',plano:'professional',dataFimPlano:'2026-10-15',valorMensalidadeCustomizado:179.9};
  assert.equal(classifyMovyoImport(remote,{matchCount:0,alreadyImported:false}),'READY_TO_MIGRATE');

  assert.equal(shouldGenerateProductMonthly({billingSource:'PONTO_CERTO',status:'ACTIVE',nextDueDate:'2026-10-15',today:'2026-10-01'}),true);
  assert.equal(productSubscriptionFinancialState({chargeStatus:'OPEN',dueDate:'2026-10-15',blockAt:'2026-10-18',autoBlock:true,graceUntil:null,today:'2026-10-15'}),'ACTIVE');
  assert.equal(productSubscriptionFinancialState({chargeStatus:'OVERDUE',dueDate:'2026-10-15',blockAt:'2026-10-18',autoBlock:true,graceUntil:null,today:'2026-10-16'}),'GRACE');
  assert.equal(productSubscriptionFinancialState({chargeStatus:'OVERDUE',dueDate:'2026-10-15',blockAt:'2026-10-18',autoBlock:true,graceUntil:null,today:'2026-10-18'}),'BLOCKED');

  const blocked=buildMovyoBillingPayload({pontoCertoCustomerId:55,subscriptionId:88,status:'BLOCKED',planCode:'professional',monthlyPrice:179.9,discountPercent:0,currentPeriodEnd:'2026-10-15',graceUntil:null,charge:{id:321,status:'OVERDUE',provider:'EFI',paymentMethod:'HYBRID',amount:179.9,dueDate:'2026-10-15'}});
  assert.equal(blocked.billingAccessBlocked,true);

  assert.equal(isFirstPaymentTransition('OVERDUE'),true);
  const renewed=addOneCalendarMonthDate('2026-10-15');
  assert.equal(renewed,'2026-11-15');
  assert.equal(isFirstPaymentTransition('PAID'),false,'webhook duplicado não deve renovar novamente');

  const active=buildMovyoBillingPayload({pontoCertoCustomerId:55,subscriptionId:88,status:'ACTIVE',planCode:'professional',monthlyPrice:179.9,discountPercent:0,currentPeriodEnd:`${renewed}T23:59:59-03:00`,graceUntil:null,charge:{id:321,status:'PAID',provider:'EFI',paymentMethod:'HYBRID',amount:179.9,dueDate:'2026-10-15'}});
  assert.equal(active.billingAccessBlocked,false);
  assert.equal(active.currentPeriodEnd,'2026-11-15T23:59:59-03:00');
});
