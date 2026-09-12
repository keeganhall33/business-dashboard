import { getAgentOperatingModel } from "./operating-model";
import type {
  EvidenceRequirement,
  ExecutionBudget,
  SuccessCriterion,
  TaskContractV1
} from "./execution-control";

export const DEFAULT_AGENT_EXECUTION_BUDGET: ExecutionBudget = {
  maxAttempts: 3,
  maxToolCalls: 20,
  maxRuntimeMs: 10 * 60 * 1000
};

export type AgentTaskContractInput = {
  taskId: string;
  agentKey: string;
  objective: string;
  allowedTools: string[];
  allowedSources: string[];
  allowedScopes?: string[];
  evidenceRequirements: EvidenceRequirement[];
  successCriteria: SuccessCriterion[];
  constraints?: string[];
  approvalRequiredFor?: string[];
  outputRequirements?: string[];
  budget?: Partial<ExecutionBudget>;
  stopConditions?: string[];
  escalationConditions?: string[];
};

export function createAgentTaskContract(input: AgentTaskContractInput): TaskContractV1 {
  const model = getAgentOperatingModel(input.agentKey);
  if (!model) {
    throw new Error(`Unknown agent operating model: ${input.agentKey}`);
  }

  return {
    version: 1,
    taskId: input.taskId,
    objective: input.objective,
    allowedTools: [...new Set(input.allowedTools)],
    allowedSources: [...new Set(input.allowedSources)],
    allowedScopes: [...new Set(input.allowedScopes ?? model.careerLanes.map((lane) => lane.toLowerCase()))],
    evidenceRequirements: input.evidenceRequirements,
    successCriteria: input.successCriteria,
    constraints: [...new Set([...model.guardrails, ...(input.constraints ?? [])])],
    approvalRequiredFor: [...new Set([
      "consequential_or_irreversible_action",
      ...(input.approvalRequiredFor ?? [])
    ])],
    outputRequirements: [...new Set([
      "verification_result",
      "decision_provenance",
      ...(input.outputRequirements ?? [])
    ])],
    budget: {
      ...DEFAULT_AGENT_EXECUTION_BUDGET,
      ...(input.budget ?? {})
    },
    stopConditions: [...new Set([
      "no measurable progress after a repeated failure",
      "execution budget exhausted",
      ...(input.stopConditions ?? [])
    ])],
    escalationConditions: [...new Set([
      "human approval required",
      "destructive or irreversible action",
      "ambiguous requirement that materially changes the decision",
      ...(input.escalationConditions ?? [])
    ])]
  };
}
