import "@/lib/server-only";

import {
  planReasoningPolicyV1,
  type ReasoningPolicyDecisionV1,
} from "@/lib/intelligence/runtime/reasoning-policy-v1";
import type { WorkflowNodeV1 } from "@/lib/intelligence/workflow-graph/workflow-graph-v1";

export const ASK_JEEVES_GOVERNED_RESEARCH_VERSION_V1 =
  "ASK_JEEVES_GOVERNED_RESEARCH_V1" as const;

export type AskJeevesResearchStageV1 = "SCOUT" | "SYNTHESIZE" | "VERIFY";

export type AskJeevesResearchSourceV1 = Readonly<{
  label: string;
  href: string;
}>;

export type AskJeevesResearchStagePlanV1 = Readonly<{
  stage: AskJeevesResearchStageV1;
  contextId: string;
  maxSteps: number;
  policy: ReasoningPolicyDecisionV1;
}>;

export type AskJeevesResearchStageRequestV1 =
  | Readonly<{
      stage: "SCOUT";
      contextId: string;
      maxSteps: number;
      policy: ReasoningPolicyDecisionV1;
      question: string;
      internalEvidence: readonly string[];
      abortSignal: AbortSignal;
    }>
  | Readonly<{
      stage: "SYNTHESIZE";
      contextId: string;
      maxSteps: number;
      policy: ReasoningPolicyDecisionV1;
      question: string;
      internalEvidence: readonly string[];
      scoutSummary: string;
      scoutSources: readonly AskJeevesResearchSourceV1[];
      abortSignal: AbortSignal;
    }>
  | Readonly<{
      stage: "VERIFY";
      contextId: string;
      maxSteps: number;
      policy: ReasoningPolicyDecisionV1;
      question: string;
      internalEvidence: readonly string[];
      candidateAnswer: string;
      sources: readonly AskJeevesResearchSourceV1[];
      abortSignal: AbortSignal;
    }>;

export type AskJeevesResearchStageResultV1 =
  | Readonly<{
      stage: "SCOUT";
      summary: string;
      sources: readonly AskJeevesResearchSourceV1[];
    }>
  | Readonly<{
      stage: "SYNTHESIZE";
      answer: string;
      sources: readonly AskJeevesResearchSourceV1[];
    }>
  | Readonly<{
      stage: "VERIFY";
      supported: boolean;
      reason: string;
      sources: readonly AskJeevesResearchSourceV1[];
    }>;

export type AskJeevesResearchStageExecutorV1 = (
  request: AskJeevesResearchStageRequestV1,
) => Promise<AskJeevesResearchStageResultV1>;

export type AskJeevesGovernedResearchResultV1 = Readonly<{
  version: typeof ASK_JEEVES_GOVERNED_RESEARCH_VERSION_V1;
  status: "VERIFIED" | "UNABLE_TO_VERIFY";
  answer: string;
  sources: readonly AskJeevesResearchSourceV1[];
  reasonCodes: readonly (
    | "VERIFIED_BY_FRESH_CONTEXT"
    | "SCOUT_FAILED"
    | "NO_WEB_SOURCE"
    | "SYNTHESIS_FAILED"
    | "VERIFIER_FAILED"
    | "SOURCE_SUPPORT_NOT_VERIFIED"
  )[];
  stagePlans: readonly AskJeevesResearchStagePlanV1[];
  authority: Readonly<{
    crmMutationAllowed: false;
    outreachAllowed: false;
    publishingAllowed: false;
    spendingAllowed: false;
    approvalBypassAllowed: false;
  }>;
}>;

const AUTHORITY = Object.freeze({
  crmMutationAllowed: false,
  outreachAllowed: false,
  publishingAllowed: false,
  spendingAllowed: false,
  approvalBypassAllowed: false,
} as const);

const UNABLE_TO_VERIFY_ANSWER =
  "I could not independently verify current external evidence well enough to give you a reliable research answer. I will not fill the gap with an unsourced guess.";

function node(
  id: string,
  kind: WorkflowNodeV1["kind"],
  contextId: string,
  maxRuntimeMs: number,
  maxRetries: number,
  maxContextTokens: number,
  maxOutputTokens: number,
  maxCostUsd: number,
): WorkflowNodeV1 {
  return {
    id,
    kind,
    contextId,
    inputSchemaIds: ["ASK_JEEVES_RESEARCH_INPUT_V1"],
    outputSchemaIds: [`ASK_JEEVES_RESEARCH_${id.toUpperCase()}_OUTPUT_V1`],
    readResources: ["public-web", "canonical-business-evidence"],
    mutableWriteResources: [],
    evidenceAnchors: [],
    budget: {
      maxRuntimeMs,
      maxRetries,
      maxContextTokens,
      maxOutputTokens,
      maxCostUsd,
    },
    approvalClass: "AUTO_CONTINUE",
    truthState: "UNKNOWN",
  };
}

function plan(
  stage: AskJeevesResearchStageV1,
  workflowNode: WorkflowNodeV1,
  businessImpact: "LOW" | "MEDIUM" | "HIGH",
  ambiguity: "LOW" | "MEDIUM" | "HIGH",
  evidenceState: "CURRENT" | "UNKNOWN" | "STALE" | "CONFLICTED",
  maxSteps: number,
): AskJeevesResearchStagePlanV1 {
  return Object.freeze({
    stage,
    contextId: workflowNode.contextId,
    maxSteps,
    policy: planReasoningPolicyV1({
      node: workflowNode,
      business_impact: businessImpact,
      ambiguity,
      evidence_state: evidenceState,
      authorized_model_tiers: ["LOCAL_EFFICIENT", "BALANCED", "FRONTIER"],
      supports_effort_configuration_update: true,
    }),
  });
}

export function planAskJeevesExternalResearchV1(): readonly AskJeevesResearchStagePlanV1[] {
  const scoutNode = node(
    "ask-jeeves-research-scout-v1",
    "WORKER",
    "ask-jeeves-research-scout-context-v1",
    20_000,
    1,
    12_000,
    700,
    0.5,
  );
  const synthNode = node(
    "ask-jeeves-research-synthesis-v1",
    "SYNTHESIZE",
    "ask-jeeves-research-synthesis-context-v1",
    45_000,
    1,
    30_000,
    1_800,
    3,
  );
  const verifyNode = node(
    "ask-jeeves-research-verify-v1",
    "VERIFY",
    "ask-jeeves-research-verify-context-v1",
    30_000,
    0,
    20_000,
    500,
    1,
  );

  return Object.freeze([
    plan("SCOUT", scoutNode, "MEDIUM", "LOW", "UNKNOWN", 3),
    plan("SYNTHESIZE", synthNode, "HIGH", "MEDIUM", "CURRENT", 5),
    plan("VERIFY", verifyNode, "MEDIUM", "MEDIUM", "CURRENT", 3),
  ]);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeSources(
  sources: readonly AskJeevesResearchSourceV1[],
): readonly AskJeevesResearchSourceV1[] {
  const deduped = new Map<string, AskJeevesResearchSourceV1>();
  for (const source of sources) {
    const href = source?.href?.trim();
    if (!href || !isHttpUrl(href)) continue;
    const label = source.label?.trim() || new URL(href).hostname;
    if (!deduped.has(href)) deduped.set(href, Object.freeze({ label, href }));
    if (deduped.size >= 8) break;
  }
  return Object.freeze([...deduped.values()]);
}

function mergeSources(
  ...groups: readonly (readonly AskJeevesResearchSourceV1[])[]
): readonly AskJeevesResearchSourceV1[] {
  return normalizeSources(groups.flat());
}

async function runStage(
  planValue: AskJeevesResearchStagePlanV1,
  requestFactory: (abortSignal: AbortSignal) => AskJeevesResearchStageRequestV1,
  executor: AskJeevesResearchStageExecutorV1,
): Promise<AskJeevesResearchStageResultV1 | null> {
  const attempts = planValue.policy.budgets.max_retries + 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      planValue.policy.budgets.max_runtime_ms,
    );
    try {
      const result = await executor(requestFactory(controller.signal));
      if (result.stage !== planValue.stage) return null;
      return result;
    } catch {
      if (attempt === attempts - 1) return null;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

function unable(
  stagePlans: readonly AskJeevesResearchStagePlanV1[],
  reasonCode: Exclude<AskJeevesGovernedResearchResultV1["reasonCodes"][number], "VERIFIED_BY_FRESH_CONTEXT">,
  sources: readonly AskJeevesResearchSourceV1[] = [],
): AskJeevesGovernedResearchResultV1 {
  return Object.freeze({
    version: ASK_JEEVES_GOVERNED_RESEARCH_VERSION_V1,
    status: "UNABLE_TO_VERIFY",
    answer: UNABLE_TO_VERIFY_ANSWER,
    sources: normalizeSources(sources),
    reasonCodes: Object.freeze([reasonCode]),
    stagePlans,
    authority: AUTHORITY,
  });
}

export async function runAskJeevesGovernedResearchV1(input: Readonly<{
  question: string;
  internalEvidence?: readonly string[];
  executor: AskJeevesResearchStageExecutorV1;
}>): Promise<AskJeevesGovernedResearchResultV1> {
  const question = input.question?.trim();
  if (!question) throw new Error("ASK_JEEVES_GOVERNED_RESEARCH_QUESTION_REQUIRED");
  if (question.length > 4_000) throw new Error("ASK_JEEVES_GOVERNED_RESEARCH_QUESTION_TOO_LONG");

  const internalEvidence = Object.freeze(
    [...(input.internalEvidence ?? [])]
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 30),
  );
  const stagePlans = planAskJeevesExternalResearchV1();
  const scoutPlan = stagePlans[0];
  const synthPlan = stagePlans[1];
  const verifyPlan = stagePlans[2];

  const scout = await runStage(
    scoutPlan,
    (abortSignal) => ({
      stage: "SCOUT",
      contextId: scoutPlan.contextId,
      maxSteps: scoutPlan.maxSteps,
      policy: scoutPlan.policy,
      question,
      internalEvidence,
      abortSignal,
    }),
    input.executor,
  );
  if (!scout || scout.stage !== "SCOUT") return unable(stagePlans, "SCOUT_FAILED");

  const scoutSources = normalizeSources(scout.sources);
  if (scoutSources.length === 0) return unable(stagePlans, "NO_WEB_SOURCE");

  const synthesis = await runStage(
    synthPlan,
    (abortSignal) => ({
      stage: "SYNTHESIZE",
      contextId: synthPlan.contextId,
      maxSteps: synthPlan.maxSteps,
      policy: synthPlan.policy,
      question,
      internalEvidence,
      scoutSummary: scout.summary.trim().slice(0, 6_000),
      scoutSources,
      abortSignal,
    }),
    input.executor,
  );
  if (!synthesis || synthesis.stage !== "SYNTHESIZE" || !synthesis.answer.trim()) {
    return unable(stagePlans, "SYNTHESIS_FAILED", scoutSources);
  }

  const candidateSources = mergeSources(scoutSources, synthesis.sources);
  if (candidateSources.length === 0) return unable(stagePlans, "NO_WEB_SOURCE");

  const verification = await runStage(
    verifyPlan,
    (abortSignal) => ({
      stage: "VERIFY",
      contextId: verifyPlan.contextId,
      maxSteps: verifyPlan.maxSteps,
      policy: verifyPlan.policy,
      question,
      internalEvidence,
      candidateAnswer: synthesis.answer.trim(),
      sources: candidateSources,
      abortSignal,
    }),
    input.executor,
  );
  if (!verification || verification.stage !== "VERIFY") {
    return unable(stagePlans, "VERIFIER_FAILED", candidateSources);
  }

  const verifiedSources = mergeSources(candidateSources, verification.sources);
  if (!verification.supported) {
    return unable(stagePlans, "SOURCE_SUPPORT_NOT_VERIFIED", verifiedSources);
  }
  if (verifiedSources.length === 0) return unable(stagePlans, "NO_WEB_SOURCE");

  return Object.freeze({
    version: ASK_JEEVES_GOVERNED_RESEARCH_VERSION_V1,
    status: "VERIFIED",
    answer: synthesis.answer.trim(),
    sources: verifiedSources,
    reasonCodes: Object.freeze(["VERIFIED_BY_FRESH_CONTEXT"] as const),
    stagePlans,
    authority: AUTHORITY,
  });
}
