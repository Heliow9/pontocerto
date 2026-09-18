import type { ChargeStatus } from "./financial-rules.js";

export type AccessCharge = {
  id: number;
  status: ChargeStatus;
  blockAt: string;
  excepted: boolean;
};

export function decideFinancialAccess(input: {
  autoBlockEnabled: boolean;
  now: string;
  charges: AccessCharge[];
  globalExceptionEndsAt: string | null;
}) {
  if (!input.autoBlockEnabled) return { blocked: false, blockingChargeIds: [] as number[] };
  const nowMs = new Date(input.now).getTime();
  if (input.globalExceptionEndsAt && new Date(input.globalExceptionEndsAt).getTime() >= nowMs)
    return { blocked: false, blockingChargeIds: [] as number[] };
  const today = input.now.slice(0, 10);
  const blockingChargeIds = input.charges
    .filter((c) => (c.status === "OPEN" || c.status === "OVERDUE") && c.blockAt <= today && !c.excepted)
    .map((c) => c.id);
  return { blocked: blockingChargeIds.length > 0, blockingChargeIds };
}

export function exceptionEndFromPreset(nowIso: string, days: number) {
  if (![5, 10, 30].includes(days)) throw new Error("A prorrogação deve ser de 5, 10 ou 30 dias.");
  const d = new Date(nowIso);
  if (Number.isNaN(d.getTime())) throw new Error("Data inicial inválida.");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}
