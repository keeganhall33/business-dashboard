export const agentKeys = ["avery", "sloan", "lyra", "noah"] as const;
export type AgentKey = (typeof agentKeys)[number];

export const agentDisplayNames: Record<AgentKey, string> = {
  avery: "Avery",
  sloan: "Sloan",
  lyra: "Lyra",
  noah: "Noah"
};

export const taskPriorities = ["critical", "high", "medium", "low"] as const;
export type TaskPriority = (typeof taskPriorities)[number];

export const taskStatuses = [
  "pending",
  "in_review",
  "approved",
  "rejected",
  "in_progress",
  "blocked",
  "completed"
] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const executionTypes = [
  "analysis",
  "content",
  "outreach_prep",
  "pricing",
  "research",
  "design",
  "data",
  "strategy"
] as const;
export type ExecutionType = (typeof executionTypes)[number];

export const opportunityTypes = [
  "brand_partnership",
  "licensing",
  "press",
  "collector_intro",
  "athlete_collab",
  "institutional"
] as const;
export type OpportunityType = (typeof opportunityTypes)[number];

export const opportunityStatuses = [
  "identified",
  "researching",
  "ready_for_outreach",
  "outreach_drafted",
  "in_conversation",
  "negotiating",
  "won",
  "lost",
  "parked"
] as const;
export type OpportunityStatus = (typeof opportunityStatuses)[number];

export const decisionTypes = ["strategic", "pricing", "partnership", "operational"] as const;
export type DecisionType = (typeof decisionTypes)[number];

export const runTypes = ["manual", "weekly", "rule_evaluation", "scheduler"] as const;
export type RunType = (typeof runTypes)[number];

export type CreateTaskRequest = {
  title: string;
  description?: string;
  agentKey: AgentKey;
  priority: TaskPriority;
  expectedImpact?: string;
  impactScore?: number;
  whyThisMatters?: string;
  relatedMetricKeys?: string[];
  requiresApproval?: boolean;
  executionType: ExecutionType;
};

export type ApproveTaskRequest = {
  approvedByUser: boolean;
};

export type RejectTaskRequest = {
  reason: string;
};

export type UpdateTaskStatusRequest = {
  status: TaskStatus;
};

export type CompleteTaskRequest = {
  resultSummary: string;
};

export type CreateOpportunityRequest = {
  name: string;
  organization?: string;
  opportunityType: OpportunityType;
  status: OpportunityStatus;
  valueEstimate?: number;
  prestigeScore?: number;
  probabilityScore?: number;
  ownerAgent: AgentKey;
  nextStep?: string;
  nextStepDueAt?: string;
  notesMd?: string;
  source?: string;
};

export type UpdateOpportunityStatusRequest = {
  status: OpportunityStatus;
};

export type CreateDecisionRequest = {
  decisionType: DecisionType;
  title: string;
  summary: string;
  detailMd?: string;
  expectedOutcome?: string;
  outcomeReviewDate?: string;
  decidedBy?: string;
};

export type RunAgentRequest = {
  runType?: RunType;
};
