import "server-only";

import type { ProcessingRunRecord } from "@/lib/external-intelligence/persistence/records";
import { processingRunIdempotencyKey } from "@/lib/external-intelligence/persistence/idempotency";
import { PersistenceNotFoundError } from "@/lib/external-intelligence/persistence/errors";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";

export class ProcessingRunRepository {
  async upsertRun(input: ProcessingRunRecord, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });

    const idem = processingRunIdempotencyKey({
      input_set_fingerprint: input.input_set_fingerprint,
      source_registry_hash: input.source_registry_hash,
      policy_bundle_hash: input.policy_bundle_hash,
      engine_version: input.engine_version
    });

    const row = {
      ...input,
      policy_refs_json: input.policy_refs,
      reason_codes: input.reason_codes,
      input_refs_json: input.input_refs,
      output_refs_json: input.output_refs,
      required_provenance_edges_json: input.required_provenance_edges,
      _idempotency_debug: idem
    };

    const { error } = await supabase.from("external_processing_runs_v1").upsert(row, {
      onConflict: "input_set_fingerprint,source_registry_hash,policy_bundle_hash,engine_version"
    });
    if (error) throw new Error(`Failed to upsert processing run: ${error.message}`);
  }

  async fetch(run_id: string, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase.from("external_processing_runs_v1").select("*").eq("run_id", run_id).limit(1).maybeSingle();
    if (q.error) throw new Error(`Failed to fetch run: ${q.error.message}`);
    if (!q.data) throw new PersistenceNotFoundError(`Run not found: ${run_id}`);
    return q.data as unknown as ProcessingRunRecord;
  }
}
