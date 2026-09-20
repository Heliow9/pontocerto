export function effectiveReference(
  individual: number | null,
  group: number | null,
) {
  return individual ?? group;
}
export function reachedThresholds(worked: number, reference: number | null) {
  if (reference == null || reference <= 0) return [];
  return [
    worked >= reference / 2 ? "50" : null,
    worked >= reference ? "100" : null,
    worked > reference ? "OVER" : null,
  ].filter(Boolean) as string[];
}
export function hoursText(minutes: number) {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}
