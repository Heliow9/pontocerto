export const WHATSAPP_MIN_RECIPIENT_INTERVAL_SECONDS = 30;
export const WHATSAPP_MAX_MESSAGES_PER_HOUR = 10;

type AlertLike = {
  threshold_key: string;
  message_text: string;
};

const thresholdRank: Record<string, number> = {
  "50": 1,
  "100": 2,
  OVER: 3,
};

export function consolidateOvertimeAlertMessage(alerts: AlertLike[]) {
  if (!alerts.length) return "";
  if (alerts.length === 1) return alerts[0].message_text;

  const ordered = [...alerts].sort(
    (a, b) =>
      (thresholdRank[a.threshold_key] || 99) -
      (thresholdRank[b.threshold_key] || 99),
  );
  const source = ordered[ordered.length - 1].message_text;
  const lines = source.split("\n");
  const base = lines.length > 1 ? lines.slice(0, -1).join("\n") : source;
  const reached = ordered.map((alert) => alert.threshold_key);
  const parts: string[] = [];
  if (reached.includes("50")) parts.push("50%");
  if (reached.includes("100")) parts.push("100%");
  if (reached.includes("OVER")) parts.push("referência ultrapassada");
  const joined =
    parts.length <= 1
      ? parts[0] || "novo marco"
      : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
  return `${base}\nMarcos atingidos nesta atualização: ${joined}. O registro de ponto permanece liberado.`;
}

export function receiptState(receipt: any): "READ" | "DELIVERED" | null {
  if (receipt?.readTimestamp || receipt?.playedTimestamp) return "READ";
  if (receipt?.receiptTimestamp) return "DELIVERED";
  return null;
}

export function retryDelaySeconds(attemptCount: number) {
  if (attemptCount <= 0) return 30;
  if (attemptCount === 1) return 120;
  if (attemptCount === 2) return 300;
  return 900;
}
