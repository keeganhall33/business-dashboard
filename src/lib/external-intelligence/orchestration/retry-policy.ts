export type RetryDecision =
  | { action: "no_retry"; reason: string }
  | { action: "retry_at"; reason: string; next_retry_at_iso: string };

export function computeExponentialBackoffSeconds(input: {
  attempt_count: number;
  base_seconds: number;
  max_seconds: number;
}): number {
  const n = Math.max(0, input.attempt_count);
  const raw = input.base_seconds * Math.pow(2, n);
  return Math.min(input.max_seconds, Math.floor(raw));
}
