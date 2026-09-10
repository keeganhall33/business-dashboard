import type {
  StrategyEvidenceReviewDispositionV1,
  StrategyEvidenceReviewQueueItemV1,
  StrategyEvidenceReviewQueueV1,
} from "@/lib/core-intelligence/strategy-evidence-review/contracts";
import type { Recommendation } from "@/lib/intelligence/recommendation-contract";

export type ExecutiveActionLaneV1 = "DO_NOW" | "PREPARE" | "MONITOR" | "WAIT" | "DEPRIORITIZE";

export type ExecutiveActionEvidenceStateV1 = {
  review_disposition: StrategyEvidenceReviewDispositionV1 | "UNAVAILABLE";
  truth_state: StrategyEvidenceReviewQueueItemV1["truth_state"] | "UNKNOWN";
  freshness_state: StrategyEvidenceReviewQueueItemV1["freshness_state"] | "UNKNOWN";
};

export type ExecutiveActionItemV1 = {
  recommendation_id: string;
  title: string;
  lane: ExecutiveActionLaneV1;
  recommended_action: string;
  expected_outcome: string;
  priority_score: Recommendation["priority_score"];
  confidence: Recommendation["confidence"];
  urgency: Recommendation["urgency"];
  approval_level: Recommendation["approval_level"];
  recommendation_status: Recommendation["status"];
  review_date: string | null;
  evidence_state: ExecutiveActionEvidenceStateV1;
  blocking_reason: string | null;
  data_missing: string[];
  assumptions: string[];
  limitations: string[];
};

export type ExecutiveActionSynthesisInputV1 = {
  contract_version: "executive_action_synthesis_input_v1";
  generated_at: string;
  recommendations: Recommendation[];
  evidence_review_queue: StrategyEvidenceReviewQueueV1;
};

export type ExecutiveActionSynthesisV1 = {
  contract_version: "executive_action_synthesis_v1";
  generated_at: string;
  DO_NOW: ExecutiveActionItemV1[];
  PREPARE: ExecutiveActionItemV1[];
  MONITOR: ExecutiveActionItemV1[];
  WAIT: ExecutiveActionItemV1[];
  DEPRIORITIZE: ExecutiveActionItemV1[];
  queue: ExecutiveActionItemV1[];
  mutation_performed: false;
  keegan_action_required: "NO";
};
