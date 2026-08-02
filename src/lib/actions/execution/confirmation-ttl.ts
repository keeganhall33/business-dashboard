export const DEFAULT_CONFIRMATION_TTL_SECONDS = 900;

export function getConfirmationTtlSeconds(): number {
  const raw = Number(process.env.ACTIONS_EXECUTION_CONFIRMATION_TTL_SECONDS ?? "");
  const ttl = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CONFIRMATION_TTL_SECONDS;
  return Math.min(Math.max(ttl, 60), 3600);
}
