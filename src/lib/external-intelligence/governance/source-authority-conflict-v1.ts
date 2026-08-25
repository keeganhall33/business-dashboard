import { deepFreeze } from "@/lib/external-intelligence/config/freeze";

export type SourceAuthorityLevelV1 = "primary" | "secondary" | "community" | "unknown";
export type SourceDirectnessV1 = "direct" | "reported" | "aggregated" | "inferred" | "unknown";
export type SourceAuthorityTruthStateV1 = "KNOWN" | "CONFLICTED" | "UNKNOWN" | "UNSUPPORTED";

export type SourceAuthorityEvidenceClaimV1 = {
  evidence_reference_id: string;
  source_id: string;
  claim_value: string | number | boolean | null;
  authority_level: SourceAuthorityLevelV1;
  directness: SourceDirectnessV1;
  retrieved_at: string | null;
  published_at: string | null;
  corroborating_evidence_reference_ids: string[];
  contradicting_evidence_reference_ids: string[];
  support_state: "SUPPORTED" | "UNSUPPORTED" | "UNKNOWN";
  note: string;
};

export type SourceAuthorityConflictInputV1 = {
  subject: string;
  predicate: string;
  as_of: string;
  claims: SourceAuthorityEvidenceClaimV1[];
};

export type SourceAuthorityConflictV1 = {
  schema_version: "source_authority_conflict_v1";
  subject: string;
  predicate: string;
  as_of: string;
  truth_state: SourceAuthorityTruthStateV1;
  WHAT_CONFLICTS: Array<{
    claim_value: string;
    evidence_reference_ids: string[];
    conflict_with_values: string[];
  }>;
  CURRENT_BEST_EVIDENCE: {
    evidence_reference_id: string;
    source_id: string;
    claim_value: string | number | boolean | null;
    authority_level: SourceAuthorityLevelV1;
    directness: SourceDirectnessV1;
    freshness_state: "CURRENT" | "STALE" | "UNKNOWN";
    reasons: string[];
  } | null;
  WHAT_TO_VERIFY_NEXT: string[];
  reviewed_evidence: Array<{
    evidence_reference_id: string;
    source_id: string;
    claim_value: string | number | boolean | null;
    authority_level: SourceAuthorityLevelV1;
    directness: SourceDirectnessV1;
    freshness_state: "CURRENT" | "STALE" | "UNKNOWN";
    corroboration_count: number;
    contradiction_count: number;
    support_state: "SUPPORTED" | "UNSUPPORTED" | "UNKNOWN";
    review_rank: number;
    review_reasons: string[];
  }>;
};

const AUTHORITY_SCORE: Record<SourceAuthorityLevelV1, number> = {
  primary: 4,
  secondary: 3,
  community: 2,
  unknown: 0
};

const DIRECTNESS_SCORE: Record<SourceDirectnessV1, number> = {
  direct: 4,
  reported: 3,
  aggregated: 2,
  inferred: 1,
  unknown: 0
};

function claimValueKey(value: SourceAuthorityEvidenceClaimV1["claim_value"]) {
  return value === null ? "UNKNOWN" : String(value);
}

function parseTime(value: string | null) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function freshnessState(claim: SourceAuthorityEvidenceClaimV1, asOf: string): "CURRENT" | "STALE" | "UNKNOWN" {
  const asOfMs = parseTime(asOf);
  const claimMs = parseTime(claim.published_at) ?? parseTime(claim.retrieved_at);
  if (asOfMs === null || claimMs === null) return "UNKNOWN";
  const ageDays = (asOfMs - claimMs) / 86_400_000;
  return ageDays <= 90 ? "CURRENT" : "STALE";
}

function freshnessScore(state: "CURRENT" | "STALE" | "UNKNOWN") {
  if (state === "CURRENT") return 3;
  if (state === "STALE") return 1;
  return 0;
}

function supportScore(state: SourceAuthorityEvidenceClaimV1["support_state"]) {
  if (state === "SUPPORTED") return 2;
  if (state === "UNKNOWN") return 0;
  return -4;
}

function reviewReasons(claim: SourceAuthorityEvidenceClaimV1, freshness: "CURRENT" | "STALE" | "UNKNOWN") {
  const reasons = [
    `authority:${claim.authority_level}`,
    `freshness:${freshness}`,
    `directness:${claim.directness}`,
    `corroboration:${claim.corroborating_evidence_reference_ids.length}`,
    `contradictions:${claim.contradicting_evidence_reference_ids.length}`,
    `support:${claim.support_state}`
  ];
  if (claim.note) reasons.push(claim.note);
  return reasons;
}

function reviewScore(claim: SourceAuthorityEvidenceClaimV1, freshness: "CURRENT" | "STALE" | "UNKNOWN") {
  return (
    AUTHORITY_SCORE[claim.authority_level] * 1000 +
    freshnessScore(freshness) * 100 +
    DIRECTNESS_SCORE[claim.directness] * 10 +
    claim.corroborating_evidence_reference_ids.length * 2 -
    claim.contradicting_evidence_reference_ids.length +
    supportScore(claim.support_state)
  );
}

export function buildSourceAuthorityConflictV1(input: SourceAuthorityConflictInputV1): SourceAuthorityConflictV1 {
  const reviewed = input.claims
    .map((claim) => {
      const freshness = freshnessState(claim, input.as_of);
      return {
        evidence_reference_id: claim.evidence_reference_id,
        source_id: claim.source_id,
        claim_value: claim.claim_value,
        authority_level: claim.authority_level,
        directness: claim.directness,
        freshness_state: freshness,
        corroboration_count: claim.corroborating_evidence_reference_ids.length,
        contradiction_count: claim.contradicting_evidence_reference_ids.length,
        support_state: claim.support_state,
        review_rank: reviewScore(claim, freshness),
        review_reasons: reviewReasons(claim, freshness)
      };
    })
    .sort((a, b) => {
      if (b.review_rank !== a.review_rank) return b.review_rank - a.review_rank;
      return a.evidence_reference_id.localeCompare(b.evidence_reference_id);
    });

  const supportedClaims = input.claims.filter((claim) => claim.support_state === "SUPPORTED" && claim.claim_value !== null);
  const values = [...new Set(supportedClaims.map((claim) => claimValueKey(claim.claim_value)))].sort((a, b) => a.localeCompare(b));
  const conflicts = values.length > 1
    ? values.map((value) => ({
        claim_value: value,
        evidence_reference_ids: supportedClaims
          .filter((claim) => claimValueKey(claim.claim_value) === value)
          .map((claim) => claim.evidence_reference_id)
          .sort((a, b) => a.localeCompare(b)),
        conflict_with_values: values.filter((other) => other !== value)
      }))
    : [];

  const best = reviewed.find((claim) => claim.support_state === "SUPPORTED" && claim.claim_value !== null) ?? null;
  const allUnsupported = input.claims.length === 0 || input.claims.every((claim) => claim.support_state !== "SUPPORTED");
  const truth_state: SourceAuthorityTruthStateV1 = allUnsupported
    ? (input.claims.length === 0 ? "UNKNOWN" : "UNSUPPORTED")
    : conflicts.length > 0
      ? "CONFLICTED"
      : "KNOWN";

  const whatToVerify = new Set<string>();
  if (truth_state === "UNKNOWN") whatToVerify.add("Find at least one source with retained support before treating this claim as evidence.");
  if (truth_state === "UNSUPPORTED") whatToVerify.add("Replace unsupported claims with direct retained evidence or mark the field UNKNOWN.");
  if (conflicts.length > 0) whatToVerify.add("Resolve the conflicting claim values with the freshest direct primary source available.");
  if (reviewed.some((claim) => claim.freshness_state === "STALE" && claim.authority_level === "primary")) {
    whatToVerify.add("Refresh stale primary-source evidence before allowing it to override fresher direct evidence.");
  }
  if (reviewed.some((claim) => claim.directness === "inferred" || claim.directness === "unknown")) {
    whatToVerify.add("Check whether inferred or unknown-directness evidence can be replaced by direct observation.");
  }
  if (whatToVerify.size === 0) whatToVerify.add("Monitor for newer contradictory primary evidence before changing the current best evidence.");

  const result: SourceAuthorityConflictV1 = {
    schema_version: "source_authority_conflict_v1",
    subject: input.subject,
    predicate: input.predicate,
    as_of: input.as_of,
    truth_state,
    WHAT_CONFLICTS: conflicts,
    CURRENT_BEST_EVIDENCE: best
      ? {
          evidence_reference_id: best.evidence_reference_id,
          source_id: best.source_id,
          claim_value: best.claim_value,
          authority_level: best.authority_level,
          directness: best.directness,
          freshness_state: best.freshness_state,
          reasons: best.review_reasons
        }
      : null,
    WHAT_TO_VERIFY_NEXT: [...whatToVerify].sort((a, b) => a.localeCompare(b)),
    reviewed_evidence: reviewed
  };

  return deepFreeze(result);
}
