import {
  INTELLIGENCE_PERFORMANCE_PHASE_C_VERSION,
  buildCalibrationEvaluationV1,
  enforceConfidenceEvidenceCapV1,
  type RecommendationOutcomeLearningRecordV1
} from "./contracts";

const TRAFFIC_RECOVERY: RecommendationOutcomeLearningRecordV1 = {
  contract_version: INTELLIGENCE_PERFORMANCE_PHASE_C_VERSION,
  record_id: "phase-c-record-traffic-recovery",
  recommendation_id: "rec-qualified-traffic-recovery",
  created_at: "2026-08-19T10:00:00.000Z",
  recommendation_snapshot: {
    title: "Restore qualified traffic to the highest-intent funnel",
    evidence_snapshot: {
      evidence_snapshot_id: "evidence-snapshot-traffic-recovery",
      recommendation_id: "rec-qualified-traffic-recovery",
      evidence_refs: ["ev-ga4-qualified-session-drop", "ev-woo-conversion-stable"],
      evidence_count: 2,
      independent_source_count: 2,
      evidence_quality: "HIGH",
      exception_evidence_refs: []
    },
    predicted_outcome: {
      metric: "incremental_revenue_cents",
      unit: "USD_CENTS",
      low: 9000,
      expected: 15000,
      high: 22000,
      window_days: 7,
      rationale: ["Traffic was the visible driver.", "Conversion quality remained stable."]
    },
    stated_confidence: { label: "likely", score: 0.7, cap_reason: null }
  },
  action: { taken: true, status: "TAKEN", decided_at: "2026-08-19T12:00:00.000Z" },
  observed_outcome: {
    metric: "incremental_revenue_cents",
    value: 16250,
    observed_at: "2026-08-26T12:00:00.000Z",
    evidence_refs: ["ev-woo-revenue-window"],
    unknown_reason: null
  },
  attribution: { confidence: "HIGH", reasons: ["No overlapping campaign dominated the window.", "Commerce and traffic evidence aligned."] },
  feedback: [
    {
      feedback_id: "feedback-traffic-accepted",
      recommendation_id: "rec-qualified-traffic-recovery",
      created_at: "2026-08-19T12:05:00.000Z",
      disposition: "ACCEPTED",
      reason_code: "FEASIBILITY",
      reason_detail: "Low operational load and clear measurement window.",
      applies_universally: false,
      bounded_context: "This applies to the specific traffic recovery recommendation only."
    }
  ],
  lesson_candidates: [
    {
      lesson_id: "lesson-qualified-traffic-calibration",
      recommendation_id: "rec-qualified-traffic-recovery",
      statement: "Qualified traffic recovery can carry likely confidence when conversion quality evidence is fresh and independent.",
      evidence_refs: ["ev-ga4-qualified-session-drop", "ev-woo-conversion-stable", "ev-woo-revenue-window"],
      attribution_confidence: "HIGH",
      policy_promotion_state: "ARCHITECT_REVIEW_REQUIRED"
    }
  ]
};

const LOW_EVIDENCE_PRESTIGE: RecommendationOutcomeLearningRecordV1 = enforceConfidenceEvidenceCapV1({
  contract_version: INTELLIGENCE_PERFORMANCE_PHASE_C_VERSION,
  record_id: "phase-c-record-low-evidence-prestige",
  recommendation_id: "rec-prestige-partner-outreach",
  created_at: "2026-08-19T10:10:00.000Z",
  recommendation_snapshot: {
    title: "Prepare a prestige partner outreach angle",
    evidence_snapshot: {
      evidence_snapshot_id: "evidence-snapshot-prestige-low",
      recommendation_id: "rec-prestige-partner-outreach",
      evidence_refs: ["ev-single-anecdotal-partner-signal"],
      evidence_count: 1,
      independent_source_count: 1,
      evidence_quality: "LOW",
      exception_evidence_refs: []
    },
    predicted_outcome: {
      metric: "qualified_partner_replies",
      unit: "COUNT",
      low: 2,
      expected: 3,
      high: 5,
      window_days: 14,
      rationale: ["One anecdotal signal suggested fit, but evidence remains thin."]
    },
    stated_confidence: { label: "likely", score: 0.8, cap_reason: null }
  },
  action: { taken: false, status: "NOT_TAKEN", decided_at: "2026-08-19T12:20:00.000Z" },
  observed_outcome: {
    metric: "qualified_partner_replies",
    value: 0,
    observed_at: "2026-09-02T12:00:00.000Z",
    evidence_refs: ["ev-no-outreach-sent"],
    unknown_reason: null
  },
  attribution: {
    confidence: "LOW",
    reasons: ["Action was not taken, so outcome cannot be causally attributed to recommendation quality."]
  },
  feedback: [
    {
      feedback_id: "feedback-prestige-rejected",
      recommendation_id: "rec-prestige-partner-outreach",
      created_at: "2026-08-19T12:25:00.000Z",
      disposition: "REJECTED",
      reason_code: "EVIDENCE_DISAGREEMENT",
      reason_detail: "Single anecdotal signal was not enough for outreach.",
      applies_universally: false,
      bounded_context: "This rejects this partner angle, not all prestige outreach."
    }
  ],
  lesson_candidates: [
    {
      lesson_id: "lesson-low-evidence-cap",
      recommendation_id: "rec-prestige-partner-outreach",
      statement: "Low evidence should cap confidence unless explicit exception evidence is present.",
      evidence_refs: ["ev-single-anecdotal-partner-signal"],
      attribution_confidence: "LOW",
      policy_promotion_state: "SHADOW_ONLY"
    }
  ]
});

const TIMING_DEFERRED: RecommendationOutcomeLearningRecordV1 = {
  contract_version: INTELLIGENCE_PERFORMANCE_PHASE_C_VERSION,
  record_id: "phase-c-record-timing-deferred",
  recommendation_id: "rec-launch-collab-concept",
  created_at: "2026-08-19T10:20:00.000Z",
  recommendation_snapshot: {
    title: "Draft a collaboration concept for a cultural sports moment",
    evidence_snapshot: {
      evidence_snapshot_id: "evidence-snapshot-collab",
      recommendation_id: "rec-launch-collab-concept",
      evidence_refs: ["ev-sports-calendar-window", "ev-brand-fit-analysis"],
      evidence_count: 2,
      independent_source_count: 2,
      evidence_quality: "MEDIUM",
      exception_evidence_refs: []
    },
    predicted_outcome: {
      metric: "qualified_conversation_count",
      unit: "COUNT",
      low: 1,
      expected: 2,
      high: 3,
      window_days: 30,
      rationale: ["Calendar timing created a plausible opening.", "Brand fit was strategic but unproven."]
    },
    stated_confidence: { label: "possible", score: 0.5, cap_reason: null }
  },
  action: { taken: false, status: "DEFERRED", decided_at: "2026-08-19T12:45:00.000Z" },
  observed_outcome: {
    metric: "qualified_conversation_count",
    value: null,
    observed_at: null,
    evidence_refs: [],
    unknown_reason: "Deferred action means no observable outcome yet."
  },
  attribution: { confidence: "UNKNOWN", reasons: ["Causation is unclear because the action was deferred."] },
  feedback: [
    {
      feedback_id: "feedback-collab-deferred",
      recommendation_id: "rec-launch-collab-concept",
      created_at: "2026-08-19T12:50:00.000Z",
      disposition: "DEFERRED",
      reason_code: "TIMING",
      reason_detail: "The concept may be useful, but not during the current production load.",
      applies_universally: false,
      bounded_context: "Timing objection applies to this production window only."
    }
  ],
  lesson_candidates: [
    {
      lesson_id: "lesson-deferred-attribution-unknown",
      recommendation_id: "rec-launch-collab-concept",
      statement: "Deferred actions should not become causal wins or losses until an observed outcome exists.",
      evidence_refs: ["feedback-collab-deferred"],
      attribution_confidence: "UNKNOWN",
      policy_promotion_state: "SHADOW_ONLY"
    }
  ]
};

export const PHASE_C_OUTCOME_LEARNING_FIXTURES_V1 = [
  TRAFFIC_RECOVERY,
  LOW_EVIDENCE_PRESTIGE,
  TIMING_DEFERRED
].sort((a, b) => a.record_id.localeCompare(b.record_id));

export const PHASE_C_CALIBRATION_EVALUATION_FIXTURE_V1 = buildCalibrationEvaluationV1(PHASE_C_OUTCOME_LEARNING_FIXTURES_V1);
