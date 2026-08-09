import "@/lib/server-only";

import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import type { Claim } from "@/lib/external-intelligence/contracts/claim";
import { ClaimSchema, computeClaimFingerprint } from "@/lib/external-intelligence/contracts/claim";
import { canonicalizeClaimQualifiersV2 } from "@/lib/external-intelligence/contracts/claim-qualifiers-v2";
import { computeContentHash } from "@/lib/external-intelligence/contracts/version-ref";
import { PersistenceNotFoundError, PersistenceObjectTypeMismatchError } from "@/lib/external-intelligence/persistence/errors";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import { mapClaimStableRow, mapClaimVersionRow } from "@/lib/external-intelligence/persistence/supabase/row-mappers";
import { EXTERNAL_INTELLIGENCE_RPCS, runRpc } from "@/lib/external-intelligence/persistence/supabase/transactions";

export class ClaimRepository {
  async getStable(claim_id: string, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase.from("external_claims_v1").select("*").eq("claim_id", claim_id).limit(1).maybeSingle();
    if (q.error) throw new Error(`Failed to fetch claim stable: ${q.error.message}`);
    if (!q.data) throw new PersistenceNotFoundError(`Claim stable not found: ${claim_id}`);
    return mapClaimStableRow(q.data as unknown as Record<string, unknown>);
  }

  async getVersion(ref: VersionRef, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    if (ref.object_type !== "claim") {
      throw new PersistenceObjectTypeMismatchError("object_type_mismatch");
    }
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase
      .from("external_claim_versions_v1")
      .select("*")
      .eq("claim_id", ref.object_id)
      .eq("content_hash", ref.content_hash)
      .limit(1)
    .maybeSingle();
    if (q.error) throw new Error(`Failed to fetch claim version: ${q.error.message}`);
    if (!q.data) throw new PersistenceNotFoundError(`Claim version not found: ${ref.object_id}::${ref.content_hash}`);
    const mapped = mapClaimVersionRow(q.data as unknown as Record<string, unknown>);
    if (mapped.payload_available) {
      ClaimSchema.parse(mapped.payload_json);
    }
    return mapped;
  }

  async listVersions(claim_id: string, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase.from("external_claim_versions_v1").select("*").eq("claim_id", claim_id).order("created_at", {
      ascending: true
    });
    if (q.error) throw new Error(`Failed to list claim versions: ${q.error.message}`);
    return (q.data ?? []).map((r) => {
      const mapped = mapClaimVersionRow(r as unknown as Record<string, unknown>);
      if (mapped.payload_available) ClaimSchema.parse(mapped.payload_json);
      return mapped;
    });
  }

  async persistClaim(input: {
    claim: Claim;
    evidence_version_ref: VersionRef;
    policy_refs_json: unknown;
    interpretation_policy_hash: string;
    edge: { relation: string; policy_version: string; policy_hash: string };
    supplied_content_hash?: string | null;
    opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> };
  }): Promise<{ ref: VersionRef; created_new_version: boolean; idempotent_replay: boolean }> {
    const parsed = ClaimSchema.parse(input.claim);
    if (input.evidence_version_ref.object_type !== "evidence_reference") {
      throw new PersistenceObjectTypeMismatchError("object_type_mismatch");
    }

    // Canonicalize V2 qualifiers before integrity checks and persistence.
    // V1 payloads are preserved as-is.
    const canonicalParsed: Claim =
      parsed.schema_version === "claim_v2"
        ? {
            ...parsed,
            qualifiers: canonicalizeClaimQualifiersV2((parsed as Claim).qualifiers ?? [])
          }
        : parsed;

    const { claim_fingerprint: _claim_fingerprint, ...rest } = canonicalParsed;
    void _claim_fingerprint;
    const computedFingerprint = computeClaimFingerprint(rest);
    if (computedFingerprint !== canonicalParsed.claim_fingerprint) {
      throw new Error("integrity_conflict");
    }

    const version_content_hash = computeContentHash(canonicalParsed);
    if (input.supplied_content_hash && input.supplied_content_hash !== version_content_hash) {
      throw new Error("content_hash_mismatch");
    }

    const supabase = getExternalIntelligenceSupabaseClient({ client: input.opts?.client });
    const res = await runRpc<
      Array<{ claim_id: string; content_hash: string; created_new_version: boolean; idempotent_replay: boolean }>
    >({
      client: supabase,
      fn: EXTERNAL_INTELLIGENCE_RPCS.persistClaim,
      args: {
        in_claim_id: canonicalParsed.claim_id,
        in_content_hash: version_content_hash,
        in_schema_version: canonicalParsed.schema_version,
        in_claim_fingerprint: canonicalParsed.claim_fingerprint,
        in_interpretation_policy_version: canonicalParsed.interpretation_policy_version,
        in_interpretation_policy_hash: input.interpretation_policy_hash,

        in_evidence_reference_id: input.evidence_version_ref.object_id,
        in_evidence_content_hash: input.evidence_version_ref.content_hash,
        in_evidence_version_ref_json: input.evidence_version_ref,

        in_policy_refs_json: input.policy_refs_json,
        in_effective_at: canonicalParsed.event_time,
        in_valid_from: canonicalParsed.relevance_window.start,
        in_valid_until: canonicalParsed.relevance_window.end,
        in_supersedes_content_hashes: [],
        in_payload_json: canonicalParsed,
        in_retention_policy: "retain",
        in_retention_expires_at: null,
        in_legal_hold: false,
        in_access_revoked_at: null,
        in_content_redacted_at: null,
        in_redaction_reason: null,
        in_payload_available: true,

        in_edge_relation: input.edge.relation,
        in_edge_policy_version: input.edge.policy_version,
        in_edge_policy_hash: input.edge.policy_hash
      }
    });

    const row = res[0];
    if (!row) throw new Error("unknown_db_error");
    const ref: VersionRef = {
      object_type: "claim",
      object_id: row.claim_id,
      version_id: null,
      content_hash: row.content_hash,
      schema_version: canonicalParsed.schema_version,
      policy_version: canonicalParsed.interpretation_policy_version,
      created_at: new Date().toISOString()
    };
    return Object.freeze({
      ref: Object.freeze(ref),
      created_new_version: row.created_new_version,
      idempotent_replay: row.idempotent_replay
    });
  }
}
