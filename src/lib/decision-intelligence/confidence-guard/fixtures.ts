import type { DecisionEvidenceRefV1 } from "@/lib/decision-evidence/contracts";
import { RECOMMENDATION_REVISION_HUMAN_FACT_RESULT_V1 } from "@/lib/decision-intelligence/revision/fixtures";
import type { DecisionConfidenceGuardInputV1 } from "./contracts";
import { assessDecisionConfidenceGuardV1 } from "./adapter";

const activeRecommendation = RECOMMENDATION_REVISION_HUMAN_FACT_RESULT_V1.active_recommendation;

const priorRationale = {
  recommendation_id: activeRecommendation.recommendation_id,
  version: activeRecommendation.version,
  summary: activeRecommendation.recommendation_summary,
  recommended_action: activeRecommendation.recommended_action,
  confidence: activeRecommendation.confidence,
  rationale: [
    "Human-reported warm intro resolved the access-route unknown.",
    "Recommendation remains bounded to validation before any full event build.",
    "Prior version remains inspectable and is not overwritten by confidence guard output."
  ]
};

function ref(input: DecisionEvidenceRefV1): DecisionEvidenceRefV1 {
  return input;
}

const stableEvidence = ref({
  ref_id: "ev-human-confirmed-host-intro",
  label: "Confirmed host introduction",
  source: "manual_fixture",
  directness: "DIRECT",
  truth_state: "KNOWN",
  freshness_state: "FRESH",
  evidence_quality: "HIGH",
  notes: "Human-reported warm intro remains current and direct."
});

const staleEvidence = ref({
  ref_id: "ev-host-intro-aging-without-followup",
  label: "Host intro aging without follow-up",
  source: "manual_fixture",
  directness: "DIRECT",
  truth_state: "STALE",
  freshness_state: "STALE",
  evidence_quality: "MEDIUM",
  notes: "The intro has not been revalidated and can no longer carry an actionable recommendation alone."
});

const lowQualityEvidence = ref({
  ref_id: "ev-anecdotal-sponsor-fit",
  label: "Anecdotal sponsor fit",
  source: "strategy_fixture",
  directness: "PROXY",
  truth_state: "INFERRED",
  freshness_state: "FRESH",
  evidence_quality: "LOW",
  notes: "Proxy sponsor fit is not strong enough to preserve the prior confidence level."
});

const conflictedEvidence = ref({
  ref_id: "ev-correction-staff-not-decision-maker",
  label: "Correction: staff route only",
  source: "manual_fixture",
  directness: "DIRECT",
  truth_state: "CONFLICTED",
  freshness_state: "FRESH",
  evidence_quality: "CONFLICTED",
  notes: "The route exists, but decision-maker access is contradicted."
});

export const DECISION_CONFIDENCE_GUARD_INPUT_FIXTURES_V1: DecisionConfidenceGuardInputV1[] = [
  {
    contract_version: "decision_confidence_guard_input_v1",
    recommendation: activeRecommendation,
    prior_rationale: priorRationale,
    current_evidence_refs: [stableEvidence],
    materiality: "HIGH"
  },
  {
    contract_version: "decision_confidence_guard_input_v1",
    recommendation: activeRecommendation,
    prior_rationale: priorRationale,
    current_evidence_refs: [staleEvidence, lowQualityEvidence],
    materiality: "HIGH"
  },
  {
    contract_version: "decision_confidence_guard_input_v1",
    recommendation: activeRecommendation,
    prior_rationale: priorRationale,
    current_evidence_refs: [stableEvidence, conflictedEvidence],
    materiality: "DECISION_CHANGING"
  }
];

export const DECISION_CONFIDENCE_GUARD_STABLE_RESULT_V1 = assessDecisionConfidenceGuardV1(DECISION_CONFIDENCE_GUARD_INPUT_FIXTURES_V1[0]!);
export const DECISION_CONFIDENCE_GUARD_DEGRADED_RESULT_V1 = assessDecisionConfidenceGuardV1(DECISION_CONFIDENCE_GUARD_INPUT_FIXTURES_V1[1]!);
export const DECISION_CONFIDENCE_GUARD_CONFLICTED_RESULT_V1 = assessDecisionConfidenceGuardV1(DECISION_CONFIDENCE_GUARD_INPUT_FIXTURES_V1[2]!);
