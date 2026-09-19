import test from "node:test";
import assert from "node:assert/strict";
import { assertProviderMethod, methodSupported, providerStatusToChargeStatus, validateProviderSnapshot } from "../src/services/payment-provider-core.js";

test("Mercado Pago não aceita HYBRID",()=>{
  assert.equal(methodSupported("MERCADO_PAGO","HYBRID"),false);
  assert.throws(()=>assertProviderMethod("MERCADO_PAGO","HYBRID"),/não suporta/);
});

test("Cora e Efí aceitam boleto híbrido",()=>{
  assert.equal(methodSupported("CORA","HYBRID"),true);
  assert.equal(methodSupported("EFI","HYBRID"),true);
});

test("PROCESSING vira ISSUING",()=>assert.equal(providerStatusToChargeStatus("PROCESSING"),"ISSUING"));

test("reconciliação segura pagamento integral",()=>{
  const decision=validateProviderSnapshot({localAmount:100,externalReference:"PC1",snapshot:{provider:"CORA",requestedMethod:"HYBRID",externalReference:"PC1",providerChargeId:"inv1",status:"PAID",nominalAmount:100,receivedAmount:100,raw:{}}});
  assert.equal(decision.action,"PAY");
});

test("reconciliação segura bloqueia referência divergente",()=>{
  const decision=validateProviderSnapshot({localAmount:100,externalReference:"PC1",snapshot:{provider:"EFI",requestedMethod:"HYBRID",externalReference:"OUTRA",providerChargeId:"1",status:"PAID",nominalAmount:100,receivedAmount:100,raw:{}}});
  assert.equal(decision.action,"HOLD");
});
