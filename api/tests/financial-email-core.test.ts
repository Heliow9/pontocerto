import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFinancialChargeEmailContent,resolveChargeRecipient} from '../src/services/financial-email-core.js';

const charge={payer_name:'Empresa <X>',payer_email:'financeiro@example.com',description:'Treinamento',amount:5,due_date:'2026-09-30',provider:'MERCADO_PAGO',requested_payment_method:'BOLETO',provider_payment_url:'https://pay.example/x',digitable_line:'123456',pix_copy_paste:null,pix_qr_code:null};

test('email financeiro inclui valor vencimento provider e artefatos sem HTML injetado',()=>{
  const out=buildFinancialChargeEmailContent(charge as any);
  assert.match(out.subject,/30\/09\/2026/);
  assert.match(out.text,/R\$\s*5,00/);
  assert.match(out.text,/Mercado Pago/);
  assert.match(out.text,/123456/);
  assert.doesNotMatch(out.html,/<X>/);
  assert.match(out.html,/Empresa &lt;X&gt;/);
});

test('destinatário padrão vem do snapshot e override manual prevalece',()=>{
  assert.equal(resolveChargeRecipient(charge as any),'financeiro@example.com');
  assert.equal(resolveChargeRecipient(charge as any,'cobranca@example.com'),'cobranca@example.com');
});
