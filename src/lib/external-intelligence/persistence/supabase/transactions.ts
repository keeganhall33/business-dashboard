import "server-only";

import type { SupabaseServerClient } from "@/lib/external-intelligence/persistence/supabase/client";

/**
 * Supabase JS (PostgREST) does not provide multi-statement SQL transactions.
 *
 * Phase A5 schema requires stable<->version circular constraints that MUST be satisfied
 * within a single DB transaction. Therefore A6 writes require an RPC function.
 *
 * A6 store calls supabase.rpc(...) for any write that spans stable + version rows.
 */
export async function runRpc<T>(input: {
  client: SupabaseServerClient;
  fn: string;
  args: Record<string, unknown>;
}): Promise<T> {
  const res = await input.client.rpc(input.fn, input.args);
  if (res.error) throw new Error(`RPC ${input.fn} failed: ${res.error.message}`);
  return res.data as T;
}
