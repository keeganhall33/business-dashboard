import type { DecisionEvidenceRefV1 } from "@/lib/decision-evidence/contracts";
import type { SourceAuthorityLevelV1 } from "@/lib/discovery/source-authority-conflict/contracts";

export type EvidenceGapDecisionImpactV1 = "LOW" | "MEDIUM" | "HIGH" | "DECISION_CHANGING";
export type EvidenceGapVerificationCostV1 = "LOW" | "MEDIUM" | "HIGH" | "NOT_WORTH_IT";
export type EvidenceGapReversibilityV1 = "REVERSIBLE" | "PARTIALLY_REVERSIBLE" | "HARD_TO_REVERSE";
export type EvidenceGapPriorityStateV1 = "PRIORITIZE" | "WATCH" | "DEFER" | "UNKNOWN";

export type EvidenceGapCandidateV1 = {
  gap_id: string;
  decision_id: string;
  label: string;
  evidence_ref: DecisionEvidenceRefV1;
  decision_impact: EvidenceGapDecisionImpactV1;
  current_source_authority: SourceAuthorityLevelV1;
  required_source_authority: SourceAuthorityLevelV1;
  reversibility: EvidenceGapReversibilityV1;
  verification_cost: EvidenceGapVerificationCostV1;
  verification_action: string;
  why_it_matters: string;
};

export type EvidenceGapPriorityInputV1 = {
  contract_version: "evidence_gap_priority_input_v1";
  generated_at: string;
  gaps: EvidenceGapCandidateV1[];
};

export type EvidenceGapPriorityQueueItemV1 = {
  gap_id: string;
  decision_id: string;
  label: string;
  truth_state: DecisionEvidenceRefV1["truth_state"];
  freshness_state: DecisionEvidenceRefV1["freshness_state"];
  evidence_quality: DecisionEvidenceRefV1["evidence_quality"];
  directness: DecisionEvidenceRefV1["directness"];
  decision_impact: EvidenceGapDecisionImpactV1;
  authority_gap: number;
  reversibility: EvidenceGapReversibilityV1;
  verification_cost: EvidenceGapVerificationCostV1;
  priority_state: EvidenceGapPriorityStateV1;
  priority_score: number;
  WHY_IT_MATTERS: string;
  WHAT_TO_VERIFY_NEXT: string;
};

export type EvidenceGapPriorityV1 = {
  contract_version: "evidence_gap_priority_v1";
  generated_at: string;
  TOP_GAP: EvidenceGapPriorityQueueItemV1 | null;
  queue: EvidenceGapPriorityQueueItemV1[];
  preserved_unknown_gap_ids: string[];
  preserved_conflict_gap_ids: string[];
  WHY_IT_MATTERS: string[];
  WHAT_TO_VERIFY_NEXT: string[];
  keegan_action_required: "NO";
};
