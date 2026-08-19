import type { ExplanationConfidence } from "@/lib/intelligence/explanation-contract";

export const INTELLIGENCE_PERFORMANCE_PHASE_C_VERSION = "intelligence_performance_phase_c_v1.0" as const;

export type ConfidenceScoreV1 = 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 1;
export type RecommendationFeedbackDispositionV1 = "ACCEPTED" | "REJECTED" | "DEFERRED";
export type FeedbackReasonCodeV1 = "PREFERENCE" | "FEASIBILITY" | "TIMING" | "EVIDENCE_DISAGREEMENT" | "OTHER";
export type AttributionConfidenceV1 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type CalibrationBandV1 = "OVERCONFIDENT" | "UNDERCONFIDENT" | "CALIBRATED" | "INSUFFICIENT_SAMPLE";
export type PolicyPromotionStateV1 = "SHADOW_ONLY" | "ARCHITECT_REVIEW_REQUIRED";

export type EvidenceSnapshotV1 = {
  evidence_snapshot_id: string;
  recommendation_id: string;
  evidence_refs: string[];
  evidence_count: number;
  independent_source_count: number;
  evidence_quality: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  exception_evidence_refs: string[];
};

export type PredictedOutcomeRangeV1 = {
  metric: string;
  unit: "USD_CENTS" | "COUNT" | "PERCENT" | "BOOLEAN" | "UNKNOWN";
  low: number | null;
  expected: number | null;
  high: number | null;
  window_days: number;
  rationale: string[];
};

export type ObservedOutcomeV1 = {
  metric: string;
  value: number | null;
  observed_at: string | null;
  evidence_refs: string[];
  unknown_reason: string | null;
};

export type RecommendationFeedbackV1 = {
  feedback_id: string;
  recommendation_id: string;
  created_at: string;
  disposition: RecommendationFeedbackDispositionV1;
  reason_code: FeedbackReasonCodeV1;
  reason_detail: string;
  applies_universally: false;
  bounded_context: string;
};

export type LessonCandidateV1 = {
  lesson_id: string;
  recommendation_id: string;
  statement: string;
  evidence_refs: string[];
  attribution_confidence: AttributionConfidenceV1;
  policy_promotion_state: PolicyPromotionStateV1;
};

export type RecommendationOutcomeLearningRecordV1 = {
  contract_version: typeof INTELLIGENCE_PERFORMANCE_PHASE_C_VERSION;
  record_id: string;
  recommendation_id: string;
  created_at: string;
  recommendation_snapshot: {
    title: string;
    evidence_snapshot: EvidenceSnapshotV1;
    predicted_outcome: PredictedOutcomeRangeV1;
    stated_confidence: {
      label: ExplanationConfidence;
      score: ConfidenceScoreV1;
      cap_reason: string | null;
    };
  };
  action: {
    taken: boolean;
    status: "TAKEN" | "NOT_TAKEN" | "DEFERRED";
    decided_at: string | null;
  };
  observed_outcome: ObservedOutcomeV1;
  attribution: {
    confidence: AttributionConfidenceV1;
    reasons: string[];
  };
  feedback: RecommendationFeedbackV1[];
  lesson_candidates: LessonCandidateV1[];
};

export type CalibrationEvaluationV1 = {
  contract_version: typeof INTELLIGENCE_PERFORMANCE_PHASE_C_VERSION;
  generated_at: string;
  records_evaluated: number;
  calibration_band: CalibrationBandV1;
  mean_confidence_score: number | null;
  hit_rate: number | null;
  misses: string[];
  shadow_policy_suggestions: LessonCandidateV1[];
  architect_review_required: true;
};

export function confidenceCapForEvidenceV1(evidence: EvidenceSnapshotV1): ConfidenceScoreV1 {
  if (evidence.evidence_quality === "LOW" && evidence.exception_evidence_refs.length === 0) return 0.5;
  if (evidence.evidence_quality === "UNKNOWN" && evidence.exception_evidence_refs.length === 0) return 0.4;
  if (evidence.independent_source_count < 2 && evidence.exception_evidence_refs.length === 0) return 0.6;
  return 1;
}

export function enforceConfidenceEvidenceCapV1(record: RecommendationOutcomeLearningRecordV1): RecommendationOutcomeLearningRecordV1 {
  const cap = confidenceCapForEvidenceV1(record.recommendation_snapshot.evidence_snapshot);
  const current = record.recommendation_snapshot.stated_confidence.score;
  if (current <= cap) return record;

  return {
    ...record,
    recommendation_snapshot: {
      ...record.recommendation_snapshot,
      stated_confidence: {
        ...record.recommendation_snapshot.stated_confidence,
        score: cap,
        cap_reason: `Evidence quality caps confidence at ${cap.toFixed(1)} without explicit exception evidence.`
      }
    }
  };
}

export function observedOutcomeMatchesPredictionV1(record: RecommendationOutcomeLearningRecordV1): boolean | null {
  const predicted = record.recommendation_snapshot.predicted_outcome;
  const observed = record.observed_outcome;
  if (observed.value === null || predicted.low === null || predicted.high === null) return null;
  if (observed.metric !== predicted.metric) return null;
  return observed.value >= predicted.low && observed.value <= predicted.high;
}

export function buildCalibrationEvaluationV1(
  records: RecommendationOutcomeLearningRecordV1[],
  generated_at = "2026-08-19T20:20:00.000Z"
): CalibrationEvaluationV1 {
  const evaluated = records
    .map(enforceConfidenceEvidenceCapV1)
    .map((record) => ({ record, match: observedOutcomeMatchesPredictionV1(record) }))
    .filter((item): item is { record: RecommendationOutcomeLearningRecordV1; match: boolean } => item.match !== null);

  if (evaluated.length < 2) {
    return {
      contract_version: INTELLIGENCE_PERFORMANCE_PHASE_C_VERSION,
      generated_at,
      records_evaluated: evaluated.length,
      calibration_band: "INSUFFICIENT_SAMPLE",
      mean_confidence_score: null,
      hit_rate: null,
      misses: [],
      shadow_policy_suggestions: [],
      architect_review_required: true
    };
  }

  const meanConfidence = evaluated.reduce((sum, item) => sum + item.record.recommendation_snapshot.stated_confidence.score, 0) / evaluated.length;
  const hitRate = evaluated.filter((item) => item.match).length / evaluated.length;
  const misses = evaluated.filter((item) => !item.match).map((item) => item.record.recommendation_id).sort();
  const calibrationDelta = meanConfidence - hitRate;
  const calibration_band: CalibrationBandV1 = calibrationDelta > 0.2 ? "OVERCONFIDENT" : calibrationDelta < -0.2 ? "UNDERCONFIDENT" : "CALIBRATED";

  return {
    contract_version: INTELLIGENCE_PERFORMANCE_PHASE_C_VERSION,
    generated_at,
    records_evaluated: evaluated.length,
    calibration_band,
    mean_confidence_score: Number(meanConfidence.toFixed(3)),
    hit_rate: Number(hitRate.toFixed(3)),
    misses,
    shadow_policy_suggestions: records.flatMap((record) =>
      record.lesson_candidates.filter((lesson) => lesson.policy_promotion_state === "SHADOW_ONLY" || lesson.policy_promotion_state === "ARCHITECT_REVIEW_REQUIRED")
    ),
    architect_review_required: true
  };
}
