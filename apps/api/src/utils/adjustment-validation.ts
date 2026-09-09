import { z } from "zod";
export function isLocalDateTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 2000 &&
    year <= 2100 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    hour < 24 &&
    minute < 60
  );
}
export const adjustmentSchema = z.object({
  timeEntryId: z.number().int().positive().nullable().optional(),
  requestedTime: z.string().refine(isLocalDateTime),
  entryType: z.enum([
    "CLOCK_IN",
    "BREAK_OUT",
    "BREAK_IN",
    "CLOCK_OUT",
    "OTHER",
  ]),
  reason: z.string().trim().min(5).max(500),
});
