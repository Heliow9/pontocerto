export type ControlIdEntryType =
  | "CLOCK_IN"
  | "BREAK_OUT"
  | "BREAK_IN"
  | "CLOCK_OUT"
  | "OTHER";

export function controlIdEntryTypeForSequence(count: number): ControlIdEntryType {
  return (["CLOCK_IN", "BREAK_OUT", "BREAK_IN", "CLOCK_OUT"] as const)[count] ?? "OTHER";
}

export function controlIdSqlTimestamp(unix: number) {
  if (!Number.isSafeInteger(unix) || unix < 946684800 || unix > 4102444800)
    throw new Error("Horário do evento Control iD inválido.");
  return new Date(unix * 1000 - 3 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

export function controlIdEventDecision(args: {
  event: number;
  userId: string;
  mappingFound: boolean;
  occurredAfterDisabled: boolean;
}) {
  if (args.event !== 7)
    return { action: "REJECT" as const, reason: "ACCESS_NOT_GRANTED" as const };
  if (!args.mappingFound)
    return { action: "QUARANTINE" as const, reason: "EMPLOYEE_MAPPING_NOT_FOUND" as const };
  if (args.occurredAfterDisabled)
    return { action: "QUARANTINE" as const, reason: "EMPLOYEE_MAPPING_DISABLED" as const };
  return { action: "PUNCH" as const, reason: null };
}
