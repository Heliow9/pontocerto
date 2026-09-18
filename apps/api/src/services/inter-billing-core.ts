import type { ChargeStatus } from "./financial-rules.js";

export type InterEnvironment = "production" | "sandbox";

export type InterConfigShape = {
  enabled: boolean;
  environment: InterEnvironment;
  clientId?: string;
  clientSecret?: string;
  certPath?: string;
  keyPath?: string;
  account?: string;
  webhookUrl?: string;
};

export type InterPayerInput = {
  document: string;
  name: string;
  address: string;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city: string;
  state: string;
  zipCode: string;
  email?: string | null;
  phone?: string | null;
};

export type InterIssueInput = {
  yourNumber: string;
  amount: number;
  dueDate: string;
  cancelDays: number;
  payer: InterPayerInput;
  message?: string | null;
};

export type NormalizedInterCharge = {
  providerChargeId: string | null;
  yourNumber: string | null;
  providerStatus: string;
  localStatus: ChargeStatus;
  nominalAmount: number | null;
  amountReceived: number | null;
  origin: "BOLETO" | "PIX" | null;
  paidAt: string | null;
  barcode: string | null;
  digitableLine: string | null;
  pixCopyPaste: string | null;
  txid: string | null;
  raw: unknown;
};

export function digitsOnly(value: string | null | undefined): string {
  return String(value || "").replace(/\D/g, "");
}

export function interTokenReusable(expiresAtMs: number, nowMs = Date.now(), marginMs = 60_000): boolean {
  return Number.isFinite(expiresAtMs) && expiresAtMs - marginMs > nowMs;
}

export function redactedInterConfig(config: InterConfigShape) {
  return {
    enabled: config.enabled,
    environment: config.environment,
    clientIdConfigured: Boolean(config.clientId),
    clientSecretConfigured: Boolean(config.clientSecret),
    certConfigured: Boolean(config.certPath),
    keyConfigured: Boolean(config.keyPath),
    accountConfigured: Boolean(config.account),
    webhookUrl: config.webhookUrl || null,
  };
}

function splitPhone(value?: string | null): { ddd?: string; telefone?: string } {
  const digits = digitsOnly(value);
  if (digits.length < 10) return {};
  return { ddd: digits.slice(0, 2), telefone: digits.slice(2, 11) };
}

export function buildInterIssuePayload(input: InterIssueInput) {
  const document = digitsOnly(input.payer.document);
  const zipCode = digitsOnly(input.payer.zipCode);
  const required = [
    ["documento", document],
    ["nome", input.payer.name?.trim()],
    ["endereço", input.payer.address?.trim()],
    ["cidade", input.payer.city?.trim()],
    ["UF", input.payer.state?.trim()],
    ["CEP", zipCode],
  ] as const;
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (![11, 14].includes(document.length)) missing.push("CPF/CNPJ válido" as never);
  if (zipCode.length !== 8) missing.push("CEP válido" as never);
  if (!/^[A-Z]{2}$/i.test(input.payer.state || "")) missing.push("UF válida" as never);
  if (missing.length) throw new Error(`Complete o cadastro do pagador antes da emissão: ${missing.join(", ")}.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new Error("Vencimento inválido para emissão no Inter.");
  if (!Number.isFinite(input.amount) || input.amount < 2.5) throw new Error("O Banco Inter exige valor nominal mínimo de R$ 2,50.");
  if (!Number.isInteger(input.cancelDays) || input.cancelDays < 0 || input.cancelDays > 60)
    throw new Error("O prazo de cancelamento bancário deve ficar entre 0 e 60 dias.");
  const phone = splitPhone(input.payer.phone);
  return {
    seuNumero: input.yourNumber.slice(0, 15),
    valorNominal: Math.round(input.amount * 100) / 100,
    dataVencimento: input.dueDate,
    numDiasAgenda: input.cancelDays,
    pagador: {
      cpfCnpj: document,
      tipoPessoa: document.length === 14 ? "JURIDICA" : "FISICA",
      nome: input.payer.name.trim().slice(0, 100),
      endereco: input.payer.address.trim().slice(0, 100),
      numero: (input.payer.number?.trim() || "S/N").slice(0, 10),
      ...(input.payer.complement?.trim() ? { complemento: input.payer.complement.trim().slice(0, 30) } : {}),
      ...(input.payer.district?.trim() ? { bairro: input.payer.district.trim().slice(0, 60) } : {}),
      cidade: input.payer.city.trim().slice(0, 60),
      uf: input.payer.state.trim().toUpperCase(),
      cep: zipCode,
      ...(input.payer.email?.trim() ? { email: input.payer.email.trim().slice(0, 100) } : {}),
      ...phone,
    },
    formasRecebimento: "BOLETO_PIX",
    ...(input.message?.trim() ? { mensagem: { linha1: input.message.trim().slice(0, 78) } } : {}),
  };
}

export function mapInterStatus(status: unknown): ChargeStatus {
  switch (String(status || "").toUpperCase()) {
    case "RECEBIDO":
    case "MARCADO_RECEBIDO":
      return "PAID";
    case "ATRASADO":
    case "PROTESTO":
      return "OVERDUE";
    case "A_RECEBER":
      return "OPEN";
    case "CANCELADO":
    case "EXPIRADO":
      return "CANCELED";
    case "FALHA":
    case "FALHA_EMISSAO":
      return "FAILED";
    case "EM_PROCESSAMENTO":
    default:
      return "ISSUING";
  }
}

function moneyOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function extractInterChargeDetails(data: any): NormalizedInterCharge {
  const cobranca = data?.cobranca || data || {};
  const boleto = data?.boleto || cobranca?.boleto || {};
  const pix = data?.pix || cobranca?.pix || {};
  const providerStatus = String(cobranca?.situacao || data?.situacao || "").toUpperCase();
  const originRaw = String(cobranca?.origemRecebimento || data?.origemRecebimento || "").toUpperCase();
  const origin = originRaw === "PIX" || originRaw === "BOLETO" ? originRaw : null;
  return {
    providerChargeId: cobranca?.codigoSolicitacao || data?.codigoSolicitacao || null,
    yourNumber: cobranca?.seuNumero || data?.seuNumero || null,
    providerStatus,
    localStatus: mapInterStatus(providerStatus),
    nominalAmount: moneyOrNull(cobranca?.valorNominal ?? data?.valorNominal),
    amountReceived: moneyOrNull(cobranca?.valorTotalRecebimento ?? data?.valorTotalRecebimento ?? cobranca?.valorTotalRecebido ?? data?.valorTotalRecebido),
    origin,
    paidAt: cobranca?.dataPagamento || cobranca?.dataHoraSituacao || cobranca?.dataSituacao || data?.dataHoraSituacao || null,
    barcode: boleto?.codigoBarras || cobranca?.codigoBarras || data?.codigoBarras || null,
    digitableLine: boleto?.linhaDigitavel || cobranca?.linhaDigitavel || data?.linhaDigitavel || null,
    pixCopyPaste: pix?.pixCopiaECola || cobranca?.pixCopiaECola || data?.pixCopiaECola || null,
    txid: pix?.txid || cobranca?.txid || data?.txid || null,
    raw: data,
  };
}
