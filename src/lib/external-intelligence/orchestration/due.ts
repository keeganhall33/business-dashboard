export type Cadence = { type: "hourly" | "daily"; minutes?: number };

/**
 * Deterministic UTC due evaluation.
 * - hourly: next = start of next hour
 * - daily: next = start of next UTC day
 */
export function computeNextDueUtc(input: { now_iso: string; cadence: Cadence }): string {
  const now = new Date(input.now_iso);
  if (Number.isNaN(now.getTime())) throw new Error("invalid_argument");

  if (input.cadence.type === "hourly") {
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1, 0, 0, 0));
    return next.toISOString();
  }

  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  return next.toISOString();
}

export function isDueUtc(input: { now_iso: string; next_run_at: string | null }): boolean {
  if (!input.next_run_at) return true;
  return Date.parse(input.next_run_at) <= Date.parse(input.now_iso);
}
