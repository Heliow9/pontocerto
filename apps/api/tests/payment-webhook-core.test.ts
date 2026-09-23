import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mercadoPagoSignatureValid, stableWebhookEventKey, resolveMercadoPagoNotificationResource } from "../src/services/payment-webhook-core.js";

test("stable webhook key is deterministic for the same payload",()=>{
  const payload={id:123,type:"invoice.paid"};
  assert.equal(stableWebhookEventKey("CORA",payload),stableWebhookEventKey("CORA",payload));
});

test("explicit webhook key is preferred",()=>{
  assert.equal(stableWebhookEventKey("EFI",{anything:true},"evt-123"),"evt-123");
});

test("Mercado Pago signature validates the documented manifest",()=>{
  const secret="test-secret",requestId="req-77",dataId="ABC123",ts="1720000000";
  const manifest=`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1=createHmac("sha256",secret).update(manifest).digest("hex");
  assert.equal(mercadoPagoSignatureValid({signature:`ts=${ts},v1=${v1}`,requestId,dataId,secret}),true);
});

test("Mercado Pago invalid signature is rejected",()=>{
  assert.equal(mercadoPagoSignatureValid({signature:"ts=1720000000,v1=00",requestId:"req",dataId:"1",secret:"secret"}),false);
});

test("Mercado Pago resolve data.id de webhook moderno",()=>{
  assert.deepEqual(resolveMercadoPagoNotificationResource({type:"payment",data:{id:"123"}},{"data.id":"123",type:"payment"}),{paymentId:"123",mode:"WEBHOOK",topic:"payment"});
});

test("Mercado Pago aceita fallback IPN payment somente para reconciliação autenticada no provedor",()=>{
  assert.deepEqual(resolveMercadoPagoNotificationResource({}, {id:"456",topic:"payment"}),{paymentId:"456",mode:"IPN",topic:"payment"});
  assert.equal(resolveMercadoPagoNotificationResource({}, {id:"ORD-1",topic:"merchant_order"}).paymentId,null);
});
