export type PaymentProviderCode = "CORA" | "EFI" | "MERCADO_PAGO";
export type HistoricalPaymentProviderCode = PaymentProviderCode | "LEGACY";
export type PaymentMethodCode = "HYBRID" | "PIX" | "BOLETO";
export type ConfirmedPaymentMethod = "PIX" | "BOLETO" | "OTHER" | "MANUAL";
export type ProviderLocalStatus = "OPEN" | "PAID" | "PROCESSING" | "CANCELED" | "FAILED";

export type ProviderCapabilities = {
  pix: boolean;
  boleto: boolean;
  hybridBoletoPix: boolean;
  pdf: boolean;
  hostedCheckout: boolean;
  webhook: boolean;
};

export type ProviderPayer = {
  document: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
};

export type ProviderIssuePaymentTerms = {
  discountAmount?: number | null;
  fineAmount?: number | null;
  interestRate?: number | null;
};

export type ProviderIssueInput = {
  externalReference: string;
  idempotencyKey: string;
  amount: number;
  dueDate: string;
  description: string;
  payer: ProviderPayer;
  paymentMethod: PaymentMethodCode;
  paymentTerms?: ProviderIssuePaymentTerms | null;
};

export type ProviderIssueResult = {
  provider: PaymentProviderCode;
  requestedMethod: PaymentMethodCode;
  externalReference: string | null;
  providerChargeId: string;
  status: ProviderLocalStatus;
  paymentUrl?: string | null;
  pdfUrl?: string | null;
  barcode?: string | null;
  digitableLine?: string | null;
  pixCopyPaste?: string | null;
  pixQrCode?: string | null;
  raw: unknown;
};

export type ProviderChargeSnapshot = ProviderIssueResult & {
  paidAt?: string | null;
  confirmedPaymentMethod?: "PIX" | "BOLETO" | "OTHER" | null;
  providerPaymentId?: string | null;
  nominalAmount?: number | null;
  receivedAmount?: number | null;
  providerFee?: number | null;
  netAmount?: number | null;
  paidFine?: number | null;
  paidInterest?: number | null;
  configuredDiscountAmount?: number | null;
  configuredDiscountPercent?: number | null;
};

export type ProviderLookupHint = {
  createdAt?: string | null;
  dueDate?: string | null;
  payerDocument?: string | null;
};

export type ProviderConnectionStatus = {
  code: PaymentProviderCode;
  configured: boolean;
  enabledByEnvironment: boolean;
  environment: "sandbox" | "production";
  missing: string[];
  capabilities: ProviderCapabilities;
  webhookUrl: string | null;
};

export type ProviderConnectionTest = {
  ok: boolean;
  provider: PaymentProviderCode;
  environment: "sandbox" | "production";
  message: string;
};

export interface PaymentProvider {
  code: PaymentProviderCode;
  capabilities(): ProviderCapabilities;
  connectionStatus(): ProviderConnectionStatus;
  testConnection(): Promise<ProviderConnectionTest>;
  issue(input: ProviderIssueInput): Promise<ProviderIssueResult>;
  getCharge(providerChargeId: string, externalReference: string, requestedMethod: PaymentMethodCode): Promise<ProviderChargeSnapshot | null>;
  findChargeByExternalReference?(externalReference: string, requestedMethod: PaymentMethodCode, hint?: ProviderLookupHint): Promise<ProviderChargeSnapshot | null>;
  cancel(providerChargeId: string, requestedMethod: PaymentMethodCode): Promise<void>;
  getPdf?(providerChargeId: string, requestedMethod: PaymentMethodCode): Promise<Buffer>;
  configureWebhook?(url: string): Promise<unknown>;
}
