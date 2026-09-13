import type { WorkflowNodeV1 } from "../workflow-graph/workflow-graph-v1";

export const REASONING_POLICY_CONTRACT_VERSION_V1 = "REASONING_POLICY_V1" as const;

export type ReasoningBusinessImpactV1 = "LOW" | "MEDIUM" | "HIGH";
export type ReasoningAmbiguityV1 = "LOW" | "MEDIUM" | "HIGH";
export type ReasoningEvidenceStateV1 = "CURRENT" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type ReasoningModelTierV1 = "NONE" | "LOCAL_EFFICIENT" | "BALANCED" | "FRONTIER";
export type ReasoningEffortV1 = "low" | "medium" | "high" | "xhigh" | "max";
export type ReasoningContextStrategyV1 = "NONE" | "TARGETED_RETRIEVAL" | "EXPANDED_RETRIEVAL";
export type ReasoningPolicyStateV1 = "READY" | "HANDOFF_REQUIRED";
export type ReasoningEffortTransitionV1 =
  | "NONE"
  | "REQUEST_LEVEL"
  | "CACHE_PRESERVING_CONFIGURATION_UPDATE";

export type ReasoningPriorAttemptV1 = Readonly<{
  attempted_tier: Exclude<ReasoningModelTierV1, "NONE">;
  effort: ReasoningEffortV1;
  quality_passed: boolean;
  failure_code: string | null;
}>;

export type ReasoningPolicyInputV1 = Readonly<{
  node: WorkflowNodeV1;
  business_impact: ReasoningBusinessImpactV1;
  ambiguity: ReasoningAmbiguityV1;
  evidence_state: ReasoningEvidenceStateV1;
  authorized_model_tiers: readonly Exclude<ReasoningModelTierV1, "NONE">[];
  prior_attempt?: ReasoningPriorAttemptV1 | null;
  previous_effort?: ReasoningEffortV1 | null;
  supports_effort_configuration_update?: boolean;
  maximum_reasoning_requested?: boolean;
  maximum_reasoning_authorized?: boolean;
}>;

export type ReasoningPolicyDecisionV1 = Readonly<{
  contract_version: typeof REASONING_POLICY_CONTRACT_VERSION_V1;
  node_id: string;
  state: ReasoningPolicyStateV1;
  execution_mode: "DETERMINISTIC" | "MODEL" | "EXTERNAL_EXPERT_HANDOFF";
  model_tier: ReasoningModelTierV1;
  reasoning_effort: ReasoningEffortV1 | null;
  effort_transition: ReasoningEffortTransitionV1;
  context_strategy: ReasoningContextStrategyV1;
  budgets: Readonly<{
    max_context_tokens: number;
    max_output_tokens: number;
    max_cost_usd: number;
    max_runtime_ms: number;
    max_retries: number;
  }>;
  reason_codes: readonly ReasoningPolicyReasonCodeV1[];
}>;

export type ReasoningPolicyReasonCodeV1 =
  | "DETERMINISTIC_NODE_MODEL_FREE"
  | "STANDARD_MODEL_REASONING"
  | "ROUTINE_LOW_AMBIGUITY"
  | "VERIFICATION_REQUIRES_DEPTH"
  | "SYNTHESIS_REQUIRES_DEPTH"
  | "HIGH_BUSINESS_IMPACT"
  | "HIGH_AMBIGUITY"
  | "EVIDENCE_UNRESOLVED"
  | "EVIDENCE_CONFLICTED"
  | "PRIOR_QUALITY_FAILURE"
  | "MAXIMUM_REASONING_EXPLICITLY_AUTHORIZED"
  | "MAXIMUM_REASONING_NOT_AUTHORIZED"
  | "REQUIRED_TIER_NOT_AUTHORIZED";

const MODEL_TIERS: readonly Exclude<ReasoningModelTierV1, "NONE">[] = [
  "LOCAL_EFFICIENT",
  "BALANCED",
  "FRONTIER"
];

const EFFORTS: readonly ReasoningEffortV1[] = ["low", "medium", "high", "xhigh", "max"];
const BUSINESS_IMPACTS = new Set<ReasoningBusinessImpactV1>(["LOW", "MEDIUM", "HIGH"]);
const AMBIGUITIES = new Set<ReasoningAmbiguityV1>(["LOW", "MEDIUM", "HIGH"]);
const EVIDENCE_STATES = new Set<ReasoningEvidenceStateV1>(["CURRENT", "UNKNOWN", "STALE", "CONFLICTED"]);
const NODE_KINDS = new Set(["DETERMINISTIC", "WORKER", "VERIFY", "REDUCE", "SYNTHESIZE"]);

function fail(code: string): never {
  throw new Error(`REASONING_POLICY_${code}`);
}

function assertInput(input: ReasoningPolicyInputV1): void {
  if (!input?.node?.id) fail("NODE_REQUIRED");
  if (!NODE_KINDS.has(input.node.kind)) fail("NODE_KIND_INVALID");
  if (!BUSINESS_IMPACTS.has(input.business_impact)) fail("BUSINESS_IMPACT_INVALID");
  if (!AMBIGUITIES.has(input.ambiguity)) fail("AMBIGUITY_INVALID");
  if (!EVIDENCE_STATES.has(input.evidence_state)) fail("EVIDENCE_STATE_INVALID");
  const budget = input.node.budget;
  if (
    !budget ||
    !Number.isInteger(budget.maxRuntimeMs) || budget.maxRuntimeMs <= 0 ||
    !Number.isInteger(budget.maxRetries) || budget.maxRetries < 0 ||
    !Number.isInteger(budget.maxContextTokens) || budget.maxContextTokens <= 0 ||
    !Number.isInteger(budget.maxOutputTokens) || budget.maxOutputTokens <= 0 ||
    typeof budget.maxCostUsd !== "number" || !Number.isFinite(budget.maxCostUsd) || budget.maxCostUsd < 0
  ) fail("BUDGET_INVALID");
  if (!Array.isArray(input.authorized_model_tiers)) fail("AUTHORIZED_TIERS_REQUIRED");
  if (new Set(input.authorized_model_tiers).size !== input.authorized_model_tiers.length) fail("AUTHORIZED_TIERS_DUPLICATE");
  if (input.authorized_model_tiers.some((tier) => !MODEL_TIERS.includes(tier))) fail("AUTHORIZED_TIER_INVALID");
  if (input.previous_effort != null && !EFFORTS.includes(input.previous_effort)) fail("PREVIOUS_EFFORT_INVALID");
  if (input.prior_attempt) {
    if (!MODEL_TIERS.includes(input.prior_attempt.attempted_tier)) fail("PRIOR_TIER_INVALID");
    if (!EFFORTS.includes(input.prior_attempt.effort)) fail("PRIOR_EFFORT_INVALID");
    if (!input.prior_attempt.quality_passed && !input.prior_attempt.failure_code?.trim()) fail("PRIOR_FAILURE_CODE_REQUIRED");
    if (input.prior_attempt.quality_passed && input.prior_attempt.failure_code != null) fail("PRIOR_SUCCESS_FAILURE_CODE_INVALID");
  }
}

function tierRank(tier: ReasoningModelTierV1): number {
  if (tier === "LOCAL_EFFICIENT") return 1;
  if (tier === "BALANCED") return 2;
  if (tier === "FRONTIER") return 3;
  return 0;
}

function nextTier(tier: Exclude<ReasoningModelTierV1, "NONE">): Exclude<ReasoningModelTierV1, "NONE"> {
  if (tier === "LOCAL_EFFICIENT") return "BALANCED";
  return "FRONTIER";
}

function nextEffort(effort: ReasoningEffortV1): ReasoningEffortV1 {
  const index = EFFORTS.indexOf(effort);
  return EFFORTS[Math.min(index + 1, EFFORTS.length - 1)];
}

function strongerEffort(left: ReasoningEffortV1, right: ReasoningEffortV1): ReasoningEffortV1 {
  return EFFORTS[Math.max(EFFORTS.indexOf(left), EFFORTS.indexOf(right))];
}

function transition(
  selected: ReasoningEffortV1 | null,
  previous: ReasoningEffortV1 | null | undefined,
  supportsUpdate: boolean | undefined
): ReasoningEffortTransitionV1 {
  if (selected == null || selected === previous) return "NONE";
  if (previous != null && supportsUpdate) return "CACHE_PRESERVING_CONFIGURATION_UPDATE";
  return "REQUEST_LEVEL";
}

function budgets(node: WorkflowNodeV1): ReasoningPolicyDecisionV1["budgets"] {
  return Object.freeze({
    max_context_tokens: node.budget.maxContextTokens,
    max_output_tokens: node.budget.maxOutputTokens,
    max_cost_usd: node.budget.maxCostUsd,
    max_runtime_ms: node.budget.maxRuntimeMs,
    max_retries: node.budget.maxRetries
  });
}

export function planReasoningPolicyV1(input: ReasoningPolicyInputV1): ReasoningPolicyDecisionV1 {
  assertInput(input);
  const { node } = input;
  const nodeBudgets = budgets(node);

  if (node.kind === "DETERMINISTIC") {
    return Object.freeze({
      contract_version: REASONING_POLICY_CONTRACT_VERSION_V1,
      node_id: node.id,
      state: "READY",
      execution_mode: "DETERMINISTIC",
      model_tier: "NONE",
      reasoning_effort: null,
      effort_transition: "NONE",
      context_strategy: "NONE",
      budgets: nodeBudgets,
      reason_codes: Object.freeze(["DETERMINISTIC_NODE_MODEL_FREE"] as ReasoningPolicyReasonCodeV1[])
    });
  }

  const reasons: ReasoningPolicyReasonCodeV1[] = [];
  let requiredTier: Exclude<ReasoningModelTierV1, "NONE"> = "BALANCED";
  let effort: ReasoningEffortV1 = "medium";
  let contextStrategy: ReasoningContextStrategyV1 = "TARGETED_RETRIEVAL";

  if ((node.kind === "WORKER" || node.kind === "REDUCE") && input.business_impact === "LOW" && input.ambiguity === "LOW" && input.evidence_state === "CURRENT") {
    requiredTier = "LOCAL_EFFICIENT";
    reasons.push("ROUTINE_LOW_AMBIGUITY");
  }
  if (node.kind === "VERIFY") {
    effort = "high";
    reasons.push("VERIFICATION_REQUIRES_DEPTH");
  }
  if (node.kind === "SYNTHESIZE") {
    effort = "high";
    reasons.push("SYNTHESIS_REQUIRES_DEPTH");
  }
  if (input.business_impact === "HIGH") {
    requiredTier = "FRONTIER";
    effort = node.kind === "SYNTHESIZE" ? "xhigh" : "high";
    reasons.push("HIGH_BUSINESS_IMPACT");
  }
  if (input.ambiguity === "HIGH") {
    requiredTier = "FRONTIER";
    effort = node.kind === "SYNTHESIZE" ? "xhigh" : "high";
    contextStrategy = "EXPANDED_RETRIEVAL";
    reasons.push("HIGH_AMBIGUITY");
  }
  if (input.evidence_state === "UNKNOWN" || input.evidence_state === "STALE") {
    contextStrategy = "EXPANDED_RETRIEVAL";
    reasons.push("EVIDENCE_UNRESOLVED");
  }
  if (input.evidence_state === "CONFLICTED") {
    requiredTier = "FRONTIER";
    effort = "xhigh";
    contextStrategy = "EXPANDED_RETRIEVAL";
    reasons.push("EVIDENCE_CONFLICTED");
  }
  if (input.prior_attempt && !input.prior_attempt.quality_passed) {
    const escalatedTier = nextTier(input.prior_attempt.attempted_tier);
    if (tierRank(escalatedTier) > tierRank(requiredTier)) requiredTier = escalatedTier;
    effort = strongerEffort(effort, nextEffort(input.prior_attempt.effort));
    contextStrategy = "EXPANDED_RETRIEVAL";
    reasons.push("PRIOR_QUALITY_FAILURE");
  }

  if (input.maximum_reasoning_requested) {
    requiredTier = "FRONTIER";
    if (input.maximum_reasoning_authorized) {
      effort = "max";
      reasons.push("MAXIMUM_REASONING_EXPLICITLY_AUTHORIZED");
    } else {
      effort = strongerEffort(effort, "xhigh");
      reasons.push("MAXIMUM_REASONING_NOT_AUTHORIZED");
    }
  }
  if (reasons.length === 0) reasons.push("STANDARD_MODEL_REASONING");

  const selectedTier = [...input.authorized_model_tiers]
    .filter((tier) => tierRank(tier) >= tierRank(requiredTier))
    .sort((left, right) => tierRank(left) - tierRank(right))[0];
  if (!selectedTier) {
    reasons.push("REQUIRED_TIER_NOT_AUTHORIZED");
    return Object.freeze({
      contract_version: REASONING_POLICY_CONTRACT_VERSION_V1,
      node_id: node.id,
      state: "HANDOFF_REQUIRED",
      execution_mode: "EXTERNAL_EXPERT_HANDOFF",
      model_tier: "NONE",
      reasoning_effort: null,
      effort_transition: "NONE",
      context_strategy: contextStrategy,
      budgets: nodeBudgets,
      reason_codes: Object.freeze([...new Set(reasons)])
    });
  }

  return Object.freeze({
    contract_version: REASONING_POLICY_CONTRACT_VERSION_V1,
    node_id: node.id,
    state: "READY",
    execution_mode: "MODEL",
    model_tier: selectedTier,
    reasoning_effort: effort,
    effort_transition: transition(effort, input.previous_effort, input.supports_effort_configuration_update),
    context_strategy: contextStrategy,
    budgets: nodeBudgets,
    reason_codes: Object.freeze([...new Set(reasons)])
  });
}
