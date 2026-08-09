export type ResolutionOutcomeV1 = "AUTO_RESOLVE" | "SUGGESTED_MATCH" | "UNRESOLVED" | "CONFLICT";

export type ResolutionEvidenceClassV1 =
  | "manual_operator_confirmation"
  | "verified_external_identifier"
  | "verified_official_domain"
  | "verified_official_profile"
  | "stable_source_specific_identifier"
  | "name_and_context"
  | "alias_only";

export type ResolutionEvidenceV1 = {
  evidence_class: ResolutionEvidenceClassV1;
  strength: "strong" | "medium" | "weak";
  description: string;
  // Optional: where this evidence came from (first-party/manual vs source-specific ids vs etc.).
  provenance_json?: Record<string, unknown>;
};

export type ResolutionDecisionV1 = {
  outcome: ResolutionOutcomeV1;
  confidence: Record<string, unknown>;
  reasons: string[];
};

/**
 * Deterministic resolution policy (V1).
 *
 * This function does NOT create entities or links. It only decides the outcome class
 * given evidence that a provisional id could map to a canonical id.
 */
export function decideResolutionOutcomeV1(input: {
  evidence: ResolutionEvidenceV1[];
  has_conflicting_strong_identifiers: boolean;
}): ResolutionDecisionV1 {
  if (input.has_conflicting_strong_identifiers) {
    return {
      outcome: "CONFLICT",
      confidence: { level: "blocked" },
      reasons: ["conflicting_strong_identifiers"]
    };
  }

  const evidence = input.evidence ?? [];
  const classes = new Set(evidence.map((e) => e.evidence_class));

  // Strong evidence ladder (AUTO_RESOLVE eligible only for 1–4 when non-conflicting).
  const hasStrong = (klass: ResolutionEvidenceClassV1) =>
    evidence.some((e) => e.evidence_class === klass && e.strength === "strong");

  if (
    hasStrong("manual_operator_confirmation") ||
    hasStrong("verified_external_identifier") ||
    hasStrong("verified_official_domain") ||
    hasStrong("verified_official_profile")
  ) {
    return {
      outcome: "AUTO_RESOLVE",
      confidence: { level: "known", basis: "strong_evidence" },
      reasons: ["strong_non_conflicting_evidence"]
    };
  }

  // Stable source-specific identifiers are usually suggestions until semantics are proven.
  if (classes.has("stable_source_specific_identifier")) {
    return {
      outcome: "SUGGESTED_MATCH",
      confidence: { level: "possible", basis: "source_specific_identifier" },
      reasons: ["stable_source_specific_identifier_not_auto_resolve_in_v1"]
    };
  }

  // Name/context and alias-only are suggestion-only.
  if (classes.has("name_and_context") || classes.has("alias_only")) {
    return {
      outcome: "SUGGESTED_MATCH",
      confidence: { level: "possible", basis: "name_similarity_or_alias" },
      reasons: ["name_or_alias_only_never_auto_resolve"]
    };
  }

  return {
    outcome: "UNRESOLVED",
    confidence: { level: "unknown" },
    reasons: ["insufficient_evidence"]
  };
}

