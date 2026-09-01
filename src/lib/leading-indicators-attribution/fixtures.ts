import type { DecisionLearningRecordInputV1 } from "@/lib/learning-engine/decision-record-v1";
import {
  LEADING_INDICATOR_REGISTRY_CONTRACT_VERSION_V1,
  MULTI_TOUCH_ATTRIBUTION_CONTRACT_VERSION_V1,
  buildLearningHandoffRecordV1,
  registryTriggersReview,
  type LeadingIndicatorDefinitionV1,
  type LeadingIndicatorObservationV1,
  type LeadingIndicatorRegistryV1,
  type MultiTouchAttributionRecordV1
} from "./contracts";

const generated_at = "2026-08-25T00:00:00.000Z";

export const LEADING_INDICATOR_DEFINITIONS_V1: LeadingIndicatorDefinitionV1[] = [
  {
    metric_id: "qualified_collector_growth",
    label: "Qualified collector growth",
    category: "QUALIFIED_COLLECTOR_GROWTH",
    source: "first-party CRM / collector pipeline fixture",
    freshness: "FRESH",
    unit: "COUNT",
    comparison_basis: "PRIOR_PERIOD",
    target_range: { low: 3, high: 8, rationale: "Small count is justified because quality matters more than volume." },
    truth_state: "INFERRED",
    decision_use: "Shows whether premium demand is forming before revenue closes.",
    evidence_refs: ["collector-pipeline-fixture"]
  },
  {
    metric_id: "conversion_aov_quality",
    label: "Conversion and AOV quality",
    category: "CONVERSION_AOV",
    source: "commerce analytics fixture",
    freshness: "FRESH",
    unit: "USD_CENTS",
    comparison_basis: "TARGET_RANGE",
    target_range: { low: 250000, high: 1000000, rationale: "Range only applies when a qualified offer is active." },
    truth_state: "KNOWN",
    decision_use: "Separates qualified purchase quality from traffic noise.",
    evidence_refs: ["commerce-quality-fixture"]
  },
  {
    metric_id: "warm_intro_progression",
    label: "Warm introduction progression",
    category: "WARM_INTRO_RELATIONSHIP",
    source: "relationship intelligence fixture",
    freshness: "STALE",
    unit: "COUNT",
    comparison_basis: "QUALITATIVE_STAGE",
    target_range: { low: null, high: null, rationale: "Relationship stage should not be forced into fake precision." },
    truth_state: "STALE",
    decision_use: "Warns when relationship momentum weakens before revenue is visible.",
    evidence_refs: ["relationship-progression-fixture"]
  },
  {
    metric_id: "partnership_licensing_movement",
    label: "Partnership / licensing movement",
    category: "PARTNERSHIP_LICENSING",
    source: "opportunity notes fixture",
    freshness: "UNKNOWN",
    unit: "UNKNOWN",
    comparison_basis: "UNKNOWN",
    target_range: { low: null, high: null, rationale: "Rights, terms, and partner economics are unknown." },
    truth_state: "UNKNOWN",
    decision_use: "Keeps licensing upside visible without inventing causal or revenue certainty.",
    evidence_refs: ["licensing-movement-unknown-fixture"]
  },
  {
    metric_id: "audience_media_reach_quality",
    label: "Audience / media reach quality",
    category: "AUDIENCE_MEDIA_REACH",
    source: "media reach fixture",
    freshness: "FRESH",
    unit: "INDEX",
    comparison_basis: "PRIOR_PERIOD",
    target_range: { low: 60, high: 100, rationale: "Index is directional and cannot stand in for revenue." },
    truth_state: "INFERRED",
    decision_use: "Detects demand-surface momentum without upgrading correlation into causal fact.",
    evidence_refs: ["media-reach-quality-fixture"]
  }
];

export const LEADING_INDICATOR_OBSERVATIONS_V1: LeadingIndicatorObservationV1[] = [
  {
    metric_id: "qualified_collector_growth",
    current_value: 5,
    prior_value: 3,
    direction: "STRENGTHENING",
    review_state: "NO_REVIEW",
    revenue_conclusion: "UNKNOWN",
    notes: ["Collector count is improving, but closed revenue remains a separate lagging outcome."],
    truth_state: "INFERRED"
  },
  {
    metric_id: "conversion_aov_quality",
    current_value: 420000,
    prior_value: 390000,
    direction: "STABLE",
    review_state: "NO_REVIEW",
    revenue_conclusion: "UNKNOWN",
    notes: ["AOV quality is inside target range; no causal claim is made."],
    truth_state: "KNOWN"
  },
  {
    metric_id: "warm_intro_progression",
    current_value: 1,
    prior_value: 4,
    direction: "WEAKENING",
    review_state: "REVIEW_TRIGGERED",
    revenue_conclusion: "UNKNOWN",
    notes: ["Warm paths slowed before revenue changed; trigger relationship review, not revenue conclusion."],
    truth_state: "STALE"
  },
  {
    metric_id: "partnership_licensing_movement",
    current_value: null,
    prior_value: null,
    direction: "UNKNOWN",
    review_state: "UNKNOWN",
    revenue_conclusion: "UNKNOWN",
    notes: ["Missing licensing evidence stays UNKNOWN."],
    truth_state: "UNKNOWN"
  },
  {
    metric_id: "audience_media_reach_quality",
    current_value: 52,
    prior_value: 71,
    direction: "WEAKENING",
    review_state: "REVIEW_TRIGGERED",
    revenue_conclusion: "UNKNOWN",
    notes: ["Reach quality deteriorated before revenue did; this is a review trigger only."],
    truth_state: "INFERRED"
  }
];

export const LEADING_INDICATOR_REGISTRY_FIXTURE_V1: LeadingIndicatorRegistryV1 = {
  contract_version: LEADING_INDICATOR_REGISTRY_CONTRACT_VERSION_V1,
  generated_at,
  definitions: LEADING_INDICATOR_DEFINITIONS_V1,
  observations: LEADING_INDICATOR_OBSERVATIONS_V1,
  dashboard_summary: {
    growth_signal: "WEAKENING",
    review_required: true,
    revenue_has_changed: "UNKNOWN",
    rationale: "Relationship progression and audience quality weakened before revenue evidence changed."
  }
};

export const MULTI_TOUCH_ATTRIBUTION_RECORD_FIXTURE_V1: MultiTouchAttributionRecordV1 = {
  contract_version: MULTI_TOUCH_ATTRIBUTION_CONTRACT_VERSION_V1,
  attribution_id: "attribution-collector-conversation-001",
  outcome_id: "outcome-qualified-collector-conversation",
  outcome_label: "Qualified collector conversation opened",
  contributors: [
    {
      contributor_id: "contrib-warm-intro",
      label: "Warm intro from existing relationship",
      type: "RELATIONSHIP",
      role: "PRIMARY_CONTRIBUTOR",
      contribution_weight: 0.45,
      confidence: "MEDIUM",
      evidence_refs: ["relationship-progression-fixture"],
      notes: ["Likely opened trust, but not the only touch."]
    },
    {
      contributor_id: "contrib-media-reach",
      label: "Recent media reach quality",
      type: "MEDIA",
      role: "SUPPORTING_CONTRIBUTOR",
      contribution_weight: 0.25,
      confidence: "LOW",
      evidence_refs: ["media-reach-quality-fixture"],
      notes: ["Directional correlation only; cannot be promoted to cause."]
    },
    {
      contributor_id: "contrib-premium-offer",
      label: "Premium original positioning",
      type: "PRODUCT_OFFER",
      role: "SUPPORTING_CONTRIBUTOR",
      contribution_weight: 0.3,
      confidence: "MEDIUM",
      evidence_refs: ["premium-offer-fixture"],
      notes: ["Offer quality matters, but exact causal share is uncertain."]
    }
  ],
  attribution_confidence: "LOW",
  causal_claim_state: "CORRELATION_ONLY",
  unknowns: ["Exact sequence of touches", "Whether media reach directly influenced the collector", "Closed revenue outcome"],
  winner_take_all_blocked: true,
  learning_handoff: {
    PREDICTED_OUTCOME_RANGE: {
      metric: "qualified_collector_conversations",
      unit: "COUNT",
      low: 1,
      expected: 2,
      high: 4,
      rationale: ["Leading indicators suggested relationship and media could create conversations, not revenue certainty."]
    },
    OBSERVED_OUTCOME: {
      metric: "qualified_collector_conversations",
      value: 1,
      unit: "COUNT",
      observed_at: "2026-08-25T00:00:00.000Z",
      evidence_refs: ["collector-pipeline-fixture", "relationship-progression-fixture"],
      unknown_reason: null
    },
    ATTRIBUTION_CONFIDENCE: "LOW",
    RESULT_VS_PREDICTION: "WITHIN_RANGE",
    CALIBRATION_ERROR: "UNKNOWN",
    LESSON: "The outcome is inside range, but attribution remains low confidence and correlation-only."
  }
};

export const UNKNOWN_ATTRIBUTION_RECORD_FIXTURE_V1: MultiTouchAttributionRecordV1 = {
  ...MULTI_TOUCH_ATTRIBUTION_RECORD_FIXTURE_V1,
  attribution_id: "attribution-unknown-licensing-001",
  outcome_id: "outcome-licensing-signal-unknown",
  outcome_label: "Licensing signal with missing source history",
  contributors: [
    {
      contributor_id: "contrib-unknown",
      label: "Unknown source path",
      type: "UNKNOWN",
      role: "UNKNOWN",
      contribution_weight: null,
      confidence: "UNKNOWN",
      evidence_refs: [],
      notes: ["No source path is available."]
    }
  ],
  attribution_confidence: "UNKNOWN",
  causal_claim_state: "UNKNOWN",
  unknowns: ["All source touches", "Licensing economics", "Whether the signal is real"],
  learning_handoff: {
    ...MULTI_TOUCH_ATTRIBUTION_RECORD_FIXTURE_V1.learning_handoff,
    ATTRIBUTION_CONFIDENCE: "UNKNOWN",
    RESULT_VS_PREDICTION: "UNKNOWN",
    OBSERVED_OUTCOME: {
      metric: "licensing_signal_quality",
      value: null,
      unit: "UNKNOWN",
      observed_at: null,
      evidence_refs: [],
      unknown_reason: "Source path and licensing economics are missing."
    },
    CALIBRATION_ERROR: "UNKNOWN",
    LESSON: "Missing attribution remains UNKNOWN; do not infer source or revenue impact."
  }
};

export const LEADING_INDICATOR_LEARNING_HANDOFF_FIXTURE_V1: DecisionLearningRecordInputV1 =
  buildLearningHandoffRecordV1(MULTI_TOUCH_ATTRIBUTION_RECORD_FIXTURE_V1);

export const LEADING_INDICATOR_ATTRIBUTION_FIXTURES_V1 = {
  registry: LEADING_INDICATOR_REGISTRY_FIXTURE_V1,
  attribution_records: [MULTI_TOUCH_ATTRIBUTION_RECORD_FIXTURE_V1, UNKNOWN_ATTRIBUTION_RECORD_FIXTURE_V1],
  learning_handoff: LEADING_INDICATOR_LEARNING_HANDOFF_FIXTURE_V1,
  review_required: registryTriggersReview(LEADING_INDICATOR_REGISTRY_FIXTURE_V1),
  keegan_action_required: "NO" as const
};
