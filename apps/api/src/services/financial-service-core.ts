export type ReconciliationAction = "PAY" | "SYNC" | "HOLD";

export function providerYourNumber(chargeId: number): string {
  if (!Number.isInteger(chargeId) || chargeId <= 0) throw new Error("Identificador da cobrança inválido.");
  return `PC${String(chargeId).padStart(12, "0")}`.slice(-15);
}

export function monthlyDescription(competence: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(competence);
  if (!match) throw new Error("Competência inválida.");
  return `Mensalidade Ponto Certo - ${match[2]}/${match[1]}`;
}

function cents(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.round(value * 100);
}

export function reconciliationDecision(input: {
  localAmount: number;
  localYourNumber: string;
  providerChargeId: string | null;
  providerYourNumber: string | null;
  providerStatus: string;
  providerNominalAmount: number | null;
  providerReceivedAmount: number | null;
}): { action: ReconciliationAction; reason: string | null } {
  if (!input.providerChargeId) return { action: "HOLD", reason: "Cobrança do provedor sem identificador." };
  if (!input.providerYourNumber || input.providerYourNumber !== input.localYourNumber)
    return { action: "HOLD", reason: "O identificador seuNumero retornado pelo banco não corresponde à cobrança local." };
  if (cents(input.providerNominalAmount) !== cents(input.localAmount))
    return { action: "HOLD", reason: "O valor nominal retornado pelo banco diverge da cobrança local." };
  if (input.providerStatus === "PAID") {
    if (cents(input.providerReceivedAmount) !== cents(input.localAmount))
      return { action: "HOLD", reason: "O valor recebido não corresponde ao valor integral da cobrança." };
    return { action: "PAY", reason: null };
  }
  return { action: "SYNC", reason: null };
}
