import "@/lib/server-only";

import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import type { ExternalSignal } from "@/lib/external-intelligence/contracts/external-signal";
import { ExternalSignalSchema } from "@/lib/external-intelligence/contracts/external-signal";
import { computeContentHash, VersionRefSchema } from "@/lib/external-intelligence/contracts/version-ref";
import { PolicyRefSchema } from "@/lib/external-intelligence/contracts/policy-ref";
import { createExternalSignalFingerprint } from "@/lib/external-intelligence/hashing/fingerprints";
import { PersistenceNotFoundError, PersistenceObjectTypeMismatchError } from "@/lib/external-intelligence/persistence/errors";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import { mapSignalStableRow, mapSignalVersionRow } from "@/lib/external-intelligence/persistence/supabase/row-mappers";
import { EXTERNAL_INTELLIGENCE_RPCS, runRpc } from "@/lib/external-intelligence/persistence/supabase/transactions";

export class ExternalSignalRepository {
  async getStable(signal_id: string, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase.from("external_signals_v1").select("*").eq("signal_id", signal_id).limit(1).maybeSingle();
    if (q.error) throw new Error(`Failed to fetch signal stable: ${q.error.message}`);
    if (!q.data) throw new PersistenceNotFoundError(`Signal stable not found: ${signal_id}`);
    return mapSignalStableRow(q.data as unknown as Record<string, unknown>);
  }

  async getVersion(ref: VersionRef, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    if (ref.object_type !== "signal") {
      throw new PersistenceObjectTypeMismatchError("object_type_mismatch");
    }
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase
      .from("external_signal_versions_v1")
      .select("*")
      .eq("signal_id", ref.object_id)
      .eq("content_hash", ref.content_hash)
      .limit(1)
    .maybeSingle();
    if (q.error) throw new Error(`Failed to fetch signal version: ${q.error.message}`);
    if (!q.data) throw new PersistenceNotFoundError(`Signal version not found: ${ref.object_id}::${ref.content_hash}`);
    const mapped = mapSignalVersionRow(q.data as unknown as Record<string, unknown>);
    if (mapped.payload_available) {
      ExternalSignalSchema.parse(mapped.payload_json);
    }
    return mapped;
  }

  async listVersions(signal_id: string, opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> }) {
    const supabase = getExternalIntelligenceSupabaseClient({ client: opts?.client });
    const q = await supabase
      .from("external_signal_versions_v1")
      .select("*")
      .eq("signal_id", signal_id)
      .order("created_at", { ascending: true });
    if (q.error) throw new Error(`Failed to list signal versions: ${q.error.message}`);
    return (q.data ?? []).map((r) => {
      const mapped = mapSignalVersionRow(r as unknown as Record<string, unknown>);
      if (mapped.payload_available) ExternalSignalSchema.parse(mapped.payload_json);
      return mapped;
    });
  }

  async persistSignalWriteSet(input: {
    signal: ExternalSignal;
    policy_refs: unknown[];
    /** required provenance edges encoded exactly as the RPC expects */
    required_provenance_edges_json: unknown[];
    /** required source contributions encoded exactly as the RPC expects */
    required_source_contributions_json: unknown[];
    optional_lifecycle_transition_json?: unknown | null;
    run_attachment?: { run_id: string; expected_output_count: number; output_refs: VersionRef[] } | null;
    interpretation_policy_hash: string;
    supplied_content_hash?: string | null;
    confidence_summary_json?: unknown | null;
    opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> };
  }): Promise<{
    ref: VersionRef;
    created_new_version: boolean;
    idempotent_replay: boolean;
    persisted_provenance_count: number;
    persisted_contribution_count: number;
    resulting_run_status: string | null;
  }> {
    const parsed = ExternalSignalSchema.parse(input.signal);

    // Validate + normalize VersionRefs.
    const claimRefs = parsed.claim_version_refs.map((r) => VersionRefSchema.parse(r));
    const evidenceRefs = parsed.evidence_reference_version_refs.map((r) => VersionRefSchema.parse(r));

    for (const r of claimRefs) {
      if (r.object_type !== "claim") throw new Error("object_type_mismatch");
    }
    for (const r of evidenceRefs) {
      if (r.object_type !== "evidence_reference") throw new Error("object_type_mismatch");
    }

    // Reject id-only references (already enforced by VersionRefSchema content_hash regex + object_id min(1)).

    // Validate PolicyRefs.
    const policyRefs = input.policy_refs.map((p) => PolicyRefSchema.parse(p));

    // Recompute fingerprint.
    const computedFingerprint = createExternalSignalFingerprint({
      entity_ids: parsed.affected_entities.map((e) => e.entity_id),
      signal_type: parsed.signal_type,
      core_claim_fingerprint: claimRefs[0]?.content_hash ?? "", // caller must ensure at least one claim ref for a meaningful signal
      event_window: { start: parsed.first_observed_at ?? null, end: parsed.last_observed_at ?? null },
      business_domains: parsed.business_domains,
      geography: parsed.geography,
      mechanism: parsed.expected_business_mechanism
    });

    if (computedFingerprint !== parsed.signal_fingerprint) {
      throw new Error("integrity_conflict");
    }

    const version_content_hash = computeContentHash(parsed);
    if (input.supplied_content_hash && input.supplied_content_hash !== version_content_hash) {
      throw new Error("content_hash_mismatch");
    }

    // Validate that normalized endpoint fields agree with VersionRef JSON for edges/contributions.
    const requireString = (v: unknown, code: string) => {
      if (typeof v !== "string" || v.length === 0) throw new Error(code);
      return v;
    };
    for (const raw of input.required_provenance_edges_json) {
      const edge = raw as Record<string, unknown>;
      const fromRef = edge.from_ref_json as Record<string, unknown> | undefined;
      const toRef = edge.to_ref_json as Record<string, unknown> | undefined;
      if (!fromRef || !toRef) throw new Error("version_ref_mismatch");
      if (
        String(fromRef.object_type) !== requireString(edge.from_object_type, "version_ref_mismatch") ||
        String(fromRef.object_id) !== requireString(edge.from_object_id, "version_ref_mismatch") ||
        String(fromRef.content_hash) !== requireString(edge.from_content_hash, "version_ref_mismatch")
      ) {
        throw new Error("version_ref_mismatch");
      }
      if (
        String(toRef.object_type) !== requireString(edge.to_object_type, "version_ref_mismatch") ||
        String(toRef.object_id) !== requireString(edge.to_object_id, "version_ref_mismatch") ||
        String(toRef.content_hash) !== requireString(edge.to_content_hash, "version_ref_mismatch")
      ) {
        throw new Error("version_ref_mismatch");
      }
    }

    for (const raw of input.required_source_contributions_json) {
      const c = raw as Record<string, unknown>;
      const targetRef = c.target_ref_json as Record<string, unknown> | undefined;
      if (!targetRef) throw new Error("version_ref_mismatch");
      if (
        String(targetRef.object_type) !== requireString(c.target_object_type, "version_ref_mismatch") ||
        String(targetRef.object_id) !== requireString(c.target_object_id, "version_ref_mismatch") ||
        String(targetRef.content_hash) !== requireString(c.target_content_hash, "version_ref_mismatch")
      ) {
        throw new Error("version_ref_mismatch");
      }
    }

    const supabase = getExternalIntelligenceSupabaseClient({ client: input.opts?.client });

    const res = await runRpc<
      Array<{
        signal_id: string;
        content_hash: string;
        created_new_version: boolean;
        idempotent_replay: boolean;
        persisted_provenance_count: number;
        persisted_contribution_count: number;
        resulting_run_status: string | null;
      }>
    >({
      client: supabase,
      fn: EXTERNAL_INTELLIGENCE_RPCS.persistSignalWriteSet,
      args: {
        in_signal_id: parsed.signal_id,
        in_content_hash: version_content_hash,
        in_schema_version: parsed.signal_schema_version,
        in_signal_fingerprint: parsed.signal_fingerprint,

        in_interpretation_policy_version: parsed.interpretation_policy_version,
        in_interpretation_policy_hash: input.interpretation_policy_hash,
        in_confidence_policy_version: parsed.confidence_policy_version,
        in_disposition_policy_version: parsed.disposition_policy_version,
        in_entity_resolution_version: parsed.entity_resolution_version,
        in_source_registry_version: parsed.source_registry_version,
        in_legal_policy_version: parsed.legal_policy_version,

        in_policy_refs_json: policyRefs,
        in_claim_version_refs_json: claimRefs,
        in_evidence_reference_version_refs_json: evidenceRefs,

        in_effective_at: parsed.first_observed_at,
        in_valid_from: null,
        in_valid_until: null,
        in_supersedes_content_hashes: [],

        in_payload_json: parsed,
        in_retention_policy: "retain",
        in_retention_expires_at: null,
        in_legal_hold: false,
        in_access_revoked_at: null,
        in_content_redacted_at: null,
        in_redaction_reason: null,
        in_payload_available: true,

        in_disposition: parsed.disposition,
        in_confidence_summary_json: input.confidence_summary_json ?? null,

        in_required_provenance_edges_json: input.required_provenance_edges_json,
        in_required_source_contributions_json: input.required_source_contributions_json,

        in_run_id: input.run_attachment?.run_id ?? null,
        in_expected_output_count: input.run_attachment?.expected_output_count ?? 0,
        in_output_refs_json: input.run_attachment?.output_refs ?? [],

        in_optional_lifecycle_transition_json: input.optional_lifecycle_transition_json ?? null
      }
    });

    const row = res[0];
    if (!row) throw new Error("unknown_db_error");

    const ref: VersionRef = {
      object_type: "signal",
      object_id: row.signal_id,
      version_id: null,
      content_hash: row.content_hash,
      schema_version: parsed.signal_schema_version,
      policy_version: parsed.interpretation_policy_version,
      created_at: new Date().toISOString()
    };

    return Object.freeze({
      ref: Object.freeze(ref),
      created_new_version: row.created_new_version,
      idempotent_replay: row.idempotent_replay,
      persisted_provenance_count: row.persisted_provenance_count,
      persisted_contribution_count: row.persisted_contribution_count,
      resulting_run_status: row.resulting_run_status
    });
  }
}
