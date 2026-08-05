import "server-only";

import type { ProvenanceEdgeRecord } from "@/lib/external-intelligence/persistence/records";
import { provenanceEdgeIdempotencyKey } from "@/lib/external-intelligence/persistence/idempotency";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";

export class ProvenanceRepository {
  async upsertEdge(edge: ProvenanceEdgeRecord, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const edge_id = provenanceEdgeIdempotencyKey({
      from_ref: edge.from_ref,
      to_ref: edge.to_ref,
      relation: edge.relation,
      policy_version: edge.policy_version
    });

    const row = {
      edge_id,
      from_object_type: edge.from_ref.object_type,
      from_object_id: edge.from_ref.object_id,
      from_content_hash: edge.from_ref.content_hash,
      to_object_type: edge.to_ref.object_type,
      to_object_id: edge.to_ref.object_id,
      to_content_hash: edge.to_ref.content_hash,
      relation: edge.relation,
      policy_version: edge.policy_version,
      policy_hash: edge.policy_version,
      from_ref_json: edge.from_ref,
      to_ref_json: edge.to_ref,
      metadata_json: {},
      created_at: edge.created_at
    };

    const { error } = await supabase.from("external_provenance_edges_v1").upsert(row, {
      onConflict:
        "from_object_type,from_object_id,from_content_hash,to_object_type,to_object_id,to_content_hash,relation,policy_hash"
    });
    if (error) throw new Error(`Failed to upsert provenance edge: ${error.message}`);
  }

  async listEdgesFrom(from_ref: ProvenanceEdgeRecord["from_ref"], opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase
      .from("external_provenance_edges_v1")
      .select("from_ref_json,to_ref_json,relation,policy_version,created_at")
      .eq("from_object_type", from_ref.object_type)
      .eq("from_object_id", from_ref.object_id)
      .eq("from_content_hash", from_ref.content_hash)
      .order("created_at", { ascending: true });
    if (q.error) throw new Error(`Failed to list provenance edges from: ${q.error.message}`);
    return (q.data ?? []).map((raw) => {
      const r = raw as unknown as Record<string, unknown>;
      return {
        from_ref: r.from_ref_json as ProvenanceEdgeRecord["from_ref"],
        to_ref: r.to_ref_json as ProvenanceEdgeRecord["to_ref"],
        relation: String(r.relation),
        policy_version: String(r.policy_version),
        created_at: String(r.created_at)
      };
    });
  }

  async listEdgesTo(to_ref: ProvenanceEdgeRecord["to_ref"], opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase
      .from("external_provenance_edges_v1")
      .select("from_ref_json,to_ref_json,relation,policy_version,created_at")
      .eq("to_object_type", to_ref.object_type)
      .eq("to_object_id", to_ref.object_id)
      .eq("to_content_hash", to_ref.content_hash)
      .order("created_at", { ascending: true });
    if (q.error) throw new Error(`Failed to list provenance edges to: ${q.error.message}`);
    return (q.data ?? []).map((raw) => {
      const r = raw as unknown as Record<string, unknown>;
      return {
        from_ref: r.from_ref_json as ProvenanceEdgeRecord["from_ref"],
        to_ref: r.to_ref_json as ProvenanceEdgeRecord["to_ref"],
        relation: String(r.relation),
        policy_version: String(r.policy_version),
        created_at: String(r.created_at)
      };
    });
  }
}
