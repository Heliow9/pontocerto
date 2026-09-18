import test from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, interWebhookEventKey, normalizePaymentOrigin, providerReferenceFromWebhook } from "../src/services/inter-webhook-core.js";

test("hash canônico independe da ordem das chaves",()=>{
  assert.equal(canonicalJson({b:2,a:1}),canonicalJson({a:1,b:2}));
  assert.equal(interWebhookEventKey({b:2,a:1}),interWebhookEventKey({a:1,b:2}));
});

test("eventKey muda quando o estado financeiro muda",()=>{
  const a={codigoSolicitacao:"abc",situacao:"A_RECEBER",dataHoraSituacao:"2026-09-18T10:00:00"};
  const b={...a,situacao:"RECEBIDO",dataHoraSituacao:"2026-09-18T11:00:00"};
  assert.notEqual(interWebhookEventKey(a),interWebhookEventKey(b));
});

test("normaliza origem do recebimento",()=>{
  assert.equal(normalizePaymentOrigin("PIX"),"PIX");
  assert.equal(normalizePaymentOrigin("boleto"),"BOLETO");
  assert.equal(normalizePaymentOrigin("outro"),null);
});

test("encontra referência da cobrança em payload direto ou aninhado",()=>{
  assert.deepEqual(providerReferenceFromWebhook({codigoSolicitacao:"abc",seuNumero:"PC01"}),{providerChargeId:"abc",yourNumber:"PC01"});
  assert.deepEqual(providerReferenceFromWebhook({cobranca:{codigoSolicitacao:"def",seuNumero:"PC02"}}),{providerChargeId:"def",yourNumber:"PC02"});
});
