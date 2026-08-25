import type {
  RelationshipInteractionFreshnessV1,
  RelationshipNextBestMoveTargetInputV1
} from "@/lib/relationship-intelligence/next-best-move/contracts";
import type { RelationshipTimingV1, RelationshipTruthStateV1 } from "@/lib/relationship-intelligence/contracts";

export const RELATIONSHIP_NEXT_STEP_AGING_VERSION_V1 = "relationship_next_step_aging_v1.0" as const;

export type RelationshipOpportunityImportanceV1 = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type RelationshipTimingTriggerV1 = "TIMELY" | "AGING" | "DORMANT_INTENTIONAL" | "UNKNOWN";

export type RelationshipNextStepAgingInputV1 = RelationshipNextBestMoveTargetInputV1 & {
  next_step: {
    label: string;
    created_at: string | null;
    useful_window_days: number | null;
    intentional_defer_until: string | null;
    defer_rationale: string | null;
  };
  opportunity_importance: RelationshipOpportunityImportanceV1;
};

export type RelationshipNextStepAgingV1 = {
  contract_version: typeof RELATIONSHIP_NEXT_STEP_AGING_VERSION_V1;
  target_id: string;
  target_label: string;
  next_step_label: string;
  next_step_age_days: number | null;
  useful_window_days: number | null;
  timing_trigger: RelationshipTimingTriggerV1;
  relationship_state: RelationshipTruthStateV1;
  evidence_freshness: RelationshipInteractionFreshnessV1;
  opportunity_importance: RelationshipOpportunityImportanceV1;
  REVIEW_REQUIRED: boolean;
  WHAT_AGED: string[];
  WHY_IT_MATTERS: string;
  NEXT_SAFE_INTERNAL_ACTION: string;
  timing_state: RelationshipTimingV1;
  unknown_timing_explicit: boolean;
  intentional_defer_preserved: boolean;
  external_action_allowed: false;
};
