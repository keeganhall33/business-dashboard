#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-explicit-any */
// Bounded operator script: persist exactly ONE admitted Generalized Claim V1 (partnered_with only).
//
// Safety contract:
// - Production fail-closed.
// - Explicit evidence_reference_id required.
// - Explicit --confirm-write required.
// - Allow exactly ONE evidence ID (BR-1) for this proof.
// - Reads existing EvidenceReference + current version.
// - Runs downstream qualifier in memory.
// - Requires exactly 1 admitted claim.
// - Persists via ClaimRepository ONLY.
// - No evidence writes, no milestones, no schedule mutation, no collection jobs.

import assert from "node:assert";

import { EvidenceReferenceRepository } from "@/lib/external-intelligence/persistence/supabase/evidence-reference.repository";
import { ClaimRepository } from "@/lib/external-intelligence/persistence/supabase/claim.repository";
import { qualifyEvidenceReferenceDownstreamV1 } from "@/lib/external-intelligence/qualification/downstream-qualification-v1";

const ALLOWED_EVIDENCE_ID = "ev_2623049899a3bd37abf05087" as const;

function parseArg(argv: string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  return argv[idx + 1] ?? null;
}

export function parsePersistArgsV1(argv: string[]) {
  const evidence_reference_id = parseArg(argv, "--evidence");
  const confirm = argv.includes("--confirm-write");
  return { evidence_reference_id, confirm } as const;
}

async function main() {
  assert(process.env.OPERATOR_ENVIRONMENT === "production", "precondition_failed:OPERATOR_ENVIRONMENT must be 'production'");

  const { evidence_reference_id, confirm } = parsePersistArgsV1(process.argv.slice(2));
  assert(evidence_reference_id, "missing_argument: --evidence <evidence_reference_id>");
  assert(confirm, "missing_argument: --confirm-write");
  assert(evidence_reference_id === ALLOWED_EVIDENCE_ID, "precondition_failed:evidence_id_not_authorized_for_v1_proof");

  // Guard against wrong project.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  assert(
    supabaseUrl.includes("ibjsjosplgbqevmnvvpf.supabase.co"),
    "precondition_failed:unexpected_supabase_project_ref (expected ibjsjosplgbqevmnvvpf)"
  );

  const evidenceRepo = new EvidenceReferenceRepository();
  const claimRepo = new ClaimRepository();

  const stable = await evidenceRepo.getStable(evidence_reference_id);

  const evidenceRef = {
    object_type: "evidence_reference",
    object_id: stable.evidence_reference_id,
    version_id: null,
    content_hash: stable.current_content_hash,
    schema_version: "evidence_reference_v1",
    policy_version: stable.legal_policy_version,
    created_at: new Date().toISOString()
  } as const;

  const version = await evidenceRepo.getVersion(evidenceRef as any);
  assert(version.payload_available === true, "precondition_failed:evidence_payload_not_available");
  const evidence = version.payload_json;
  assert(evidence && typeof evidence === "object", "precondition_failed:missing_evidence_payload");

  // Pre-write qualification must yield exactly one claim.
  const dq = qualifyEvidenceReferenceDownstreamV1({
    evidence: evidence as any,
    now_iso: new Date().toISOString(),
    source_context: { kind: "boardroom" }
  });

  assert(dq.status === "qualified", `precondition_failed:downstream_status=${dq.status}`);
  assert(dq.claims.length === 1, `precondition_failed:expected_1_claim_got_${dq.claims.length}`);
  assert(dq.claims[0]!.predicate === "partnered_with", "precondition_failed:unexpected_predicate");

  const claim = dq.claims[0]!;

  const persisted = await claimRepo.persistClaim({
    claim,
    evidence_version_ref: evidenceRef as any,
    policy_refs_json: [{ policy_name: "generalized_claim_v1", semantic_version: "v1", content_hash: "ph" }],
    interpretation_policy_hash: "ph",
    edge: { relation: "supported_by", policy_version: "provenance/v1", policy_hash: "ph" }
  });

  // Safe output summary only.
  console.log(
    JSON.stringify(
      {
        status: "persisted",
        evidence_reference_id,
        claim_id: claim.claim_id,
        claim_fingerprint: claim.claim_fingerprint,
        claim_version_content_hash: persisted.ref.content_hash,
        idempotent_replay: persisted.idempotent_replay,
        created_new_version: persisted.created_new_version
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error("persist-generalized-claim-v1 failed", { error: e?.message ?? String(e) });
  process.exitCode = 1;
});
