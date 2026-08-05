export type ConcurrencyCaps = {
  global_limit: number;
  per_concurrency_key_limit: number;
};

export function normalizeCaps(input: Partial<ConcurrencyCaps>): ConcurrencyCaps {
  return {
    global_limit: Math.max(0, Math.floor(input.global_limit ?? 0)),
    per_concurrency_key_limit: Math.max(0, Math.floor(input.per_concurrency_key_limit ?? 0))
  };
}
