import { createHash } from "node:crypto";

import type { ActionLevel } from "@/lib/actions/action-contract";
import type {
  DecisionApprovalClassV1,
  DecisionOwnerV1,
  DecisionPortfolioItemV1,
  DecisionPortfolioV1
} from "@/lib/strategy-engine/decision-portfolio-v1";

export const DECISION_PORTFOLIO_EXECUTION_COMPILER_POLICY_V1 =
  "decision_portfolio_execution_compiler_v1.0.0" as const;

export type DecisionPortfolioPreparationStateV1 =
  | "PREPARED_INTERNAL"
  | "PREPARED_FOR_REVIEW"
  | "PREPARED_FOR_KEEGAN"
  | "PREPARED_FOR_OWNER"
  | "WAITING_DEPENDENCY"
  | "REVALIDATE"
  | "BLOCKED"
  | "DUPLICATE_NOOP";

export type DecisionPortfolioPreparationGateV1 =
  | "ACTION_RUNTIME_POLICY_EVALUATION"
  | "REVIEW_REQUIRED"
  | "KEEGAN_APPROVAL_REQUIRED"
  | "OWNER_ACTION_REQUIRED"
  | "DEPENDENCY_REQUIRED"
  | "EVIDENCE_REVALIDATION_REQUIRED"
  | "BLOCKER_RESOLUTION_REQUIRED"
  | "NO_ACTION";

export type DecisionPortfolioPreparationHandoffV1 = {
  candidateId: string;
  title: string;
  owner: DecisionOwnerV1;
  approvalClass: DecisionApprovalClassV1;
  state: DecisionPortfolioPreparationStateV1;
  nextGate: DecisionPortfolioPreparationGateV1;
  actionLevel: ActionLevel | null;
  idempotencyKey: string;
  safeNextStep: string;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  dependencyIds: readonly string[];
  unsatisfiedDependencyIds: readonly string[];
  blockers: readonly string[];
  blockingReasons: readonly string[];
  measurementHandoff: {
    successMetric: string;
    evaluationWindow: { start: string; end: string };
  };
  preparationOnly: true;
  executionAuthorized: false;
  externalActionAuthorized: false;
};

export type DecisionPortfolioExecutionCompilerV1 = {
  contractVersion: "DecisionPortfolioExecutionCompilerV1";
  policyVersion: typeof DECISION_PORTFOLIO_EXECUTION_COMPILER_POLICY_V1;
  generatedAt: string;
  sourcePortfolio: {
    portfolioId: string;
    generatedAt: string;
    policyVersion: DecisionPortfolioV1["policyVersion"];
  };
  handoffs: readonly DecisionPortfolioPreparationHandoffV1[];
  summary: {
    selected: number;
    prepared: number;
    keeganApproval: number;
    waitingDependency: number;
    revalidate: number;
    blocked: number;
    duplicateNoop: number;
  };
  authority: {
    persistence: false;
    execution: false;
    externalAction: false;
    approvalBypass: false;
    spend: false;
    pricing: false;
    outreach: false;
    publish: false;
    contractCommitment: false;
    rightsCommitment: false;
  };
};

export class DecisionPortfolioExecutionCompilerError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DecisionPortfolioExecutionCompilerError";
  }
}

function strictIsoTimestamp(value: string, label: string): number {
  if (typeof value !== "string" || !value.trim()) {
    throw new DecisionPortfolioExecutionCompilerError("INVALID_TIMESTAMP", `${label} is required`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new DecisionPortfolioExecutionCompilerError(
      "INVALID_TIMESTAMP",
      `${label} must be a canonical UTC ISO timestamp`
    );
  }
  return parsed.getTime();
}

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new DecisionPortfolioExecutionCompilerError(
      "INVALID_NUMBER",
      `${label} must be a finite non-negative number`
    );
  }
  return value;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  const left = sortedUnique(a);
  const right = sortedUnique(b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validatePortfolioIntegrity(portfolio: DecisionPortfolioV1): DecisionPortfolioItemV1[] {
  if (portfolio.contractVersion !== "DecisionPortfolioV1") {
    throw new DecisionPortfolioExecutionCompilerError(
      "INVALID_PORTFOLIO_CONTRACT",
      "Only DecisionPortfolioV1 may be compiled"
    );
  }
  if (!portfolio.portfolioId?.trim()) {
    throw new DecisionPortfolioExecutionCompilerError("INVALID_PORTFOLIO_ID", "portfolioId is required");
  }

  const ids = portfolio.items.map((item) => item.candidate.id);
  if (new Set(ids).size !== ids.length) {
    throw new DecisionPortfolioExecutionCompilerError(
      "DUPLICATE_CANDIDATE",
      "Portfolio candidate ids must be unique"
    );
  }

  const selectedItems = portfolio.items.filter((item) => item.disposition === "SELECTED");
  const selectedItemIds = selectedItems.map((item) => item.candidate.id);
  if (!sameStrings(selectedItemIds, portfolio.selectedIds)) {
    throw new DecisionPortfolioExecutionCompilerError(
      "SELECTED_ID_MISMATCH",
      "selectedIds must exactly match SELECTED portfolio items"
    );
  }

  return selectedItems;
}

function handoffIdempotencyKey(portfolio: DecisionPortfolioV1, item: DecisionPortfolioItemV1): string {
  const candidate = item.candidate;
  const canonical = JSON.stringify({
    portfolioId: portfolio.portfolioId,
    portfolioPolicyVersion: portfolio.policyVersion,
    candidateId: candidate.id,
    safeNextStep: candidate.safeNextStep,
    successMetric: candidate.successMetric,
    evaluationWindow: candidate.evaluationWindow,
    evidenceRefs: sortedUnique(candidate.evidenceRefs),
    sourceRefs: sortedUnique(candidate.sourceRefs),
    dependencyIds: sortedUnique(candidate.dependencyIds)
  });
  return `decision-prep:${createHash("sha256").update(canonical).digest("hex")}`;
}

function preparedState(input: {
  owner: DecisionOwnerV1;
  approvalClass: DecisionApprovalClassV1;
}): Pick<DecisionPortfolioPreparationHandoffV1, "state" | "nextGate" | "actionLevel"> {
  if (input.approvalClass === "KEEGAN") {
    return {
      state: "PREPARED_FOR_KEEGAN",
      nextGate: "KEEGAN_APPROVAL_REQUIRED",
      actionLevel: "L3_READY_FOR_APPROVAL"
    };
  }
  if (input.approvalClass === "REVIEW") {
    return {
      state: "PREPARED_FOR_REVIEW",
      nextGate: "REVIEW_REQUIRED",
      actionLevel: "L2_DRAFT_PREPARED"
    };
  }
  if (input.owner !== "JEEVES") {
    return {
      state: "PREPARED_FOR_OWNER",
      nextGate: "OWNER_ACTION_REQUIRED",
      actionLevel: "L2_DRAFT_PREPARED"
    };
  }
  return {
    state: "PREPARED_INTERNAL",
    nextGate: "ACTION_RUNTIME_POLICY_EVALUATION",
    actionLevel: "L2_DRAFT_PREPARED"
  };
}

function blockedProjection(input: {
  item: DecisionPortfolioItemV1;
  idempotencyKey: string;
  state: DecisionPortfolioPreparationStateV1;
  nextGate: DecisionPortfolioPreparationGateV1;
  reasons: readonly string[];
  unsatisfiedDependencyIds?: readonly string[];
}): DecisionPortfolioPreparationHandoffV1 {
  const candidate = input.item.candidate;
  return {
    candidateId: candidate.id,
    title: candidate.title,
    owner: candidate.owner,
    approvalClass: candidate.approvalClass,
    state: input.state,
    nextGate: input.nextGate,
    actionLevel: null,
    idempotencyKey: input.idempotencyKey,
    safeNextStep: candidate.safeNextStep,
    evidenceRefs: sortedUnique(candidate.evidenceRefs),
    sourceRefs: sortedUnique(candidate.sourceRefs),
    dependencyIds: sortedUnique(candidate.dependencyIds),
    unsatisfiedDependencyIds: sortedUnique(input.unsatisfiedDependencyIds ?? []),
    blockers: sortedUnique(candidate.blockers),
    blockingReasons: sortedUnique(input.reasons),
    measurementHandoff: {
      successMetric: candidate.successMetric,
      evaluationWindow: structuredClone(candidate.evaluationWindow)
    },
    preparationOnly: true,
    executionAuthorized: false,
    externalActionAuthorized: false
  };
}

export function compileDecisionPortfolioExecutionV1(input: {
  portfolio: DecisionPortfolioV1;
  generatedAt: string;
  maxPortfolioAgeMs: number;
  satisfiedDependencyIds?: readonly string[];
  previousIdempotencyKeys?: readonly string[];
}): DecisionPortfolioExecutionCompilerV1 {
  const generatedAtMs = strictIsoTimestamp(input.generatedAt, "generatedAt");
  const portfolioGeneratedAtMs = strictIsoTimestamp(input.portfolio.generatedAt, "portfolio.generatedAt");
  if (portfolioGeneratedAtMs > generatedAtMs) {
    throw new DecisionPortfolioExecutionCompilerError(
      "FUTURE_PORTFOLIO",
      "A future-dated portfolio cannot authorize preparation"
    );
  }

  const maxPortfolioAgeMs = finiteNonNegative(input.maxPortfolioAgeMs, "maxPortfolioAgeMs");
  const selectedItems = validatePortfolioIntegrity(input.portfolio);
  const satisfiedDependencyIds = new Set(input.satisfiedDependencyIds ?? []);
  const previousIdempotencyKeys = new Set(input.previousIdempotencyKeys ?? []);
  const portfolioIsStale = generatedAtMs - portfolioGeneratedAtMs > maxPortfolioAgeMs;

  const handoffs = selectedItems
    .map((item): DecisionPortfolioPreparationHandoffV1 => {
      const candidate = item.candidate;
      const idempotencyKey = handoffIdempotencyKey(input.portfolio, item);

      if (previousIdempotencyKeys.has(idempotencyKey)) {
        return blockedProjection({
          item,
          idempotencyKey,
          state: "DUPLICATE_NOOP",
          nextGate: "NO_ACTION",
          reasons: ["This exact portfolio/candidate/evidence handoff was already compiled"]
        });
      }

      const evidenceReasons: string[] = [];
      if (portfolioIsStale) evidenceReasons.push("Portfolio freshness exceeded the caller-supplied maximum age");
      if (candidate.evidenceState !== "KNOWN") {
        evidenceReasons.push(`Candidate evidence state is ${candidate.evidenceState}, not KNOWN`);
      }
      if (candidate.evidenceRefs.length === 0) evidenceReasons.push("Candidate has no evidence refs");
      if (candidate.sourceRefs.length === 0) evidenceReasons.push("Candidate has no source refs");

      const windowStart = Date.parse(candidate.evaluationWindow.start);
      const windowEnd = Date.parse(candidate.evaluationWindow.end);
      if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd < windowStart) {
        evidenceReasons.push("Candidate evaluation window is invalid");
      }

      if (evidenceReasons.length > 0) {
        return blockedProjection({
          item,
          idempotencyKey,
          state: "REVALIDATE",
          nextGate: "EVIDENCE_REVALIDATION_REQUIRED",
          reasons: evidenceReasons
        });
      }

      if (candidate.blockers.length > 0) {
        return blockedProjection({
          item,
          idempotencyKey,
          state: "BLOCKED",
          nextGate: "BLOCKER_RESOLUTION_REQUIRED",
          reasons: candidate.blockers
        });
      }

      const unsatisfiedDependencyIds = sortedUnique(
        candidate.dependencyIds.filter((dependencyId) => !satisfiedDependencyIds.has(dependencyId))
      );
      if (unsatisfiedDependencyIds.length > 0) {
        return blockedProjection({
          item,
          idempotencyKey,
          state: "WAITING_DEPENDENCY",
          nextGate: "DEPENDENCY_REQUIRED",
          reasons: unsatisfiedDependencyIds.map((dependencyId) => `Dependency not satisfied: ${dependencyId}`),
          unsatisfiedDependencyIds
        });
      }

      const prepared = preparedState({ owner: candidate.owner, approvalClass: candidate.approvalClass });
      return {
        candidateId: candidate.id,
        title: candidate.title,
        owner: candidate.owner,
        approvalClass: candidate.approvalClass,
        ...prepared,
        idempotencyKey,
        safeNextStep: candidate.safeNextStep,
        evidenceRefs: sortedUnique(candidate.evidenceRefs),
        sourceRefs: sortedUnique(candidate.sourceRefs),
        dependencyIds: sortedUnique(candidate.dependencyIds),
        unsatisfiedDependencyIds: [],
        blockers: [],
        blockingReasons: [],
        measurementHandoff: {
          successMetric: candidate.successMetric,
          evaluationWindow: structuredClone(candidate.evaluationWindow)
        },
        preparationOnly: true,
        executionAuthorized: false,
        externalActionAuthorized: false
      };
    })
    .sort((a, b) => a.candidateId.localeCompare(b.candidateId));

  const preparedStates = new Set<DecisionPortfolioPreparationStateV1>([
    "PREPARED_INTERNAL",
    "PREPARED_FOR_REVIEW",
    "PREPARED_FOR_KEEGAN",
    "PREPARED_FOR_OWNER"
  ]);

  return {
    contractVersion: "DecisionPortfolioExecutionCompilerV1",
    policyVersion: DECISION_PORTFOLIO_EXECUTION_COMPILER_POLICY_V1,
    generatedAt: input.generatedAt,
    sourcePortfolio: {
      portfolioId: input.portfolio.portfolioId,
      generatedAt: input.portfolio.generatedAt,
      policyVersion: input.portfolio.policyVersion
    },
    handoffs,
    summary: {
      selected: selectedItems.length,
      prepared: handoffs.filter((handoff) => preparedStates.has(handoff.state)).length,
      keeganApproval: handoffs.filter((handoff) => handoff.state === "PREPARED_FOR_KEEGAN").length,
      waitingDependency: handoffs.filter((handoff) => handoff.state === "WAITING_DEPENDENCY").length,
      revalidate: handoffs.filter((handoff) => handoff.state === "REVALIDATE").length,
      blocked: handoffs.filter((handoff) => handoff.state === "BLOCKED").length,
      duplicateNoop: handoffs.filter((handoff) => handoff.state === "DUPLICATE_NOOP").length
    },
    authority: {
      persistence: false,
      execution: false,
      externalAction: false,
      approvalBypass: false,
      spend: false,
      pricing: false,
      outreach: false,
      publish: false,
      contractCommitment: false,
      rightsCommitment: false
    }
  };
}
