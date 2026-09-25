import test from "node:test";
import assert from "node:assert/strict";
import { assertProviderIssueAmount, assertProviderMethod, methodSupported, providerMinimumIssueAmount, providerMinimumIssueMessage, providerStatusToChargeStatus, validateProviderSnapshot } from "../src/services/payment-provider-core.js";

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


test("Cora exige R$ 5,00 para boleto e BolePix",()=>{
  assert.equal(providerMinimumIssueAmount("CORA","HYBRID"),5);
  assert.equal(providerMinimumIssueAmount("CORA","BOLETO"),5);
  assert.equal(providerMinimumIssueAmount("CORA","PIX"),null);
  assert.match(providerMinimumIssueMessage("CORA","HYBRID")||"",/R\$ 5,00/);
  assert.throws(()=>assertProviderIssueAmount("CORA","HYBRID",2.5),(error:any)=>error?.code==="PROVIDER_MINIMUM_AMOUNT"&&error?.minimumAmount===5);
  assert.doesNotThrow(()=>assertProviderIssueAmount("CORA","HYBRID",5));
  assert.doesNotThrow(()=>assertProviderIssueAmount("EFI","HYBRID",2.5));
});

test("Cora aceita pagamento com multa e juros oficiais do provedor",()=>{
  const decision=validateProviderSnapshot({localAmount:100,externalReference:"PC2",snapshot:{provider:"CORA",requestedMethod:"HYBRID",externalReference:"PC2",providerChargeId:"inv2",status:"PAID",nominalAmount:100,receivedAmount:103.5,paidFine:2,paidInterest:1.5,raw:{}}});
  assert.equal(decision.action,"PAY");
});

test("Cora aceita pagamento antecipado com desconto configurado",()=>{
  const decision=validateProviderSnapshot({localAmount:100,externalReference:"PC3",snapshot:{provider:"CORA",requestedMethod:"HYBRID",externalReference:"PC3",providerChargeId:"inv3",status:"PAID",nominalAmount:100,receivedAmount:95,configuredDiscountAmount:5,raw:{}}});
  assert.equal(decision.action,"PAY");
});

test("Cora bloqueia diferença que não corresponde aos ajustes",()=>{
  const decision=validateProviderSnapshot({localAmount:100,externalReference:"PC4",snapshot:{provider:"CORA",requestedMethod:"HYBRID",externalReference:"PC4",providerChargeId:"inv4",status:"PAID",nominalAmount:100,receivedAmount:97,configuredDiscountAmount:5,raw:{}}});
  assert.equal(decision.action,"HOLD");
});
