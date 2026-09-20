import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCommercialEmailHtml,
  buildReadReceiptHeaders,
  smtpConnectionIdentity,
  smtpTransportOptions,
} from "../src/services/commercial-email-core.js";

test("STARTTLS uses TLS without implicit SSL", () => {
  const options = smtpTransportOptions({host:"smtp.gmail.com",port:587,username:"envios@example.com",password:"secret",security:"STARTTLS"});
  assert.equal(options.secure,false);
  assert.equal(options.requireTLS,true);
  assert.equal(options.ignoreTLS,false);
  assert.deepEqual(options.auth,{user:"envios@example.com",pass:"secret"});
});

test("SSL/TLS uses an implicit secure socket", () => {
  const options = smtpTransportOptions({host:"smtp.example.com",port:465,username:"user",password:"secret",security:"SSL_TLS"});
  assert.equal(options.secure,true);
  assert.equal(options.requireTLS,false);
  assert.equal(options.ignoreTLS,false);
});

test("NONE explicitly disables TLS", () => {
  const options = smtpTransportOptions({host:"mail.local",port:25,username:"",password:"",security:"NONE"});
  assert.equal(options.secure,false);
  assert.equal(options.requireTLS,false);
  assert.equal(options.ignoreTLS,true);
  assert.equal(options.auth,undefined);
});

test("commercial email escapes user text and embeds the unique tracking pixel", () => {
  const html = buildCommercialEmailHtml({recipientName:"Ana <Compras>",message:"Olá <script>alert('x')</script>\nSegue a proposta.",trackingUrl:"https://api.example.com/mail/open/abc.gif",documentLabel:"Proposta PC-2026-00001"});
  assert.match(html,/Ana &lt;Compras&gt;/);
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/https:\/\/api\.example\.com\/mail\/open\/abc\.gif/);
  assert.match(html,/width="1"/);
});

test("read receipt headers request a receipt back to the configured sender", () => {
  const headers=buildReadReceiptHeaders("comercial@example.com");
  assert.equal(headers["Disposition-Notification-To"],"comercial@example.com");
  assert.equal(headers["Return-Receipt-To"],"comercial@example.com");
  assert.equal(headers["X-Confirm-Reading-To"],"comercial@example.com");
});

test("SMTP connection identity ignores display-only fields but changes when transport credentials change", () => {
  const base={host:"smtp.gmail.com",port:587,username:"envios@example.com",security:"STARTTLS",senderEmail:"envios@example.com",senderName:"Ponto Certo",secret:"cipher",connection:{status:"SUCCESS"}};
  assert.equal(smtpConnectionIdentity(base),smtpConnectionIdentity({...base,senderName:"Novo Nome",connection:{status:"ERROR"}}));
  assert.notEqual(smtpConnectionIdentity(base),smtpConnectionIdentity({...base,host:"smtp2.gmail.com"}));
  assert.notEqual(smtpConnectionIdentity(base),smtpConnectionIdentity({...base,secret:"new-cipher"}));
});
