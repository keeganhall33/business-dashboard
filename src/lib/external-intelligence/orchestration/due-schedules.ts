export type CadenceType = "hourly" | "every_n_hours" | "daily" | "weekly" | "monthly" | "manual" | "disabled";

export function computeNextRunAt(input: {
  now: Date;
  cadence_type: CadenceType;
  cadence_interval_seconds: number;
  last_run_at: Date | null;
}): Date | null {
  if (input.cadence_type === "disabled" || input.cadence_type === "manual") return null;

  const intervalMs = Math.max(0, input.cadence_interval_seconds) * 1000;
  if (intervalMs <= 0) return null;

  const base = input.last_run_at ?? input.now;
  return new Date(base.getTime() + intervalMs);
}

export function isDue(input: { now: Date; next_run_at: Date | null }): boolean {
  if (!input.next_run_at) return false;
  return input.next_run_at.getTime() <= input.now.getTime();
}
