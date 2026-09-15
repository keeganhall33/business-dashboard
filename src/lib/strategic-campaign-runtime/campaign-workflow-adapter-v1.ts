import { createHash } from "node:crypto";

import type { CampaignSteeringSnapshotV1 } from "@/lib/strategic-campaign-runtime/campaign-steering-v1";

export type CampaignStepApprovalClassV1 = "NONE" | "REVIEW" | "KEEGAN";

export type CampaignCandidateStepV1 = {
  stepId: string;
  objective: string;
  evidenceRefs: readonly string[];
  allowedActions: readonly string[];
  forbiddenActions: readonly string[];
  approvalClass: CampaignStepApprovalClassV1;
  dependencyIds: readonly string[];
  validationChecks: readonly string[];
  expectedCompletionEvidence: readonly string[];
  bounds: {
    timeoutSeconds: number;
    maxCostUsd: number;
    maxAttempts: number;
    blastRadius: "PURE" | "REPOSITORY" | "INTERNAL_DATA";
  };
};

export type CampaignWorkflowCompileInputV1 = {
  snapshot: CampaignSteeringSnapshotV1;
  expectedPlanVersion: number;
  candidate: CampaignCandidateStepV1;
  resolvedDependencyIds?: readonly string[];
  inFlightStepIds?: readonly string[];
  wakeSatisfied?: boolean;
  requestedCampaignOutcome?: "CONTINUE" | "SUCCEEDED";
  successEvidenceSatisfied?: boolean;
};

export type CampaignWorkflowTaskV1 = {
  contractVersion: "CampaignWorkflowTaskV1";
  taskId: string;
  idempotencyKey: string;
  campaignId: string;
  planVersion: number;
  campaignObjective: string;
  stepId: string;
  stepObjective: string;
  evidenceRefs: readonly string[];
  allowedActions: readonly string[];
  forbiddenActions: readonly string[];
  approvalClass: CampaignStepApprovalClassV1;
  dependencyIds: readonly string[];
  validationChecks: readonly string[];
  expectedCompletionEvidence: readonly string[];
  bounds: CampaignCandidateStepV1["bounds"];
  requestedCampaignOutcome: "CONTINUE" | "SUCCEEDED";
  externalSideEffectsPerformed: false;
};

export class CampaignWorkflowCompileError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "CampaignWorkflowCompileError";
  }
}

const TERMINAL_STATES = new Set(["SUCCEEDED", "KILLED"]);
const MAX_LIST = 100;

function required(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CampaignWorkflowCompileError("REQUIRED_FIELD", `${label} is required`);
  }
  return value.trim();
}

function sortedUnique(values: readonly string[] | undefined, label: string): string[] {
  if (!Array.isArray(values)) throw new CampaignWorkflowCompileError("INVALID_LIST", `${label} must be an array`);
  const normalized = [...new Set(values.map((value) => required(value, label)))].sort((a, b) => a.localeCompare(b));
  if (normalized.length > MAX_LIST) throw new CampaignWorkflowCompileError("BOUND_EXCEEDED", `${label} exceeds ${MAX_LIST}`);
  return normalized;
}

function boundedNumber(value: unknown, label: string, minimum: number, maximum: number, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    throw new CampaignWorkflowCompileError("INVALID_BOUND", `${label} is outside its allowed bound`);
  }
  return value;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

export function compileCampaignWorkflowTaskV1(input: CampaignWorkflowCompileInputV1): CampaignWorkflowTaskV1 {
  if (!input || typeof input !== "object" || !input.snapshot?.run) {
    throw new CampaignWorkflowCompileError("INVALID_INPUT", "Campaign snapshot is required");
  }
  const run = input.snapshot.run;
  if (TERMINAL_STATES.has(run.state)) throw new CampaignWorkflowCompileError("TERMINAL_CAMPAIGN", "Terminal campaigns cannot dispatch work");
  if (run.state === "DRAFT") throw new CampaignWorkflowCompileError("CAMPAIGN_NOT_ACTIVE", "Draft campaigns cannot dispatch work");
  if (run.state === "WAITING" && input.wakeSatisfied !== true) {
    throw new CampaignWorkflowCompileError("WAKE_NOT_SATISFIED", "Waiting campaigns require a satisfied wake before dispatch");
  }
  if (!Number.isInteger(input.expectedPlanVersion) || input.expectedPlanVersion !== run.planVersion) {
    throw new CampaignWorkflowCompileError("STALE_PLAN_VERSION", "Expected plan version does not match the campaign");
  }

  const candidate = input.candidate;
  if (!candidate || typeof candidate !== "object") throw new CampaignWorkflowCompileError("STEP_REQUIRED", "Candidate step is required");
  const stepId = required(candidate.stepId, "stepId");
  const plan = run.plans.find((item) => item.version === run.planVersion);
  if (!plan?.steps.includes(stepId)) throw new CampaignWorkflowCompileError("STEP_NOT_IN_PLAN", "Candidate step is not in the current plan");
  if (input.snapshot.completedStepIds.includes(stepId)) throw new CampaignWorkflowCompileError("STEP_ALREADY_COMPLETED", "Completed work cannot be replayed");
  if ((input.inFlightStepIds ?? []).includes(stepId)) throw new CampaignWorkflowCompileError("STEP_ALREADY_IN_FLIGHT", "In-flight work cannot be dispatched twice");

  const dependencies = sortedUnique(candidate.dependencyIds, "dependencyIds");
  const resolved = new Set(sortedUnique(input.resolvedDependencyIds ?? [], "resolvedDependencyIds"));
  const unresolved = dependencies.filter((dependency) => !resolved.has(dependency));
  if (unresolved.length) throw new CampaignWorkflowCompileError("UNRESOLVED_DEPENDENCY", `Unresolved dependencies: ${unresolved.join(", ")}`);
  const allowedActions = sortedUnique(candidate.allowedActions, "allowedActions");
  const forbiddenActions = sortedUnique(candidate.forbiddenActions, "forbiddenActions");
  if (!allowedActions.length) throw new CampaignWorkflowCompileError("MISSING_AUTHORITY", "At least one allowed action is required");
  if (allowedActions.some((action) => forbiddenActions.includes(action))) {
    throw new CampaignWorkflowCompileError("CONFLICTING_AUTHORITY", "An action cannot be both allowed and forbidden");
  }
  const approvalClass = candidate.approvalClass;
  if (!new Set(["NONE", "REVIEW", "KEEGAN"]).has(approvalClass)) {
    throw new CampaignWorkflowCompileError("INVALID_APPROVAL_CLASS", "Approval class is unsupported");
  }
  const evidenceRefs = sortedUnique(candidate.evidenceRefs, "evidenceRefs");
  const validationChecks = sortedUnique(candidate.validationChecks, "validationChecks");
  const expectedCompletionEvidence = sortedUnique(candidate.expectedCompletionEvidence, "expectedCompletionEvidence");
  if (!validationChecks.length || !expectedCompletionEvidence.length) {
    throw new CampaignWorkflowCompileError("VALIDATION_REQUIRED", "Validation and completion evidence are required");
  }

  const bounds = {
    timeoutSeconds: boundedNumber(candidate.bounds?.timeoutSeconds, "timeoutSeconds", 1, 86_400, true),
    maxCostUsd: boundedNumber(candidate.bounds?.maxCostUsd, "maxCostUsd", 0, 1_000),
    maxAttempts: boundedNumber(candidate.bounds?.maxAttempts, "maxAttempts", 1, 5, true),
    blastRadius: candidate.bounds?.blastRadius
  } as CampaignCandidateStepV1["bounds"];
  if (!new Set(["PURE", "REPOSITORY", "INTERNAL_DATA"]).has(bounds.blastRadius)) {
    throw new CampaignWorkflowCompileError("INVALID_BOUND", "blastRadius is unsupported");
  }
  const requestedCampaignOutcome = input.requestedCampaignOutcome ?? "CONTINUE";
  if (requestedCampaignOutcome === "SUCCEEDED" && input.successEvidenceSatisfied !== true) {
    throw new CampaignWorkflowCompileError("SUCCESS_EVIDENCE_REQUIRED", "Workflow output cannot complete a campaign without independent success evidence");
  }

  const identity = {
    campaignId: run.id,
    planVersion: run.planVersion,
    stepId,
    objective: required(candidate.objective, "step objective"),
    evidenceRefs,
    allowedActions,
    forbiddenActions,
    approvalClass,
    dependencies,
    validationChecks,
    expectedCompletionEvidence,
    bounds,
    requestedCampaignOutcome
  };
  const idempotencyKey = createHash("sha256").update(JSON.stringify(canonical(identity))).digest("hex");
  return freeze({
    contractVersion: "CampaignWorkflowTaskV1",
    taskId: `campaign_step_${idempotencyKey.slice(0, 20)}`,
    idempotencyKey,
    campaignId: run.id,
    planVersion: run.planVersion,
    campaignObjective: run.objective,
    stepId,
    stepObjective: identity.objective,
    evidenceRefs,
    allowedActions,
    forbiddenActions,
    approvalClass,
    dependencyIds: dependencies,
    validationChecks,
    expectedCompletionEvidence,
    bounds,
    requestedCampaignOutcome,
    externalSideEffectsPerformed: false
  });
}
