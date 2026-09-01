import type {
  SourceAuthorityClaimV1,
  SourceAuthorityConflictEvidenceV1,
  SourceAuthorityConflictInputV1,
  SourceAuthorityConflictV1,
  SourceAuthorityLevelV1
} from "./contracts";

const AUTHORITY_SCORE: Record<SourceAuthorityLevelV1, number> = {
  PRIMARY: 5,
  OFFICIAL: 4,
  CREDIBLE_SECONDARY: 3,
  INTERNAL_ANALYSIS: 2,
  UNSUPPORTED: 0
};

const FRESHNESS_SCORE: Record<SourceAuthorityClaimV1["freshness_state"], number> = {
  FRESH: 3,
  STALE: 1,
  UNKNOWN: 0
};

const DIRECTNESS_SCORE: Record<SourceAuthorityClaimV1["directness"], number> = {
  DIRECT: 3,
  PROXY: 1,
  ANALOG: 0
};

function normalizeClaim(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toEvidence(claim: SourceAuthorityClaimV1): SourceAuthorityConflictEvidenceV1 {
  return {
    ref_id: claim.ref_id,
    label: claim.label,
    claim: claim.claim,
    source_authority: claim.source_authority,
    authority_score: AUTHORITY_SCORE[claim.source_authority],
    freshness_state: claim.freshness_state,
    freshness_score: FRESHNESS_SCORE[claim.freshness_state],
    directness: claim.directness,
    directness_score: DIRECTNESS_SCORE[claim.directness],
    truth_state: claim.truth_state,
    corroboration_count: claim.corroborates_ref_ids.length,
    review_priority:
      AUTHORITY_SCORE[claim.source_authority] * 100
      + FRESHNESS_SCORE[claim.freshness_state] * 10
      + DIRECTNESS_SCORE[claim.directness] * 5
      + claim.corroborates_ref_ids.length,
    notes: claim.notes
  };
}

function compareEvidence(left: SourceAuthorityConflictEvidenceV1, right: SourceAuthorityConflictEvidenceV1) {
  if (left.truth_state === "UNKNOWN" && right.truth_state !== "UNKNOWN") return 1;
  if (right.truth_state === "UNKNOWN" && left.truth_state !== "UNKNOWN") return -1;
  if (left.freshness_state === "STALE" && right.freshness_state === "FRESH") return 1;
  if (right.freshness_state === "STALE" && left.freshness_state === "FRESH") return -1;
  if (left.review_priority !== right.review_priority) return right.review_priority - left.review_priority;
  return left.ref_id.localeCompare(right.ref_id);
}

function conflictSummaries(input: SourceAuthorityConflictInputV1) {
  const claimsByText = new Map<string, SourceAuthorityClaimV1[]>();
  for (const claim of input.claims) {
    const key = normalizeClaim(claim.claim);
    claimsByText.set(key, [...(claimsByText.get(key) ?? []), claim]);
  }
  if (claimsByText.size <= 1) return [];
  return [...claimsByText.values()].map((claims) => {
    const labels = claims.map((claim) => `${claim.label} (${claim.truth_state}/${claim.freshness_state})`).join(", ");
    return `${input.claim_subject}: ${claims[0].claim} supported by ${labels}`;
  });
}

function verificationActions(input: SourceAuthorityConflictInputV1, evidence: SourceAuthorityConflictEvidenceV1[]) {
  const actions: string[] = [];
  if (input.claims.some((claim) => claim.truth_state === "UNKNOWN" || claim.source_authority === "UNSUPPORTED")) {
    actions.push("Resolve UNKNOWN or unsupported claims with a direct primary/official source before using them.");
  }
  if (input.claims.some((claim) => claim.freshness_state === "STALE")) {
    actions.push("Refresh stale source authority and compare it against the fresher primary evidence.");
  }
  if (new Set(input.claims.map((claim) => normalizeClaim(claim.claim))).size > 1) {
    actions.push("Keep both credible conflicting claims visible until a primary source or direct corroboration resolves the conflict.");
  }
  if (actions.length === 0 && evidence.length > 0) actions.push("Monitor for new contradictory evidence; current best evidence is not certainty.");
  return actions;
}

export function resolveSourceAuthorityConflictV1(input: SourceAuthorityConflictInputV1): SourceAuthorityConflictV1 {
  const evidence = input.claims.map(toEvidence).sort(compareEvidence);
  const conflicts = conflictSummaries(input);
  const unsupported = input.claims.filter((claim) => claim.truth_state === "UNKNOWN" || claim.source_authority === "UNSUPPORTED");
  const hasUnknown = input.claims.some((claim) => claim.truth_state === "UNKNOWN");
  const hasConflict = conflicts.length > 0 || input.claims.some((claim) => claim.truth_state === "CONFLICTED");

  return {
    contract_version: "source_authority_conflict_v1",
    case_id: input.case_id,
    claim_subject: input.claim_subject,
    status: hasUnknown ? "UNKNOWN" : hasConflict ? "CONFLICTED" : "BEST_EVIDENCE_AVAILABLE",
    WHAT_CONFLICTS: conflicts,
    CURRENT_BEST_EVIDENCE: evidence,
    WHAT_TO_VERIFY_NEXT: verificationActions(input, evidence),
    unsupported_claim_ref_ids: unsupported.map((claim) => claim.ref_id),
    stale_authority_did_not_override_fresher_primary: evidence.find((item) => item.freshness_state === "STALE")?.ref_id !== evidence[0]?.ref_id,
    unknown_remains_unknown: hasUnknown ? evidence.some((item) => item.truth_state === "UNKNOWN") : true
  };
}
