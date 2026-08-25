import type { ExplanationConfidence } from "@/lib/intelligence/explanation-contract";
import type { RelationshipEvidenceRefV1, RelationshipTimingV1, RelationshipTruthStateV1 } from "@/lib/relationship-intelligence/contracts";

export const RELATIONSHIP_OPPORTUNITY_CONFIDENCE_AGING_VERSION_V1 = "relationship_opportunity_confidence_aging_v1.0" as const;

export type RelationshipOpportunityConfidenceAgingInputV1 = {
  opportunity_id: string;
  target_label: string;
  opportunity_label: string;
  confidence: ExplanationConfidence;
  confidence_last_reviewed_at: string | null;
  timing_state: RelationshipTimingV1;
  timing_last_checked_at: string | null;
  truth_state: RelationshipTruthStateV1;
  evidence_refs: Array<RelationshipEvidenceRefV1 & { observed_at: string | null }>;
  review_window_days: number | null;
  opportunity_importance: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  next_internal_action: string;
};

export type RelationshipOpportunityConfidenceAgingReasonV1 =
  | "EVIDENCE_AGED"
  | "TIMING_AGED"
  | "CONFIDENCE_OUTDATED"
  | "UNKNOWN_EVIDENCE"
  | "TRUTH_STATE_RISK"
  | "LOW_PRIORITY_DEFER";

export type RelationshipOpportunityConfidenceAgingV1 = {
  contract_version: typeof RELATIONSHIP_OPPORTUNITY_CONFIDENCE_AGING_VERSION_V1;
  opportunity_id: string;
  target_label: string;
  opportunity_label: string;
  evidence_age_days: number | null;
  confidence_age_days: number | null;
  timing_age_days: number | null;
  confidence: ExplanationConfidence;
  truth_state: RelationshipTruthStateV1;
  timing_state: RelationshipTimingV1;
  REVIEW_REQUIRED: boolean;
  REVIEW_REASON: RelationshipOpportunityConfidenceAgingReasonV1[];
  WHAT_AGED: string[];
  WHY_IT_MATTERS: string;
  NEXT_SAFE_INTERNAL_ACTION: string;
  UNKNOWN: string[];
  external_action_allowed: false;
};
