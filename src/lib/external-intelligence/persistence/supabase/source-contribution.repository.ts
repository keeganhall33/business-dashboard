import "server-only";

import type { SourceContributionRecord } from "@/lib/external-intelligence/persistence/records";
import { sourceContributionIdempotencyKey } from "@/lib/external-intelligence/persistence/idempotency";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";

export class SourceContributionRepository {
  async recordContribution(c: SourceContributionRecord, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const contribution_id = sourceContributionIdempotencyKey({
      target_ref: c.target_ref,
      source_id: c.source_id,
      source_set_id: c.source_set_id,
      evidence_reference_version_ref: c.evidence_reference_version_ref
    });

    const row = {
      contribution_id,
      target_object_type: c.target_ref.object_type,
      target_object_id: c.target_ref.object_id,
      target_content_hash: c.target_ref.content_hash,
      target_ref_json: c.target_ref,
      source_id: c.source_id,
      source_set_id: c.source_set_id,
      evidence_reference_object_id: c.evidence_reference_version_ref.object_id,
      evidence_reference_content_hash: c.evidence_reference_version_ref.content_hash,
      evidence_reference_version_ref_json: c.evidence_reference_version_ref,
      created_at: c.created_at
    };

    const { error } = await supabase
      .from("external_source_contributions_v1")
      .upsert(row, {
        onConflict:
          "target_object_type,target_object_id,target_content_hash,source_id,evidence_reference_object_id,evidence_reference_content_hash"
      });
    if (error) throw new Error(`Failed to upsert source contribution: ${error.message}`);
  }

  async listContributions(target_ref: SourceContributionRecord["target_ref"], opts?: {
    client?: ReturnType<typeof getExternalIntelligenceSupabaseClient>;
  }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase
      .from("external_source_contributions_v1")
      .select("*")
      .eq("target_object_type", target_ref.object_type)
      .eq("target_object_id", target_ref.object_id)
      .eq("target_content_hash", target_ref.content_hash)
      .order("created_at", { ascending: true });
    if (q.error) throw new Error(`Failed to list contributions: ${q.error.message}`);
    return (q.data ?? []) as unknown as SourceContributionRecord[];
  }
}
