import type {
  BusinessDomainV1,
  IntelligenceQualityDimensionResultV1,
  IntelligenceQualityDimensionV1,
  IntelligenceQualityEvalResultV1,
  IntelligenceQualityStateV1,
  IntelligenceRecommendationEvalInputV1,
  SyntheticBusinessEvidenceV1
} from "./contracts";

function result(dimension: IntelligenceQualityDimensionV1, state: IntelligenceQualityStateV1, reason: string): IntelligenceQualityDimensionResultV1 {
  return { dimension, state, reason };
}

function evidenceById(input: IntelligenceRecommendationEvalInputV1): Map<string, SyntheticBusinessEvidenceV1> {
  return new Map(input.evidence.map((item) => [item.id, item]));
}

function referencedEvidence(input: IntelligenceRecommendationEvalInputV1): SyntheticBusinessEvidenceV1[] {
  const byId = evidenceById(input);
  return input.evidence_refs.map((id) => byId.get(id)).filter((item): item is SyntheticBusinessEvidenceV1 => Boolean(item));
}

function hasUnknownAsKnown(input: IntelligenceRecommendationEvalInputV1): boolean {
  return referencedEvidence(input).some((item) => item.truth_state === "UNKNOWN" && item.supports_recommendation);
}

function hasProxyAsDirect(input: IntelligenceRecommendationEvalInputV1): boolean {
  return referencedEvidence(input).some(
    (item) => item.evidence_class === "PROXY" && item.supports_recommendation && /\b(proves|confirmed|is)\s+direct\b/i.test(item.claim)
  );
}

function domains(input: IntelligenceRecommendationEvalInputV1): BusinessDomainV1[] {
  return [...new Set(input.evidence.map((item) => item.domain))].sort();
}

export function evaluateIntelligenceRecommendationQualityV1(input: IntelligenceRecommendationEvalInputV1): IntelligenceQualityEvalResultV1 {
  const refs = referencedEvidence(input);
  const missingRefs = input.evidence_refs.filter((id) => !input.evidence.some((item) => item.id === id));
  const duplicateSignals = new Set(input.duplicates_underlying_signal_ids);
  const coveredDomains = domains(input);
  const dimensionResults: IntelligenceQualityDimensionResultV1[] = [
    result(
      "EVIDENCE_GROUNDING",
      input.evidence_refs.length > 0 && missingRefs.length === 0 ? "PASS" : "FAIL",
      missingRefs.length === 0 ? "All recommendation evidence refs resolve to synthetic evidence." : `Missing evidence refs: ${missingRefs.join(", ")}.`
    ),
    result(
      "UNCERTAINTY_HONESTY",
      hasUnknownAsKnown(input) ? "FAIL" : "PASS",
      hasUnknownAsKnown(input) ? "UNKNOWN evidence is being used as if it directly supports action." : "UNKNOWN remains explicit and does not become zero, false, or proven support."
    ),
    result(
      "INTERNAL_CONSISTENCY",
      input.current_action && input.current_action.trim().length > 0 && input.priority_rank !== null ? "PASS" : "FAIL",
      "Recommendation must expose a current action and non-null priority rank for QA comparison."
    ),
    result(
      "NON_DUPLICATION",
      duplicateSignals.size === 0 ? "PASS" : "FAIL",
      duplicateSignals.size === 0 ? "No underlying signal is inflated into multiple recommendations." : `Duplicate/noisy underlying signals: ${[...duplicateSignals].join(", ")}.`
    ),
    result(
      "ACTIONABILITY",
      input.current_action && /^(validate|defer|preserve|prepare|review|run|collect|reconcile|pause|advance)\b/i.test(input.current_action) ? "PASS" : "FAIL",
      "Action should be a concrete next move, not a vague insight."
    ),
    result(
      "PRIORITIZATION",
      Number.isInteger(input.priority_rank) && input.priority_rank !== null && input.priority_rank > 0 ? "PASS" : "FAIL",
      "Priority must be ordinal only; no artificial precision score is exposed."
    ),
    result(
      "REVISION_AFTER_NEW_EVIDENCE",
      input.revision
        ? input.revision.previous_action !== input.revision.new_action &&
          input.revision.new_evidence_refs.length > 0 &&
          input.revision.preserved_prior_rationale.length > 0 &&
          input.revision.history_versions.length >= 2
          ? "PASS"
          : "FAIL"
        : "NOT_APPLICABLE",
      input.revision ? "New evidence must change the next action while preserving prior rationale/history." : "No revision scenario supplied."
    ),
    result(
      "DOWNSIDE_VISIBILITY",
      input.downside ? "PASS" : "FAIL",
      input.downside ? "Strongest downside is visible." : "Recommendation hides downside."
    ),
    result(
      "OPPORTUNITY_COST",
      input.opportunity_cost ? "PASS" : "FAIL",
      input.opportunity_cost ? "Opportunity cost is visible." : "Recommendation hides opportunity cost."
    ),
    result(
      "STRONGEST_CASE_AGAINST",
      input.strongest_case_against ? "PASS" : "FAIL",
      input.strongest_case_against ? "Strongest case against is visible." : "Recommendation lacks strongest case against."
    ),
    result(
      "EVIDENCE_CALIBRATION",
      hasProxyAsDirect(input) ? "FAIL" : "PASS",
      hasProxyAsDirect(input) ? "Proxy evidence is worded as direct evidence." : "Direct, proxy, inferred, and unknown evidence classes remain distinct."
    ),
    result(
      "CROSS_DOMAIN_ALIGNMENT",
      coveredDomains.length >= 9 ? "PASS" : "FAIL",
      `Synthetic fixture covers ${coveredDomains.length} domains.`
    )
  ];

  const failed = dimensionResults.filter((item) => item.state === "FAIL");
  return {
    contract_version: "intelligence_quality_eval_v1",
    recommendation_id: input.recommendation_id,
    title: input.title,
    dimensions: dimensionResults,
    failed_dimensions: failed.map((item) => item.dimension),
    synthetic_domains_covered: coveredDomains,
    scorecard: {
      pass_count: dimensionResults.filter((item) => item.state === "PASS").length,
      fail_count: failed.length,
      not_applicable_count: dimensionResults.filter((item) => item.state === "NOT_APPLICABLE").length,
      artificial_precision: false,
      executive_ui_safe: false
    }
  };
}
