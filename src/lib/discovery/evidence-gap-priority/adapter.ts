import type { SourceAuthorityLevelV1 } from "@/lib/discovery/source-authority-conflict/contracts";
import type {
  EvidenceGapCandidateV1,
  EvidenceGapDecisionImpactV1,
  EvidenceGapPriorityInputV1,
  EvidenceGapPriorityQueueItemV1,
  EvidenceGapPriorityStateV1,
  EvidenceGapPriorityV1,
  EvidenceGapReversibilityV1,
  EvidenceGapVerificationCostV1
} from "./contracts";

const IMPACT_SCORE: Record<EvidenceGapDecisionImpactV1, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 4,
  DECISION_CHANGING: 6
};

const AUTHORITY_SCORE: Record<SourceAuthorityLevelV1, number> = {
  UNSUPPORTED: 0,
  INTERNAL_ANALYSIS: 1,
  CREDIBLE_SECONDARY: 2,
  OFFICIAL: 3,
  PRIMARY: 4
};

const FRESHNESS_GAP_SCORE: Record<EvidenceGapCandidateV1["evidence_ref"]["freshness_state"], number> = {
  FRESH: 0,
  STALE: 2,
  UNKNOWN: 3
};

const TRUTH_GAP_SCORE: Record<EvidenceGapCandidateV1["evidence_ref"]["truth_state"], number> = {
  KNOWN: 0,
  INFERRED: 1,
  UNKNOWN: 3,
  STALE: 2,
  NEEDS_RESEARCH: 3,
  CONFLICTED: 4
};

const REVERSIBILITY_SCORE: Record<EvidenceGapReversibilityV1, number> = {
  REVERSIBLE: 1,
  PARTIALLY_REVERSIBLE: 2,
  HARD_TO_REVERSE: 3
};

const COST_PENALTY: Record<EvidenceGapVerificationCostV1, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 3,
  NOT_WORTH_IT: 8
};

function authorityGap(gap: EvidenceGapCandidateV1) {
  return Math.max(0, AUTHORITY_SCORE[gap.required_source_authority] - AUTHORITY_SCORE[gap.current_source_authority]);
}

function priorityState(gap: EvidenceGapCandidateV1, score: number): EvidenceGapPriorityStateV1 {
  if (gap.evidence_ref.truth_state === "UNKNOWN" || gap.evidence_ref.freshness_state === "UNKNOWN" || gap.evidence_ref.evidence_quality === "UNKNOWN") return "UNKNOWN";
  if (gap.verification_cost === "NOT_WORTH_IT") return "DEFER";
  if (score >= 9) return "PRIORITIZE";
  if (score >= 5) return "WATCH";
  return "DEFER";
}

function scoreGap(gap: EvidenceGapCandidateV1) {
  return (
    IMPACT_SCORE[gap.decision_impact] * 3
    + FRESHNESS_GAP_SCORE[gap.evidence_ref.freshness_state]
    + TRUTH_GAP_SCORE[gap.evidence_ref.truth_state]
    + authorityGap(gap) * 2
    + REVERSIBILITY_SCORE[gap.reversibility]
    - COST_PENALTY[gap.verification_cost]
  );
}

function toQueueItem(gap: EvidenceGapCandidateV1): EvidenceGapPriorityQueueItemV1 {
  const priorityScore = scoreGap(gap);
  return {
    gap_id: gap.gap_id,
    decision_id: gap.decision_id,
    label: gap.label,
    truth_state: gap.evidence_ref.truth_state,
    freshness_state: gap.evidence_ref.freshness_state,
    evidence_quality: gap.evidence_ref.evidence_quality,
    directness: gap.evidence_ref.directness,
    decision_impact: gap.decision_impact,
    authority_gap: authorityGap(gap),
    reversibility: gap.reversibility,
    verification_cost: gap.verification_cost,
    priority_state: priorityState(gap, priorityScore),
    priority_score: priorityScore,
    WHY_IT_MATTERS: gap.why_it_matters,
    WHAT_TO_VERIFY_NEXT: gap.verification_action
  };
}

function compareQueueItems(left: EvidenceGapPriorityQueueItemV1, right: EvidenceGapPriorityQueueItemV1) {
  if (left.priority_score !== right.priority_score) return right.priority_score - left.priority_score;
  if (left.authority_gap !== right.authority_gap) return right.authority_gap - left.authority_gap;
  return left.gap_id.localeCompare(right.gap_id);
}

export function prioritizeEvidenceGapsV1(input: EvidenceGapPriorityInputV1): EvidenceGapPriorityV1 {
  const queue = input.gaps.map(toQueueItem).sort(compareQueueItems);

  return {
    contract_version: "evidence_gap_priority_v1",
    generated_at: input.generated_at,
    TOP_GAP: queue[0] ?? null,
    queue,
    preserved_unknown_gap_ids: queue.filter((item) => item.truth_state === "UNKNOWN" || item.freshness_state === "UNKNOWN" || item.evidence_quality === "UNKNOWN").map((item) => item.gap_id),
    preserved_conflict_gap_ids: queue.filter((item) => item.truth_state === "CONFLICTED" || item.evidence_quality === "CONFLICTED").map((item) => item.gap_id),
    WHY_IT_MATTERS: queue.map((item) => `${item.gap_id}: ${item.WHY_IT_MATTERS}`),
    WHAT_TO_VERIFY_NEXT: queue.map((item) => `${item.gap_id}: ${item.WHAT_TO_VERIFY_NEXT}`),
    keegan_action_required: "NO"
  };
}
