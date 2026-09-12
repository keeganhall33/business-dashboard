export type TaskStatus =
  | "pending"
  | "running"
  | "verifying"
  | "retrying"
  | "rerouting"
  | "awaiting_approval"
  | "completed"
  | "rejected"
  | "escalated"
  | "stopped";

export type VerificationDisposition =
  | "accept"
  | "retry"
  | "reroute"
  | "escalate"
  | "reject";

export type EvidenceRequirement = {
  key: string;
  description: string;
  required?: boolean;
  minimumCount?: number;
};

export type SuccessCriterion = {
  key: string;
  description: string;
  required?: boolean;
};

export type ExecutionBudget = {
  maxAttempts: number;
  maxToolCalls: number;
  maxRuntimeMs: number;
  maxCostUsd?: number;
};

export type TaskContractV1 = {
  version: 1;
  taskId: string;
  objective: string;
  allowedTools: string[];
  allowedSources: string[];
  allowedScopes?: string[];
  evidenceRequirements: EvidenceRequirement[];
  successCriteria: SuccessCriterion[];
  constraints: string[];
  approvalRequiredFor: string[];
  outputRequirements: string[];
  budget: ExecutionBudget;
  stopConditions: string[];
  escalationConditions: string[];
};

export type ContextItem<T = unknown> = {
  key: string;
  domain: string;
  value: T;
  relevance: string;
};

export type TaskContextPacket<T = unknown> = {
  taskId: string;
  objective: string;
  items: ContextItem<T>[];
  includedDomains: string[];
  excludedDomains: string[];
};

export type VerificationGate = {
  key: string;
  passed: boolean;
  required: boolean;
  reason: string;
};

export type VerificationInput = {
  evidenceCounts?: Record<string, number>;
  criterionResults?: Record<string, boolean>;
  toolCalls: number;
  runtimeMs: number;
  costUsd?: number;
  approvalPending?: boolean;
  destructiveOrIrreversible?: boolean;
  failureSignature?: string | null;
  previousFailureSignature?: string | null;
  meaningfulProgress?: boolean;
  alternateRouteAvailable?: boolean;
};

export type VerificationResultV1 = {
  accepted: boolean;
  disposition: VerificationDisposition;
  gates: VerificationGate[];
  failedRequiredGates: string[];
  reason: string;
};

export type DecisionProvenanceV1 = {
  taskId: string;
  decision: string;
  disposition: VerificationDisposition;
  confidence: number | null;
  evidenceRefs: string[];
  passedGates: string[];
  failedGates: string[];
  missingEvidence: string[];
  reason: string;
  nextAction: string | null;
  recordedAt: string;
};

export type WorkflowStateV1 = {
  version: 1;
  taskId: string;
  objective: string;
  currentNode: string;
  status: TaskStatus;
  attempt: number;
  toolCalls: number;
  runtimeMs: number;
  costUsd?: number;
  evidenceRefs: string[];
  sourcesChecked: string[];
  approvals: string[];
  blockedReason: string | null;
  nextAction: string | null;
  confidence: number | null;
  businessValue: number | null;
  urgency: number | null;
  relationshipPath: string[];
  lastMeaningfulProgressAt: string | null;
  lastFailureSignature: string | null;
  decisionProvenance: DecisionProvenanceV1[];
  humanAttentionRequired: boolean;
};

const required = (value: { required?: boolean }) => value.required !== false;

export function verifyTask(
  contract: TaskContractV1,
  input: VerificationInput,
  attempt: number
): VerificationResultV1 {
  const gates: VerificationGate[] = [];

  for (const requirement of contract.evidenceRequirements) {
    const count = input.evidenceCounts?.[requirement.key] ?? 0;
    const minimum = requirement.minimumCount ?? 1;
    gates.push({
      key: `evidence:${requirement.key}`,
      passed: count >= minimum,
      required: required(requirement),
      reason: `${count}/${minimum} evidence items available`
    });
  }

  for (const criterion of contract.successCriteria) {
    gates.push({
      key: `success:${criterion.key}`,
      passed: input.criterionResults?.[criterion.key] === true,
      required: required(criterion),
      reason: input.criterionResults?.[criterion.key] === true
        ? "criterion satisfied"
        : "criterion not satisfied"
    });
  }

  const budgetChecks: VerificationGate[] = [
    {
      key: "budget:attempts",
      passed: attempt <= contract.budget.maxAttempts,
      required: true,
      reason: `${attempt}/${contract.budget.maxAttempts} attempts used`
    },
    {
      key: "budget:tool_calls",
      passed: input.toolCalls <= contract.budget.maxToolCalls,
      required: true,
      reason: `${input.toolCalls}/${contract.budget.maxToolCalls} tool calls used`
    },
    {
      key: "budget:runtime",
      passed: input.runtimeMs <= contract.budget.maxRuntimeMs,
      required: true,
      reason: `${input.runtimeMs}/${contract.budget.maxRuntimeMs}ms runtime used`
    }
  ];

  if (contract.budget.maxCostUsd != null) {
    budgetChecks.push({
      key: "budget:cost",
      passed: (input.costUsd ?? 0) <= contract.budget.maxCostUsd,
      required: true,
      reason: `$${input.costUsd ?? 0}/$${contract.budget.maxCostUsd} cost used`
    });
  }
  gates.push(...budgetChecks);

  const failedRequiredGates = gates
    .filter((gate) => gate.required && !gate.passed)
    .map((gate) => gate.key);

  const budgetExceeded = budgetChecks.some((gate) => !gate.passed);
  if (input.approvalPending || input.destructiveOrIrreversible) {
    return result(false, "escalate", gates, failedRequiredGates, "Human approval is required before execution can continue.");
  }

  if (budgetExceeded) {
    return result(false, "escalate", gates, failedRequiredGates, "Execution budget exhausted; do not retry automatically.");
  }

  if (failedRequiredGates.length === 0) {
    return result(true, "accept", gates, [], "All required verification gates passed.");
  }

  const repeatedFailure = Boolean(
    input.failureSignature &&
      input.previousFailureSignature &&
      input.failureSignature === input.previousFailureSignature
  );

  if (repeatedFailure && !input.meaningfulProgress) {
    return input.alternateRouteAvailable
      ? result(false, "reroute", gates, failedRequiredGates, "The same failure repeated without measurable progress; use an alternate route.")
      : result(false, "escalate", gates, failedRequiredGates, "The same failure repeated without measurable progress and no alternate route is available.");
  }

  if (attempt >= contract.budget.maxAttempts) {
    return input.alternateRouteAvailable
      ? result(false, "reroute", gates, failedRequiredGates, "Required gates remain unmet at the retry limit; use an alternate route.")
      : result(false, "escalate", gates, failedRequiredGates, "Required gates remain unmet at the retry limit.");
  }

  return result(false, "retry", gates, failedRequiredGates, "Required gates remain unmet and a bounded, evidence-driven retry is allowed.");
}

function result(
  accepted: boolean,
  disposition: VerificationDisposition,
  gates: VerificationGate[],
  failedRequiredGates: string[],
  reason: string
): VerificationResultV1 {
  return { accepted, disposition, gates, failedRequiredGates, reason };
}

export function buildContextPacket<T>(args: {
  taskId: string;
  objective: string;
  allowedDomains: string[];
  items: ContextItem<T>[];
}): TaskContextPacket<T> {
  const allowed = new Set(args.allowedDomains);
  const included = args.items.filter((item) => allowed.has(item.domain));
  const allDomains = new Set(args.items.map((item) => item.domain));

  return {
    taskId: args.taskId,
    objective: args.objective,
    items: included,
    includedDomains: [...new Set(included.map((item) => item.domain))],
    excludedDomains: [...allDomains].filter((domain) => !allowed.has(domain))
  };
}

export function recordDecisionProvenance(args: {
  taskId: string;
  decision: string;
  verification: VerificationResultV1;
  evidenceRefs?: string[];
  confidence?: number | null;
  missingEvidence?: string[];
  nextAction?: string | null;
  now?: string;
}): DecisionProvenanceV1 {
  return {
    taskId: args.taskId,
    decision: args.decision,
    disposition: args.verification.disposition,
    confidence: args.confidence ?? null,
    evidenceRefs: args.evidenceRefs ?? [],
    passedGates: args.verification.gates.filter((gate) => gate.passed).map((gate) => gate.key),
    failedGates: args.verification.failedRequiredGates,
    missingEvidence: args.missingEvidence ?? [],
    reason: args.verification.reason,
    nextAction: args.nextAction ?? null,
    recordedAt: args.now ?? new Date().toISOString()
  };
}

export function createWorkflowState(contract: TaskContractV1, currentNode = "start"): WorkflowStateV1 {
  return {
    version: 1,
    taskId: contract.taskId,
    objective: contract.objective,
    currentNode,
    status: "pending",
    attempt: 0,
    toolCalls: 0,
    runtimeMs: 0,
    evidenceRefs: [],
    sourcesChecked: [],
    approvals: [],
    blockedReason: null,
    nextAction: null,
    confidence: null,
    businessValue: null,
    urgency: null,
    relationshipPath: [],
    lastMeaningfulProgressAt: null,
    lastFailureSignature: null,
    decisionProvenance: [],
    humanAttentionRequired: false
  };
}
