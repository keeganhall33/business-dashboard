export type ActionLevel =
  | "L0_INSIGHT"
  | "L1_RECOMMENDATION"
  | "L2_DRAFT_PREPARED"
  | "L3_READY_FOR_APPROVAL"
  | "L4_APPROVED_FOR_EXECUTION"
  | "L5_EXECUTED_AND_MEASURED";

export type ActionStatus =
  | "detected"
  | "analyzed"
  | "recommended"
  | "draft_prepared"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "snoozed"
  | "expired"
  | "needs_revalidation"
  | "execution_blocked"
  | "executing"
  | "executed"
  | "measuring"
  | "successful"
  | "unsuccessful"
  | "inconclusive"
  | "cancelled";

export type ActionConfidence = "confirmed" | "strongly_supported" | "likely" | "possible" | "insufficient_evidence";

export type ActionAuditEvent = {
  id: string;
  action_id: string;
  event_type: string;
  from_status: ActionStatus | null;
  to_status: ActionStatus | null;
  from_level: ActionLevel | null;
  to_level: ActionLevel | null;
  actor: string;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type DurableAction = {
  id: string;
  recommendation_id: string | null;
  opportunity_id: string | null;
  title: string;
  description: string | null;
  category: string;
  channel: string;

  approval_level: ActionLevel;
  affected_products: string[];
  affected_audiences: string[];

  current_level: ActionLevel;
  status: ActionStatus;
  priority_score: Record<string, unknown>;
  confidence: ActionConfidence;

  expected_outcome: string | null;
  estimated_impact: Record<string, unknown>;
  estimated_cost: Record<string, unknown>;
  estimated_effort: Record<string, unknown>;
  risk: "low" | "medium" | "high";

  evidence_snapshot_id: string | null;
  evidence_snapshot_hash: string | null;
  evidence_snapshot: Record<string, unknown> | null;

  assumptions: string[];
  limitations: string[];
  prepared_assets: unknown[];
  execution_plan: Record<string, unknown>;
  approval_requirements: Record<string, unknown>;

  last_idempotency_key: string | null;

  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;

  snoozed_until: string | null;
  expires_at: string | null;
  executed_at: string | null;

  measurement_window: Record<string, unknown>;
  baseline_snapshot: Record<string, unknown> | null;
  result_snapshot: Record<string, unknown> | null;
  outcome: Record<string, unknown> | null;
  lessons: string | null;

  recommendation_fingerprint: string;

  created_at: string;
  updated_at: string;
};
