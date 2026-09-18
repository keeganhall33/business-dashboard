import type {
  DecisionPortfolioItemV1,
  DecisionPortfolioV1
} from "@/lib/strategy-engine/decision-portfolio-v1";
import type {
  DecisionPortfolioExecutionCompilerV1,
  DecisionPortfolioPreparationHandoffV1
} from "@/lib/strategy-engine/decision-portfolio-execution-compiler-v1";

export const CHIEF_OF_STAFF_PORTFOLIO_BRIEF_POLICY_V1 =
  "chief_of_staff_portfolio_brief_v1.0.0" as const;

export type ChiefOfStaffPortfolioActionV1 = {
  candidateId: string;
  title: string;
  rank: number;
  candidateType: DecisionPortfolioItemV1["candidate"]["candidateType"];
  owner: DecisionPortfolioItemV1["candidate"]["owner"];
  approvalClass: DecisionPortfolioItemV1["candidate"]["approvalClass"];
  safeNextStep: string;
  rationale: string;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  measurement: {
    successMetric: string;
    evaluationWindow: { start: string; end: string };
  };
};

export type ChiefOfStaffPortfolioBlockedWorkV1 = ChiefOfStaffPortfolioActionV1 & {
  state: Extract<
    DecisionPortfolioPreparationHandoffV1["state"],
    "WAITING_DEPENDENCY" | "REVALIDATE" | "BLOCKED"
  >;
  nextGate: DecisionPortfolioPreparationHandoffV1["nextGate"];
  blockers: readonly string[];
  blockingReasons: readonly string[];
  unsatisfiedDependencyIds: readonly string[];
};

export type ChiefOfStaffPortfolioTradeoffV1 = {
  candidateId: string;
  title: string;
  rank: number;
  disposition: Extract<DecisionPortfolioItemV1["disposition"], "DEFERRED" | "REJECTED">;
  rationale: string;
  exclusionReason: string | null;
  displacedBy: readonly string[];
  evidenceState: DecisionPortfolioItemV1["candidate"]["evidenceState"];
  safeNextStep: string;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
};

export type ChiefOfStaffPortfolioInformationGainV1 = {
  candidateId: string;
  title: string;
  rank: number;
  informationGainAction: string;
  rationale: string;
  evidenceState: DecisionPortfolioItemV1["candidate"]["evidenceState"];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
};

export type ChiefOfStaffPortfolioBriefV1 = {
  contractVersion: "ChiefOfStaffPortfolioBriefV1";
  policyVersion: typeof CHIEF_OF_STAFF_PORTFOLIO_BRIEF_POLICY_V1;
  generatedAt: string;
  sourceAgeMs: number;
  sourcePortfolio: {
    portfolioId: string;
    generatedAt: string;
    policyVersion: DecisionPortfolioV1["policyVersion"];
  };
  sourceExecution: {
    generatedAt: string;
    policyVersion: DecisionPortfolioExecutionCompilerV1["policyVersion"];
  };
  overview: {
    selected: number;
    decisionsForKeegan: number;
    jeevesPreparationReady: number;
    internalReviewReady: number;
    ownerActionReady: number;
    blockedOrRevalidate: number;
    duplicateNoops: number;
    informationGain: number;
    deferred: number;
    rejected: number;
    remainingCapacity: DecisionPortfolioV1["remainingCapacity"];
  };
  decisionsForKeegan: readonly ChiefOfStaffPortfolioActionV1[];
  jeevesPreparationReady: readonly ChiefOfStaffPortfolioActionV1[];
  internalReviewReady: readonly ChiefOfStaffPortfolioActionV1[];
  ownerActionReady: readonly ChiefOfStaffPortfolioActionV1[];
  blockedWork: readonly ChiefOfStaffPortfolioBlockedWorkV1[];
  informationGain: readonly ChiefOfStaffPortfolioInformationGainV1[];
  tradeoffs: readonly ChiefOfStaffPortfolioTradeoffV1[];
  duplicateNoopCandidateIds: readonly string[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  authority: {
    synthesisOnly: true;
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

export class ChiefOfStaffPortfolioBriefError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ChiefOfStaffPortfolioBriefError";
  }
}

function strictIsoTimestamp(value: string, label: string): number {
  if (typeof value !== "string" || !value.trim()) {
    throw new ChiefOfStaffPortfolioBriefError("INVALID_TIMESTAMP", `${label} is required`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ChiefOfStaffPortfolioBriefError(
      "INVALID_TIMESTAMP",
      `${label} must be a canonical UTC ISO timestamp`
    );
  }
  return parsed.getTime();
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ChiefOfStaffPortfolioBriefError(
      "INVALID_FRESHNESS_POLICY",
      `${label} must be a positive finite number`
    );
  }
  return value;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  const a = sortedUnique(left);
  const b = sortedUnique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function selectedItems(portfolio: DecisionPortfolioV1): DecisionPortfolioItemV1[] {
  if (portfolio.contractVersion !== "DecisionPortfolioV1") {
    throw new ChiefOfStaffPortfolioBriefError(
      "INVALID_PORTFOLIO_CONTRACT",
      "Only DecisionPortfolioV1 may feed the chief-of-staff brief"
    );
  }
  const ids = portfolio.items.map((item) => item.candidate.id);
  if (new Set(ids).size !== ids.length) {
    throw new ChiefOfStaffPortfolioBriefError(
      "DUPLICATE_PORTFOLIO_CANDIDATE",
      "Portfolio candidate ids must be unique"
    );
  }
  const selected = portfolio.items.filter((item) => item.disposition === "SELECTED");
  if (!sameStrings(selected.map((item) => item.candidate.id), portfolio.selectedIds)) {
    throw new ChiefOfStaffPortfolioBriefError(
      "SELECTED_ID_MISMATCH",
      "selectedIds must exactly match SELECTED portfolio items"
    );
  }
  return selected;
}

function expectedExecutionSummary(
  handoffs: readonly DecisionPortfolioPreparationHandoffV1[]
): DecisionPortfolioExecutionCompilerV1["summary"] {
  const preparedStates = new Set<DecisionPortfolioPreparationHandoffV1["state"]>([
    "PREPARED_INTERNAL",
    "PREPARED_FOR_REVIEW",
    "PREPARED_FOR_KEEGAN",
    "PREPARED_FOR_OWNER"
  ]);
  return {
    selected: handoffs.length,
    prepared: handoffs.filter((item) => preparedStates.has(item.state)).length,
    keeganApproval: handoffs.filter((item) => item.state === "PREPARED_FOR_KEEGAN").length,
    waitingDependency: handoffs.filter((item) => item.state === "WAITING_DEPENDENCY").length,
    revalidate: handoffs.filter((item) => item.state === "REVALIDATE").length,
    blocked: handoffs.filter((item) => item.state === "BLOCKED").length,
    duplicateNoop: handoffs.filter((item) => item.state === "DUPLICATE_NOOP").length
  };
}

function sameSummary(
  left: DecisionPortfolioExecutionCompilerV1["summary"],
  right: DecisionPortfolioExecutionCompilerV1["summary"]
): boolean {
  return (
    left.selected === right.selected &&
    left.prepared === right.prepared &&
    left.keeganApproval === right.keeganApproval &&
    left.waitingDependency === right.waitingDependency &&
    left.revalidate === right.revalidate &&
    left.blocked === right.blocked &&
    left.duplicateNoop === right.duplicateNoop
  );
}

function assertSourceIntegrity(input: {
  portfolio: DecisionPortfolioV1;
  execution: DecisionPortfolioExecutionCompilerV1;
  selected: readonly DecisionPortfolioItemV1[];
}): Map<string, DecisionPortfolioItemV1> {
  const { portfolio, execution, selected } = input;
  if (execution.contractVersion !== "DecisionPortfolioExecutionCompilerV1") {
    throw new ChiefOfStaffPortfolioBriefError(
      "INVALID_EXECUTION_CONTRACT",
      "Only DecisionPortfolioExecutionCompilerV1 may feed the chief-of-staff brief"
    );
  }
  if (
    execution.sourcePortfolio.portfolioId !== portfolio.portfolioId ||
    execution.sourcePortfolio.generatedAt !== portfolio.generatedAt ||
    execution.sourcePortfolio.policyVersion !== portfolio.policyVersion
  ) {
    throw new ChiefOfStaffPortfolioBriefError(
      "SOURCE_PORTFOLIO_MISMATCH",
      "Execution evidence must bind to the exact source portfolio"
    );
  }
  if (Object.values(execution.authority).some((value) => value !== false)) {
    throw new ChiefOfStaffPortfolioBriefError(
      "WIDENED_EXECUTION_AUTHORITY",
      "Chief-of-staff synthesis refuses execution evidence with widened authority"
    );
  }
  const handoffIds = execution.handoffs.map((item) => item.candidateId);
  if (new Set(handoffIds).size !== handoffIds.length) {
    throw new ChiefOfStaffPortfolioBriefError(
      "DUPLICATE_EXECUTION_HANDOFF",
      "Execution handoff candidate ids must be unique"
    );
  }
  if (!sameStrings(handoffIds, selected.map((item) => item.candidate.id))) {
    throw new ChiefOfStaffPortfolioBriefError(
      "HANDOFF_COVERAGE_MISMATCH",
      "Execution handoffs must cover the exact selected portfolio set"
    );
  }
  if (!sameSummary(execution.summary, expectedExecutionSummary(execution.handoffs))) {
    throw new ChiefOfStaffPortfolioBriefError(
      "EXECUTION_SUMMARY_MISMATCH",
      "Execution summary does not reconcile to handoff truth"
    );
  }

  const selectedById = new Map(selected.map((item) => [item.candidate.id, item]));
  const idempotencyKeys = execution.handoffs.map((item) => item.idempotencyKey);
  if (new Set(idempotencyKeys).size !== idempotencyKeys.length) {
    throw new ChiefOfStaffPortfolioBriefError(
      "DUPLICATE_IDEMPOTENCY_KEY",
      "Execution handoffs must have unique idempotency keys"
    );
  }

  for (const handoff of execution.handoffs) {
    const item = selectedById.get(handoff.candidateId);
    if (!item) {
      throw new ChiefOfStaffPortfolioBriefError(
        "ORPHAN_EXECUTION_HANDOFF",
        `No selected portfolio item exists for ${handoff.candidateId}`
      );
    }
    const candidate = item.candidate;
    if (
      handoff.title !== candidate.title ||
      handoff.owner !== candidate.owner ||
      handoff.approvalClass !== candidate.approvalClass ||
      handoff.safeNextStep !== candidate.safeNextStep ||
      !sameStrings(handoff.evidenceRefs, candidate.evidenceRefs) ||
      !sameStrings(handoff.sourceRefs, candidate.sourceRefs) ||
      !sameStrings(handoff.dependencyIds, candidate.dependencyIds) ||
      !sameStrings(handoff.blockers, candidate.blockers) ||
      handoff.measurementHandoff.successMetric !== candidate.successMetric ||
      handoff.measurementHandoff.evaluationWindow.start !== candidate.evaluationWindow.start ||
      handoff.measurementHandoff.evaluationWindow.end !== candidate.evaluationWindow.end
    ) {
      throw new ChiefOfStaffPortfolioBriefError(
        "HANDOFF_TRUTH_MISMATCH",
        `Execution handoff truth diverges from portfolio candidate ${candidate.id}`
      );
    }
    if (
      handoff.preparationOnly !== true ||
      handoff.executionAuthorized !== false ||
      handoff.externalActionAuthorized !== false
    ) {
      throw new ChiefOfStaffPortfolioBriefError(
        "WIDENED_HANDOFF_AUTHORITY",
        `Execution handoff ${candidate.id} widened beyond preparation-only authority`
      );
    }
  }
  return selectedById;
}

function actionFrom(
  item: DecisionPortfolioItemV1,
  handoff: DecisionPortfolioPreparationHandoffV1
): ChiefOfStaffPortfolioActionV1 {
  return {
    candidateId: item.candidate.id,
    title: item.candidate.title,
    rank: item.rank,
    candidateType: item.candidate.candidateType,
    owner: item.candidate.owner,
    approvalClass: item.candidate.approvalClass,
    safeNextStep: handoff.safeNextStep,
    rationale: item.rationale,
    evidenceRefs: sortedUnique(handoff.evidenceRefs),
    sourceRefs: sortedUnique(handoff.sourceRefs),
    measurement: {
      successMetric: handoff.measurementHandoff.successMetric,
      evaluationWindow: structuredClone(handoff.measurementHandoff.evaluationWindow)
    }
  };
}

function byRankThenId<T extends { rank: number; candidateId: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.rank - b.rank || a.candidateId.localeCompare(b.candidateId));
}

export function buildChiefOfStaffPortfolioBriefV1(input: {
  portfolio: DecisionPortfolioV1;
  execution: DecisionPortfolioExecutionCompilerV1;
  generatedAt: string;
  maxExecutionAgeMs: number;
}): ChiefOfStaffPortfolioBriefV1 {
  const generatedAtMs = strictIsoTimestamp(input.generatedAt, "generatedAt");
  strictIsoTimestamp(input.portfolio.generatedAt, "portfolio.generatedAt");
  const executionGeneratedAtMs = strictIsoTimestamp(input.execution.generatedAt, "execution.generatedAt");
  const maxExecutionAgeMs = positiveFinite(input.maxExecutionAgeMs, "maxExecutionAgeMs");
  if (executionGeneratedAtMs > generatedAtMs) {
    throw new ChiefOfStaffPortfolioBriefError(
      "FUTURE_EXECUTION",
      "Future-dated execution evidence cannot feed a current brief"
    );
  }
  const sourceAgeMs = generatedAtMs - executionGeneratedAtMs;
  if (sourceAgeMs > maxExecutionAgeMs) {
    throw new ChiefOfStaffPortfolioBriefError(
      "STALE_EXECUTION",
      "Execution evidence is older than the caller-owned freshness policy"
    );
  }

  const selected = selectedItems(input.portfolio);
  const selectedById = assertSourceIntegrity({
    portfolio: input.portfolio,
    execution: input.execution,
    selected
  });

  const decisionsForKeegan: ChiefOfStaffPortfolioActionV1[] = [];
  const jeevesPreparationReady: ChiefOfStaffPortfolioActionV1[] = [];
  const internalReviewReady: ChiefOfStaffPortfolioActionV1[] = [];
  const ownerActionReady: ChiefOfStaffPortfolioActionV1[] = [];
  const blockedWork: ChiefOfStaffPortfolioBlockedWorkV1[] = [];
  const duplicateNoopCandidateIds: string[] = [];

  for (const handoff of input.execution.handoffs) {
    const item = selectedById.get(handoff.candidateId)!;
    const action = actionFrom(item, handoff);
    if (handoff.state === "PREPARED_FOR_KEEGAN") {
      decisionsForKeegan.push(action);
    } else if (handoff.state === "PREPARED_INTERNAL") {
      jeevesPreparationReady.push(action);
    } else if (handoff.state === "PREPARED_FOR_REVIEW") {
      internalReviewReady.push(action);
    } else if (handoff.state === "PREPARED_FOR_OWNER") {
      ownerActionReady.push(action);
    } else if (
      handoff.state === "WAITING_DEPENDENCY" ||
      handoff.state === "REVALIDATE" ||
      handoff.state === "BLOCKED"
    ) {
      blockedWork.push({
        ...action,
        state: handoff.state,
        nextGate: handoff.nextGate,
        blockers: sortedUnique(handoff.blockers),
        blockingReasons: sortedUnique(handoff.blockingReasons),
        unsatisfiedDependencyIds: sortedUnique(handoff.unsatisfiedDependencyIds)
      });
    } else if (handoff.state === "DUPLICATE_NOOP") {
      duplicateNoopCandidateIds.push(handoff.candidateId);
    }
  }

  const informationGain = byRankThenId(
    input.portfolio.items
      .filter((item) => item.disposition === "INFORMATION_GAIN")
      .map((item): ChiefOfStaffPortfolioInformationGainV1 => {
        if (!item.candidate.informationGainAction?.trim()) {
          throw new ChiefOfStaffPortfolioBriefError(
            "MISSING_INFORMATION_GAIN_ACTION",
            `Information-gain item ${item.candidate.id} requires an explicit informationGainAction`
          );
        }
        return {
          candidateId: item.candidate.id,
          title: item.candidate.title,
          rank: item.rank,
          informationGainAction: item.candidate.informationGainAction,
          rationale: item.rationale,
          evidenceState: item.candidate.evidenceState,
          evidenceRefs: sortedUnique(item.candidate.evidenceRefs),
          sourceRefs: sortedUnique(item.candidate.sourceRefs)
        };
      })
  );

  const tradeoffs = byRankThenId(
    input.portfolio.items
      .filter(
        (item): item is DecisionPortfolioItemV1 & {
          disposition: "DEFERRED" | "REJECTED";
        } => item.disposition === "DEFERRED" || item.disposition === "REJECTED"
      )
      .map((item): ChiefOfStaffPortfolioTradeoffV1 => ({
        candidateId: item.candidate.id,
        title: item.candidate.title,
        rank: item.rank,
        disposition: item.disposition,
        rationale: item.rationale,
        exclusionReason: item.exclusionReason,
        displacedBy: sortedUnique(item.displacedBy),
        evidenceState: item.candidate.evidenceState,
        safeNextStep: item.candidate.safeNextStep,
        evidenceRefs: sortedUnique(item.candidate.evidenceRefs),
        sourceRefs: sortedUnique(item.candidate.sourceRefs)
      }))
  );

  const allEvidenceRefs = sortedUnique([
    ...input.portfolio.evidenceRefs,
    ...input.execution.handoffs.flatMap((item) => item.evidenceRefs)
  ]);
  const allSourceRefs = sortedUnique([
    ...input.portfolio.sourceRefs,
    ...input.execution.handoffs.flatMap((item) => item.sourceRefs)
  ]);

  const brief: ChiefOfStaffPortfolioBriefV1 = {
    contractVersion: "ChiefOfStaffPortfolioBriefV1",
    policyVersion: CHIEF_OF_STAFF_PORTFOLIO_BRIEF_POLICY_V1,
    generatedAt: input.generatedAt,
    sourceAgeMs,
    sourcePortfolio: {
      portfolioId: input.portfolio.portfolioId,
      generatedAt: input.portfolio.generatedAt,
      policyVersion: input.portfolio.policyVersion
    },
    sourceExecution: {
      generatedAt: input.execution.generatedAt,
      policyVersion: input.execution.policyVersion
    },
    overview: {
      selected: selected.length,
      decisionsForKeegan: decisionsForKeegan.length,
      jeevesPreparationReady: jeevesPreparationReady.length,
      internalReviewReady: internalReviewReady.length,
      ownerActionReady: ownerActionReady.length,
      blockedOrRevalidate: blockedWork.length,
      duplicateNoops: duplicateNoopCandidateIds.length,
      informationGain: informationGain.length,
      deferred: tradeoffs.filter((item) => item.disposition === "DEFERRED").length,
      rejected: tradeoffs.filter((item) => item.disposition === "REJECTED").length,
      remainingCapacity: structuredClone(input.portfolio.remainingCapacity)
    },
    decisionsForKeegan: byRankThenId(decisionsForKeegan),
    jeevesPreparationReady: byRankThenId(jeevesPreparationReady),
    internalReviewReady: byRankThenId(internalReviewReady),
    ownerActionReady: byRankThenId(ownerActionReady),
    blockedWork: byRankThenId(blockedWork),
    informationGain,
    tradeoffs,
    duplicateNoopCandidateIds: sortedUnique(duplicateNoopCandidateIds),
    evidenceRefs: allEvidenceRefs,
    sourceRefs: allSourceRefs,
    authority: {
      synthesisOnly: true,
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
  return deepFreeze(brief);
}
