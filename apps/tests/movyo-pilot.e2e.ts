import test from 'node:test';
import assert from 'node:assert/strict';
import {MovyoPilotFixture} from './fixtures/movyo-pilot-fixture.js';

test('Movyo pilot contract is idempotent from import through payment and access recovery',()=>{
  const pilot=new MovyoPilotFixture();

  pilot.syncDirectory();
  pilot.syncDirectory();
  assert.equal(pilot.subscriptions.length,0,'directory sync must remain read-only');

  pilot.importCustomer();
  pilot.importCustomer();
  assert.equal(pilot.subscriptions.length,1,'duplicate import must reuse subscription');
  assert.equal(pilot.mapping?.status,'READY_TO_MIGRATE');

  pilot.cutover();
  pilot.cutover();
  assert.equal(pilot.mapping?.status,'PONTO_CERTO');
  assert.equal(pilot.subscriptions[0].billingSource,'PONTO_CERTO');

  pilot.issueMonthly('2026-10');
  pilot.issueMonthly('2026-10');
  assert.equal(pilot.charges.length,1,'same competence must create one monthly charge');

  const first=pilot.providerPaid('webhook-efi-001','efi-payment-001','2026-10');
  const duplicate=pilot.providerPaid('webhook-efi-001','efi-payment-001','2026-10');
  assert.equal(first.duplicate,false);
  assert.equal(duplicate.duplicate,true);
  assert.equal(pilot.payments.length,1,'duplicate webhook must not duplicate payment');
  assert.equal(pilot.subscriptions[0].currentPeriodEnd,'2026-11-15','paid monthly charge advances exactly one calendar month');

  pilot.block();
  assert.equal(pilot.bridgeState.billingAccessBlocked,true);
  pilot.unblock();
  assert.equal(pilot.bridgeState.billingAccessBlocked,false);

  const writesBefore=pilot.syncWrites;
  assert.equal(pilot.reconcile().aligned,true);
  assert.equal(pilot.reconcile().aligned,true);
  assert.equal(pilot.syncWrites,writesBefore,'duplicate reconciliation must not rewrite aligned state');

  assert.equal(pilot.subscriptions.length,1);
  assert.equal(pilot.charges.length,1);
  assert.equal(pilot.payments.length,1);
});
