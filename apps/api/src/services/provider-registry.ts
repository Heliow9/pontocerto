import type { PaymentProvider, PaymentProviderCode } from "./payment-provider.types.js";
import { coraProvider } from "./cora-provider.js";
import { efiProvider } from "./efi-provider.js";
import { mercadoPagoProvider } from "./mercado-pago-provider.js";

const providers: Record<PaymentProviderCode, PaymentProvider> = {
  CORA: coraProvider,
  EFI: efiProvider,
  MERCADO_PAGO: mercadoPagoProvider,
};

export function getPaymentProvider(code: PaymentProviderCode): PaymentProvider {
  return providers[code];
}

export function listPaymentProviders(): PaymentProvider[] {
  return Object.values(providers);
}
