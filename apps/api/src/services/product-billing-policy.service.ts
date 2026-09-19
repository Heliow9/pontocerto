import {assertProviderMethod,isPaymentMethodCode,isPaymentProviderCode} from './payment-provider-core.js';
import {getPaymentProvider} from './provider-registry.js';
import {validateProductBillingPair} from './product-subscription-core.js';
import type {PaymentMethodCode,PaymentProviderCode} from './payment-provider.types.js';

const invalid=(message:string)=>Object.assign(new Error(message),{status:400,code:'PRODUCT_BILLING_POLICY_INVALID'});
export function assertConfiguredProductBillingPair(provider:unknown,method:unknown){
  if(provider==null&&method==null)return{provider:null,method:null};
  if(!isPaymentProviderCode(provider))throw invalid('Provedor de pagamento inválido para o produto/assinatura.');
  if(!isPaymentMethodCode(method))throw invalid('Método de pagamento inválido para o produto/assinatura.');
  const p=provider as PaymentProviderCode,m=method as PaymentMethodCode;assertProviderMethod(p,m);
  const status=getPaymentProvider(p).connectionStatus();return validateProductBillingPair({provider:p,method:m},status);
}
