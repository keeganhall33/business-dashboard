import "server-only";

import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import type { EvidenceReference } from "@/lib/external-intelligence/contracts/evidence-reference";
import { EvidenceReferenceSchema } from "@/lib/external-intelligence/contracts/evidence-reference";
import { createEvidenceReferenceFingerprint } from "@/lib/external-intelligence/hashing/fingerprints";
import { PersistenceNotFoundError } from "@/lib/external-intelligence/persistence/errors";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import { mapEvidenceStableRow, mapEvidenceVersionRow } from "@/lib/external-intelligence/persistence/supabase/row-mappers";
import { EXTERNAL_INTELLIGENCE_RPCS, runRpc } from "@/lib/external-intelligence/persistence/supabase/transactions";
import { computeContentHash } from "@/lib/external-intelligence/contracts/version-ref";

export class EvidenceReferenceRepository {
  async getStable(evidence_reference_id: string, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase
      .from("external_evidence_references_v1")
      .select("*")
      .eq("evidence_reference_id", evidence_reference_id)
      .limit(1)
      .maybeSingle();
    if (q.error) throw new Error(`Failed to fetch evidence stable: ${q.error.message}`);
    if (!q.data) throw new PersistenceNotFoundError(`Evidence stable not found: ${evidence_reference_id}`);
    return mapEvidenceStableRow(q.data as unknown as Record<string, unknown>);
  }

  async getVersion(ref: VersionRef, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase
      .from("external_evidence_reference_versions_v1")
      .select("*")
      .eq("evidence_reference_id", ref.object_id)
      .eq("content_hash", ref.content_hash)
      .limit(1)
      .maybeSingle();
    if (q.error) throw new Error(`Failed to fetch evidence version: ${q.error.message}`);
    if (!q.data) throw new PersistenceNotFoundError(`Evidence version not found: ${ref.object_id}::${ref.content_hash}`);
    return mapEvidenceVersionRow(q.data as unknown as Record<string, unknown>);
  }

  async listVersions(evidence_reference_id: string, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase
      .from("external_evidence_reference_versions_v1")
      .select("*")
      .eq("evidence_reference_id", evidence_reference_id)
      .order("created_at", { ascending: true });
    if (q.error) throw new Error(`Failed to list evidence versions: ${q.error.message}`);
    return (q.data ?? []).map((r) => mapEvidenceVersionRow(r as unknown as Record<string, unknown>));
  }

  async persistEvidenceReference(input: {
    evidence: EvidenceReference;
    policy_refs_json: unknown;
    policy_version: string;
  }): Promise<{ ref: VersionRef; created_new_version: boolean; idempotent_replay: boolean }> {
    const parsed = EvidenceReferenceSchema.parse(input.evidence);

    // Recompute canonical version identity (stable semantic fingerprint).
    const computed = createEvidenceReferenceFingerprint({
      source_id: parsed.source_id,
      source_config_version: parsed.source_config_version,
      source_set_id: parsed.source_set_id,
      source_artifact_identifier: parsed.source_artifact_identifier,
      source_url_or_reference: parsed.source_url_or_reference,
      content_hash: parsed.content_hash,
      retrieved_at: parsed.retrieved_at,
      published_at: parsed.published_at,
      event_time: parsed.event_time,
      evidence_type: parsed.evidence_type,
      access_classification: parsed.access_classification,
      legal_policy_version: parsed.legal_policy_version,
      retention_policy: parsed.retention_policy,
      excerpt_or_summary_reference: parsed.excerpt_or_summary_reference,
      source_credibility_prior: parsed.source_credibility_prior,
      correction_status: parsed.correction_status,
      retraction_status: parsed.retraction_status,
      supersedes_evidence_reference_id: parsed.supersedes_evidence_reference_id,
      schema_version: parsed.schema_version
    });

    const version_content_hash = computed;

    const supabase = getExternalIntelligenceSupabaseClient();

    const res = await runRpc<
      Array<{
        evidence_reference_id: string;
        content_hash: string;
        created_new_version: boolean;
        idempotent_replay: boolean;
      }>
    >({
      client: supabase,
      fn: EXTERNAL_INTELLIGENCE_RPCS.persistEvidence,
      args: {
        in_evidence_reference_id: parsed.evidence_reference_id,
        in_content_hash: version_content_hash,
        in_schema_version: parsed.schema_version,
        in_source_id: parsed.source_id,
        in_source_config_version: parsed.source_config_version,
        in_legal_policy_version: parsed.legal_policy_version,
        in_policy_refs_json: input.policy_refs_json,
        in_effective_at: parsed.event_time,
        in_valid_from: null,
        in_valid_until: null,
        in_supersedes_content_hashes: [],
        in_payload_json: parsed,
        in_retention_policy: parsed.retention_policy,
        in_retention_expires_at: null,
        in_legal_hold: false,
        in_access_revoked_at: null,
        in_content_redacted_at: null,
        in_redaction_reason: null,
        in_payload_available: true
      }
    });

    const row = res[0];
    if (!row) throw new Error("unknown_db_error");

    const ref: VersionRef = {
      object_type: "evidence_reference",
      object_id: row.evidence_reference_id,
      version_id: null,
      content_hash: row.content_hash,
      schema_version: parsed.schema_version,
      policy_version: input.policy_version,
      created_at: new Date().toISOString()
    };

    void computeContentHash;

    return { ref, created_new_version: row.created_new_version, idempotent_replay: row.idempotent_replay };
  }
}
