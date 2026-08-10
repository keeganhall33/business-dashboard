#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Controlled persistence: Premier Padel Program Surface (operates_event_program -> tour).
 *
 * Safety contract:
 * - Fail-closed production gating (counts + stable IDs + predicate-only scope).
 * - Recomputes V2 hashes using current helpers.
 * - Persists exactly ONE EvidenceReference + ONE EvidenceVersion + ONE Claim + ONE ClaimVersion + ONE provenance edge.
 * - No web fetch, no discovery, no additional writes.
 * - Uses governed transaction RPCs (persist_external_evidence_reference_v1 + persist_external_claim_v1).
 *
 * Run (production, one-shot):
 * OPERATOR_ENVIRONMENT=production op run --env-file .env.woo.ci -- pnpm -s tsx scripts/controlled-persist-program-surface-premier-padel-v1.ts --confirm-write
 */

import assert from "node:assert";

import { createClient } from "@supabase/supabase-js";

import { EI_FINGERPRINT_CONTRACT_V2, createEvidenceRetainedPayloadHashV2, createEvidenceVersionFingerprintV2, createClaimVersionContentHashV2 } from "@/lib/external-intelligence/hashing/fingerprint-v2";
import { buildProvisionalEntityRefV1 } from "@/lib/external-intelligence/contracts/entity-ref-provisional";
import { buildProgramSurfaceClaimV1 } from "@/lib/external-intelligence/program-surfaces/program-surface-builders-v1";
import { EXTERNAL_INTELLIGENCE_RPCS, runRpc } from "@/lib/external-intelligence/persistence/supabase/transactions";

function parseFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function parseArg(argv: string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  return argv[idx + 1] ?? null;
}

function redactedHost(url: string) {
  try {
    const u = new URL(url);
    return u.host;
  } catch {
    return "<unknown>";
  }
}

type AnySupabaseClient = ReturnType<typeof createClient>;

async function countTable(supabase: AnySupabaseClient, table: string) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function countProgramSurfacePredicate(supabase: AnySupabaseClient, predicate: string) {
  const { count, error } = await supabase
    .from("external_claim_versions_v1")
    .select("claim_id", { count: "exact", head: true })
    .filter("payload_json->>predicate", "eq", predicate);
  if (error) throw error;
  return count ?? 0;
}

const PROGRAM_SURFACE_PREDICATES = [
  "operates_event_program",
  "runs_partner_activations",
  "offers_vip_hospitality",
  "runs_relationship_recognition",
  "operates_physical_environment",
  "runs_philanthropy_program",
  "operates_merchandising",
  "operates_licensing",
  "operates_retail_distribution",
  "runs_art_culture_design_program",
  "runs_commemoration_program"
] as const;

function buildEvidencePayloadV2(input: { now_iso: string }) {
  const evidence_reference_id = "ev_d7ff657c5f2040c6cf6f9b59" as const;
  const source_id = "research.web.host:premierpadel.com" as const;
  const canonical_url = "https://premierpadel.com/en" as const;

  // Canonical retained structured metadata (already normalized; do not re-normalize or fetch).
  const retained_payload = {
    lane: "structured_metadata",
    identity_url: canonical_url,
    title: "Premier Padel | News, Calendar, Scores & Results",
    meta_description:
      "Follow Premier Padel, the world’s leading professional Padel tour. Explore rankings, tournament schedules, highlights, news and exclusive player content.",
    og_site_name: null,
    og_title: "Premier Padel | News, Calendar, Scores & Results",
    jsonld_types: [] as string[]
  } as const;

  const retained_payload_hash_v2 = createEvidenceRetainedPayloadHashV2(retained_payload);

  // NOTE: The DB-side V2 fingerprint calculator expects payload_json.retained_payload.
  // This payload deliberately excludes raw HTML.
  const payload_json = {
    evidence_reference_id,
    source_id,
    source_config_version: "targeted_web.preview_v1",
    source_set_id: null,

    source_artifact_identifier: null,
    source_url_or_reference: canonical_url,

    // Content identity (retained semantic identity) — distinct from the outer evidence version fingerprint.
    content_hash: retained_payload_hash_v2,

    retrieved_at: input.now_iso,
    published_at: null,
    event_time: null,

    evidence_type: "other",
    access_classification: "public",
    legal_policy_version: "targeted_web.preview_only.v1",

    // IMPORTANT: DB retention policy (table constraint). “structured_metadata” is a retention LANE, not this column.
    retention_policy: "summary_only",

    excerpt_or_summary_reference: null,
    support_excerpts: [],

    source_credibility_prior: "high",
    correction_status: "none",
    retraction_status: "none",
    supersedes_evidence_reference_id: null,

    provenance_metadata: {
      retention_lane: "structured_metadata",
      projection_semantics: "targeted_web_structured_metadata_payload_v1",
      raw_html_retained: false
    },

    credibility: { level: "high", bounded_score: null, reasons: ["official_site"] },
    corroborating_evidence_reference_ids: [] as string[],
    contradicting_evidence_reference_ids: [] as string[],

    schema_version: "evidence_reference_v1",

    // V2-only semantic pin.
    retained_payload
  } as const;

  const evidence_version_fingerprint_v2 = createEvidenceVersionFingerprintV2({
    schema_version: payload_json.schema_version,
    source_id: payload_json.source_id,
    source_config_version: payload_json.source_config_version,
    legal_policy_version: payload_json.legal_policy_version,

    evidence_type: payload_json.evidence_type,
    access_classification: payload_json.access_classification,
    retention_policy: payload_json.retention_policy,

    source_set_id: payload_json.source_set_id,
    source_artifact_identifier: payload_json.source_artifact_identifier,
    source_url_or_reference: payload_json.source_url_or_reference,

    published_at: payload_json.published_at,
    event_time: payload_json.event_time,

    excerpt_or_summary_reference: payload_json.excerpt_or_summary_reference,
    source_credibility_prior: payload_json.source_credibility_prior,

    correction_status: payload_json.correction_status,
    retraction_status: payload_json.retraction_status,
    supersedes_evidence_reference_id: payload_json.supersedes_evidence_reference_id,

    corroborating_evidence_reference_ids: payload_json.corroborating_evidence_reference_ids,
    contradicting_evidence_reference_ids: payload_json.contradicting_evidence_reference_ids,

    retained_payload_hash_v2
  });

  return {
    evidence_reference_id,
    source_id,
    canonical_url,
    retained_payload_hash_v2,
    evidence_version_fingerprint_v2,
    evidence_payload_json: payload_json
  } as const;
}

function buildClaimPayloadV2(input: { now_iso: string; evidence_reference_id: string; evidence_version_fingerprint_v2: string }) {
  const subject = buildProvisionalEntityRefV1({
    entity_id: "provisional:organization:855052d8c715418165b6cb72",
    entity_type: "organization",
    canonical_name: "Premier Padel"
  });

  const evidence_version_ref = {
    object_type: "evidence_reference",
    object_id: input.evidence_reference_id,
    version_id: null,
    content_hash: input.evidence_version_fingerprint_v2,
    schema_version: "evidence_reference_v1",
    policy_version: "targeted_web.preview_only.v1",
    created_at: input.now_iso
  } as const;

  const built = buildProgramSurfaceClaimV1({
    evidence_version_ref,
    retrieved_at_iso: input.now_iso,
    subject,
    predicate: "operates_event_program",
    object_value: "tour",
    normalization_confidence: "high",
    evidence_domain: "EXTERNAL",
    external_source_class: "OFFICIAL_WEBSITE", 
    qualifiers: []
  });

  assert(built.status === "eligible", `precondition_failed:claim_not_eligible status=${built.status}`);

  const claim = built.claim;

  // Stable claim identity pin.
  assert(claim.claim_id === "cl_53c94cd6d361b5fd871e27e8", "precondition_failed:claim_id_mismatch");

  const content_hash_v2 = createClaimVersionContentHashV2({
    claim_id: claim.claim_id,
    claim_fingerprint: claim.claim_fingerprint,
    evidence_reference_id: claim.evidence_reference_id,
    subject_entity_id: claim.subject?.entity_id ?? null,
    predicate: claim.predicate,
    object_kind: claim.object.kind,
    object_entity_id: claim.object.kind === "entity" ? claim.object.entity_id : null,
    object_literal_value: claim.object.kind === "literal" ? claim.object.value : null,
    object_literal_unit: claim.object.kind === "literal" ? claim.object.unit : null,
    object_literal_value_type: claim.object.kind === "literal" ? claim.object.value_type : null,
    object_literal_language: claim.object.kind === "literal" ? claim.object.language : null,

    event_time: claim.event_time,
    announcement_time: claim.announcement_time,
    retrieved_at: claim.retrieved_at,

    observed_vs_inferred: claim.observed_vs_inferred,
    verification_state: claim.verification_state,

    extraction_confidence_level: claim.extraction_confidence.level,
    extraction_confidence_reasons: [...(claim.extraction_confidence.reasons ?? [])],

    contradiction_state: claim.contradiction_state,
    correction_state: claim.correction_state,

    relevance_window_start: claim.relevance_window.start,
    relevance_window_end: claim.relevance_window.end,

    schema_version: claim.schema_version,
    interpretation_policy_version: claim.interpretation_policy_version
  });

  return { subject, evidence_version_ref, claim, claim_version_content_hash_v2: content_hash_v2 } as const;
}

async function main() {
  const argv = process.argv.slice(2);
  const confirmWrite = parseFlag(argv, "--confirm-write");
  const validateOnly = parseFlag(argv, "--validate-only");
  const forcedNowIso = parseArg(argv, "--now-iso");

  // Local V2 manifest validation (no Supabase required).
  // IMPORTANT: Claim V2 hash includes retrieved_at, so the manifest is time-sensitive.
  // For deterministic validation, pass --now-iso or use the built-in pinned timestamp.
  const now_iso =
    forcedNowIso ??
    (validateOnly
      ? "2026-08-10T19:09:00.000Z" // pinned to make validate-only deterministic
      : new Date().toISOString());
  const evidence = buildEvidencePayloadV2({ now_iso });
  const claim = buildClaimPayloadV2({
    now_iso,
    evidence_reference_id: evidence.evidence_reference_id,
    evidence_version_fingerprint_v2: evidence.evidence_version_fingerprint_v2
  });

  if (validateOnly) {
    console.log(
      JSON.stringify(
        {
          mode: "validate_only",
          V2_RETAINED_PAYLOAD_HASH: evidence.retained_payload_hash_v2,
          V2_EVIDENCE_VERSION_FINGERPRINT: evidence.evidence_version_fingerprint_v2,
          V2_CLAIM_VERSION_CONTENT_HASH: claim.claim_version_content_hash_v2,
          EVIDENCE_CONTRACT_VERSION: EI_FINGERPRINT_CONTRACT_V2,
          CLAIM_CONTRACT_VERSION: EI_FINGERPRINT_CONTRACT_V2,
          CLAIM_EVIDENCE_VERSION_REF: claim.evidence_version_ref.content_hash
        },
        null,
        2
      )
    );
    return;
  }

  assert(process.env.OPERATOR_ENVIRONMENT === "production", "precondition_failed:OPERATOR_ENVIRONMENT must be 'production'");
  assert(confirmWrite, "missing_argument: --confirm-write");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(url && key, "missing_supabase_env");

  // Guard against wrong target.
  assert(url.includes("ibjsjosplgbqevmnvvpf.supabase.co"), "precondition_failed:unexpected_supabase_project_ref (expected ibjsjosplgbqevmnvvpf)");

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // ------------------------------
  // PRE-WRITE COUNTS + GATE
  // ------------------------------

  const preCounts = {
    EvidenceReferences: await countTable(supabase, "external_evidence_references_v1"),
    EvidenceVersions: await countTable(supabase, "external_evidence_reference_versions_v1"),
    Claims: await countTable(supabase, "external_claims_v1"),
    ClaimVersions: await countTable(supabase, "external_claim_versions_v1"),
    ProvenanceEdges: await countTable(supabase, "external_provenance_edges_v1"),
    Events: await countTable(supabase, "external_events_v1"),
    EventVersions: await countTable(supabase, "external_event_versions_v1"),
    EventClaimLinks: await countTable(supabase, "external_event_claim_links_v1")
  } as const;

  assert(preCounts.EvidenceReferences === 23, "precondition_failed:EvidenceReferences_count_mismatch");
  assert(preCounts.EvidenceVersions === 23, "precondition_failed:EvidenceVersions_count_mismatch");
  assert(preCounts.Claims === 6, "precondition_failed:Claims_count_mismatch");
  assert(preCounts.ClaimVersions === 6, "precondition_failed:ClaimVersions_count_mismatch");
  assert(preCounts.ProvenanceEdges === 6, "precondition_failed:ProvenanceEdges_count_mismatch");
  assert(preCounts.Events === 3, "precondition_failed:Events_count_mismatch");
  assert(preCounts.EventVersions === 3, "precondition_failed:EventVersions_count_mismatch");
  assert(preCounts.EventClaimLinks === 3, "precondition_failed:EventClaimLinks_count_mismatch");

  const preProgramSurface: Record<string, number> = {};
  for (const p of PROGRAM_SURFACE_PREDICATES) preProgramSurface[p] = await countProgramSurfacePredicate(supabase, p);

  const preProgramSurfaceTotal = Object.values(preProgramSurface).reduce((a, b) => a + b, 0);
  assert(preProgramSurfaceTotal === 0, "precondition_failed:program_surface_total_not_zero");

  // Strict predicate scope gate.
  for (const [k, v] of Object.entries(preProgramSurface)) {
    assert(v === 0, `precondition_failed:program_surface_predicate_not_zero:${k}`);
  }

  // ------------------------------
  // PERSIST EVIDENCE (V2 contract pinned)
  // ------------------------------

  const persistedEvidence = await runRpc<
    Array<{ evidence_reference_id: string; content_hash: string; created_new_version: boolean; idempotent_replay: boolean }>
  >({
    client: supabase as any,
    fn: EXTERNAL_INTELLIGENCE_RPCS.persistEvidence,
    args: {
      in_evidence_reference_id: evidence.evidence_reference_id,
      in_content_hash: evidence.evidence_version_fingerprint_v2,
      in_schema_version: evidence.evidence_payload_json.schema_version,
      in_source_id: evidence.evidence_payload_json.source_id,
      in_source_config_version: evidence.evidence_payload_json.source_config_version,
      in_legal_policy_version: evidence.evidence_payload_json.legal_policy_version,
      in_policy_refs_json: [{ policy_name: "program_surface_v1", semantic_version: "v1", content_hash: "ph" }],
      in_effective_at: null,
      in_valid_from: null,
      in_valid_until: null,
      in_supersedes_content_hashes: [],
      in_payload_json: evidence.evidence_payload_json,
      in_retention_policy: evidence.evidence_payload_json.retention_policy,
      in_retention_expires_at: null,
      in_legal_hold: false,
      in_access_revoked_at: null,
      in_content_redacted_at: null,
      in_redaction_reason: null,
      in_payload_available: true,
      in_fingerprint_contract_version: EI_FINGERPRINT_CONTRACT_V2
    }
  });

  assert(persistedEvidence[0]?.evidence_reference_id === evidence.evidence_reference_id, "postcondition_failed:evidence_reference_id");
  assert(persistedEvidence[0]?.content_hash === evidence.evidence_version_fingerprint_v2, "postcondition_failed:evidence_content_hash");

  // ------------------------------
  // PERSIST CLAIM (V2 contract pinned)
  // ------------------------------

  const persistedClaim = await runRpc<
    Array<{ claim_id: string; content_hash: string; created_new_version: boolean; idempotent_replay: boolean }>
  >({
    client: supabase as any,
    fn: EXTERNAL_INTELLIGENCE_RPCS.persistClaim,
    args: {
      in_claim_id: claim.claim.claim_id,
      in_content_hash: claim.claim_version_content_hash_v2,
      in_schema_version: claim.claim.schema_version,
      in_claim_fingerprint: claim.claim.claim_fingerprint,
      in_interpretation_policy_version: claim.claim.interpretation_policy_version,
      in_interpretation_policy_hash: "ph",

      in_evidence_reference_id: claim.evidence_version_ref.object_id,
      in_evidence_content_hash: claim.evidence_version_ref.content_hash,
      in_evidence_version_ref_json: claim.evidence_version_ref,

      in_policy_refs_json: [{ policy_name: "program_surface_claim_v1", semantic_version: "v1", content_hash: "ph" }],
      in_effective_at: claim.claim.event_time,
      in_valid_from: claim.claim.relevance_window.start,
      in_valid_until: claim.claim.relevance_window.end,
      in_supersedes_content_hashes: [],
      in_payload_json: claim.claim,
      in_retention_policy: "retain",
      in_retention_expires_at: null,
      in_legal_hold: false,
      in_access_revoked_at: null,
      in_content_redacted_at: null,
      in_redaction_reason: null,
      in_payload_available: true,

      in_edge_relation: "supported_by",
      in_edge_policy_version: "provenance/v1",
      in_edge_policy_hash: "ph",

      in_fingerprint_contract_version: EI_FINGERPRINT_CONTRACT_V2
    }
  });

  assert(persistedClaim[0]?.claim_id === claim.claim.claim_id, "postcondition_failed:claim_id");
  assert(persistedClaim[0]?.content_hash === claim.claim_version_content_hash_v2, "postcondition_failed:claim_content_hash");

  // ------------------------------
  // POST-WRITE COUNTS + INTEGRITY
  // ------------------------------

  const postCounts = {
    EvidenceReferences: await countTable(supabase, "external_evidence_references_v1"),
    EvidenceVersions: await countTable(supabase, "external_evidence_reference_versions_v1"),
    Claims: await countTable(supabase, "external_claims_v1"),
    ClaimVersions: await countTable(supabase, "external_claim_versions_v1"),
    ProvenanceEdges: await countTable(supabase, "external_provenance_edges_v1"),
    Events: await countTable(supabase, "external_events_v1"),
    EventVersions: await countTable(supabase, "external_event_versions_v1"),
    EventClaimLinks: await countTable(supabase, "external_event_claim_links_v1")
  } as const;

  assert(postCounts.EvidenceReferences === 24, "postcondition_failed:EvidenceReferences_delta");
  assert(postCounts.EvidenceVersions === 24, "postcondition_failed:EvidenceVersions_delta");
  assert(postCounts.Claims === 7, "postcondition_failed:Claims_delta");
  assert(postCounts.ClaimVersions === 7, "postcondition_failed:ClaimVersions_delta");
  assert(postCounts.ProvenanceEdges === 7, "postcondition_failed:ProvenanceEdges_delta");
  assert(postCounts.Events === 3, "postcondition_failed:Events_changed");
  assert(postCounts.EventVersions === 3, "postcondition_failed:EventVersions_changed");
  assert(postCounts.EventClaimLinks === 3, "postcondition_failed:EventClaimLinks_changed");

  const postProgramSurface: Record<string, number> = {};
  for (const p of PROGRAM_SURFACE_PREDICATES) postProgramSurface[p] = await countProgramSurfacePredicate(supabase, p);
  const postProgramSurfaceTotal = Object.values(postProgramSurface).reduce((a, b) => a + b, 0);

  assert(postProgramSurfaceTotal === 1, "postcondition_failed:program_surface_total");
  assert(postProgramSurface.operates_event_program === 1, "postcondition_failed:operates_event_program_count");
  for (const p of PROGRAM_SURFACE_PREDICATES) {
    if (p === "operates_event_program") continue;
    assert(postProgramSurface[p] === 0, `postcondition_failed:unexpected_predicate_written:${p}`);
  }

  // Direct persisted record verification (contract pins + evidence link).
  const evRow = await supabase
    .from("external_evidence_reference_versions_v1")
    .select("evidence_reference_id,content_hash,fingerprint_contract_version")
    .eq("evidence_reference_id", evidence.evidence_reference_id)
    .eq("content_hash", evidence.evidence_version_fingerprint_v2)
    .limit(1)
    .maybeSingle();
  if (evRow.error) throw evRow.error;
  assert(evRow.data?.fingerprint_contract_version === EI_FINGERPRINT_CONTRACT_V2, "postcondition_failed:evidence_contract_pin");

  const cvRow = await supabase
    .from("external_claim_versions_v1")
    .select("claim_id,content_hash,fingerprint_contract_version,evidence_content_hash")
    .eq("claim_id", claim.claim.claim_id)
    .eq("content_hash", claim.claim_version_content_hash_v2)
    .limit(1)
    .maybeSingle();
  if (cvRow.error) throw cvRow.error;
  assert(cvRow.data?.fingerprint_contract_version === EI_FINGERPRINT_CONTRACT_V2, "postcondition_failed:claim_contract_pin");
  assert(cvRow.data?.evidence_content_hash === evidence.evidence_version_fingerprint_v2, "postcondition_failed:claim_evidence_ref_mismatch");

  // Provenance edge (best-effort lookup).
  const edgeRow = await supabase
    .from("external_provenance_edges_v1")
    .select("edge_id")
    .eq("to_object_type", "claim")
    .eq("to_object_id", claim.claim.claim_id)
    .eq("to_content_hash", claim.claim_version_content_hash_v2)
    .limit(1)
    .maybeSingle();

  // Safe output only (no secrets).
  console.log(
    JSON.stringify(
      {
        mode: "controlled_program_surface_persist",
        supabase_host: redactedHost(url),
        pre_write_counts: preCounts,
        post_write_counts: postCounts,
        evidence_reference_id: evidence.evidence_reference_id,
        v2_retained_payload_hash: evidence.retained_payload_hash_v2,
        v2_evidence_version_fingerprint: evidence.evidence_version_fingerprint_v2,
        evidence_contract_version: EI_FINGERPRINT_CONTRACT_V2,
        claim_id: claim.claim.claim_id,
        v2_claim_version_content_hash: claim.claim_version_content_hash_v2,
        claim_contract_version: EI_FINGERPRINT_CONTRACT_V2,
        claim_evidence_version_ref: claim.evidence_version_ref.content_hash,
        provenance_edge: edgeRow.data?.edge_id ?? null,
        program_surface: {
          operates_event_program: postProgramSurface.operates_event_program,
          total: postProgramSurfaceTotal
        },
        event_counts: {
          Events: postCounts.Events,
          EventVersions: postCounts.EventVersions,
          EventClaimLinks: postCounts.EventClaimLinks
        },
        unexpected_writes: 0,
        candidate_status: "PLAUSIBLE_NEEDS_CONTEXT",
        next_research_executed: "NO"
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error("controlled-persist-program-surface-premier-padel-v1 failed", { error: e?.message ?? String(e) });
  process.exitCode = 1;
});
