export type OrchestrationStream =
  | "CORE_INTELLIGENCE"
  | "DISCOVERY_INTELLIGENCE"
  | "INTELLIGENCE_UX"
  | "AGENT_ORCHESTRATION"
  | "OTHER";

export type RequestedBy = "KEEGAN" | "ARCHITECT" | "JEEVES" | "SYSTEM";

export type OrchestrationTaskStatus =
  | "DRAFT"
  | "READY"
  | "RUNNING"
  | "BLOCKED"
  | "AWAITING_REVIEW"
  | "CHANGES_REQUESTED"
  | "APPROVED"
  | "AWAITING_HUMAN_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type ReviewDecision = "APPROVE" | "REQUEST_CHANGES" | "NEXT_TASK" | "ESCALATE_TO_KEEGAN";

export type HumanApprovalRequired = {
  required: boolean;
  reason: string | null;
};

export type OrchestrationTaskV1 = {
  task_id: string;
  parent_task_id: string | null;
  milestone: string;
  stream: OrchestrationStream;
  requested_by: RequestedBy;
  assigned_agent: string;
  task_type: string;

  directive: string;
  scope: string[];
  constraints: string[];

  allowed_actions: string[];
  forbidden_actions: string[];
  acceptance_criteria: string[];

  status: OrchestrationTaskStatus;
  priority: "P0" | "P1" | "P2" | "P3";

  created_at: string;
  started_at: string | null;
  completed_at: string | null;

  branch: string | null;
  commit: string | null;
  pr_url: string | null;

  human_approval: HumanApprovalRequired;
  attempt_count: number;
};

export type OrchestrationResultContractV1 = {
  TASK_ID: string;
  STATUS: OrchestrationTaskStatus;
  SUMMARY: string;
  CHANGES: string[];
  FILES_CHANGED: string[];
  DB_CHANGES: "YES" | "NO";
  MIGRATION: string | null;
  TESTS: string;
  PR: string | null;
  MERGE_STATUS: "MERGED" | "NOT_MERGED" | "N/A";
  PRODUCTION_CHANGE: "YES" | "NO";
  UNEXPECTED_RESULTS: string[];
  DECISIONS_REQUIRED: string[];
  BLOCKERS: string[];
  NEXT_RECOMMENDED_TASK: string | null;
  SESSION_HEALTH: "GOOD" | "DEGRADED" | "NEW_SESSION_RECOMMENDED";
  SESSION_CONTEXT: "UNKNOWN" | string;
};

