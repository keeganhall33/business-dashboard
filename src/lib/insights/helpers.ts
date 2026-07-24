export function clampFreshnessHours(value: number | null | undefined) {
  if (value == null) return null;
  return Math.max(0, value);
}
