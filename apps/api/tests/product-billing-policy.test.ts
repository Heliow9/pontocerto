import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveProductPaymentSelection,validateProductBillingPair} from '../src/services/product-subscription-core.js';

test('billing selection uses complete subscription pair before product and global',()=>{
  assert.deepEqual(resolveProductPaymentSelection({billingProvider:'CORA',billingMethod:'PIX'},{defaultProvider:'EFI',defaultMethod:'HYBRID'},{provider:'MERCADO_PAGO',method:'BOLETO'}),{provider:'CORA',method:'PIX'});
  assert.deepEqual(resolveProductPaymentSelection({},{defaultProvider:'EFI',defaultMethod:'HYBRID'},{provider:'MERCADO_PAGO',method:'BOLETO'}),{provider:'EFI',method:'HYBRID'});
  assert.deepEqual(resolveProductPaymentSelection({}, {},{provider:'MERCADO_PAGO',method:'BOLETO'}),{provider:'MERCADO_PAGO',method:'BOLETO'});
});

test('partial override never mixes provider and method from different levels',()=>{
  assert.throws(()=>resolveProductPaymentSelection({billingProvider:'EFI'},{defaultProvider:'CORA',defaultMethod:'PIX'},{provider:'MERCADO_PAGO',method:'BOLETO'}),(e:any)=>e?.code==='PAYMENT_SELECTION_INCOMPLETE');
  assert.throws(()=>resolveProductPaymentSelection({},{defaultProvider:'EFI'},{provider:'MERCADO_PAGO',method:'BOLETO'}),(e:any)=>e?.code==='PAYMENT_SELECTION_INCOMPLETE');
});

test('disabled or unconfigured provider cannot be saved as a product billing default',()=>{
  assert.throws(()=>validateProductBillingPair({provider:'EFI',method:'HYBRID'},{enabledByEnvironment:false,configured:true}),(e:any)=>e?.code==='PROVIDER_DISABLED');
  assert.throws(()=>validateProductBillingPair({provider:'EFI',method:'HYBRID'},{enabledByEnvironment:true,configured:false}),(e:any)=>e?.code==='PROVIDER_NOT_CONFIGURED');
  assert.deepEqual(validateProductBillingPair({provider:'EFI',method:'HYBRID'},{enabledByEnvironment:true,configured:true}),{provider:'EFI',method:'HYBRID'});
});

test('null pair means inherit and is valid',()=>{
  assert.deepEqual(validateProductBillingPair({provider:null,method:null},{enabledByEnvironment:false,configured:false}),{provider:null,method:null});
});
