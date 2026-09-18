import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInterIssuePayload,
  extractInterChargeDetails,
  interTokenReusable,
  redactedInterConfig,
} from "../src/services/inter-billing-core.js";

test("payload Inter usa BOLETO_PIX, documento sem mascara e dados do pagador", () => {
  const payload = buildInterIssuePayload({
    yourNumber: "PC-123",
    amount: 1200,
    dueDate: "2026-10-10",
    cancelDays: 30,
    payer: {
      document: "12.345.678/0001-90",
      name: "Empresa Teste Ltda",
      address: "Rua A",
      number: "100",
      complement: "Sala 1",
      district: "Centro",
      city: "Recife",
      state: "PE",
      zipCode: "50.000-000",
      email: "financeiro@example.com",
      phone: "81999998888",
    },
  });
  assert.equal(payload.seuNumero, "PC-123");
  assert.equal(payload.valorNominal, 1200);
  assert.equal(payload.formasRecebimento, "BOLETO_PIX");
  assert.equal(payload.pagador.cpfCnpj, "12345678000190");
  assert.equal(payload.pagador.tipoPessoa, "JURIDICA");
  assert.equal(payload.pagador.cep, "50000000");
  assert.equal(payload.pagador.ddd, "81");
  assert.equal(payload.pagador.telefone, "999998888");
});

test("payload Inter recusa cadastro sem dados minimos do pagador", () => {
  assert.throws(() => buildInterIssuePayload({
    yourNumber: "PC-1", amount: 10, dueDate: "2026-10-10", cancelDays: 30,
    payer: { document: "123", name: "X", address: "", city: "", state: "", zipCode: "" },
  }), /cadastro do pagador/i);
});

test("normaliza resposta v3 em campos locais", () => {
  const result = extractInterChargeDetails({
    cobranca: {
      codigoSolicitacao: "abc",
      seuNumero: "PC-123",
      situacao: "RECEBIDO",
      valorNominal: 1200,
      valorTotalRecebimento: "1200.00",
      origemRecebimento: "PIX",
      dataSituacao: "2026-10-10T14:00:00",
    },
    boleto: { codigoBarras: "123", linhaDigitavel: "456" },
    pix: { txid: "tx-1", pixCopiaECola: "000201..." },
  });
  assert.equal(result.providerChargeId, "abc");
  assert.equal(result.localStatus, "PAID");
  assert.equal(result.amountReceived, 1200);
  assert.equal(result.origin, "PIX");
  assert.equal(result.digitableLine, "456");
  assert.equal(result.pixCopyPaste, "000201...");
});

test("cache do token renova antes de expirar", () => {
  assert.equal(interTokenReusable(Date.now() + 120000, Date.now()), true);
  assert.equal(interTokenReusable(Date.now() + 30000, Date.now()), false);
});

test("visao de configuracao nunca devolve client secret", () => {
  const view = redactedInterConfig({
    enabled: true,
    environment: "production",
    clientId: "id",
    clientSecret: "segredo",
    certPath: "/secrets/inter.crt",
    keyPath: "/secrets/inter.key",
    account: "123",
    webhookUrl: "https://api.example.com/webhooks/inter/billing",
  });
  assert.equal("clientSecret" in view, false);
  assert.equal("keyPath" in view, false);
  assert.equal(view.clientIdConfigured, true);
  assert.equal(view.keyConfigured, true);
});
