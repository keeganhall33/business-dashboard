import { createHash } from "node:crypto";

import type {
  DecisionApprovalClassV1,
  DecisionDispositionV1,
  DecisionEvidenceStateV1,
  DecisionOwnerV1,
  DecisionPortfolioV1
} from "./decision-portfolio-v1";

export const DECISION_PORTFOLIO_CHANGE_CONTRACT_VERSION_V1 = "DecisionPortfolioChangeV1" as const;
export const DECISION_PORTFOLIO_CHANGE_POLICY_VERSION_V1 = "decision_portfolio_change_policy_v1.0.0" as const;

export type DecisionPortfolioChangeKindV1 =
  | "ADDED"
  | "REMOVED"
  | "DISPOSITION_CHANGED"
  | "RANK_CHANGED"
  | "RATIONALE_CHANGED"
  | "EXCLUSION_REASON_CHANGED"
  | "OWNER_CHANGED"
  | "APPROVAL_CLASS_CHANGED"
  | "EVIDENCE_STATE_CHANGED";

export type DecisionPortfolioItemSnapshotV1 = {
  disposition: DecisionDispositionV1;
  rank: number;
  owner: DecisionOwnerV1;
  approvalClass: DecisionApprovalClassV1;
  evidenceState: DecisionEvidenceStateV1;
  rationale: string;
  exclusionReason: string | null;
};

export type DecisionPortfolioCandidateChangeV1 = {
  candidateId: string;
  changeKinds: readonly DecisionPortfolioChangeKindV1[];
  previous: DecisionPortfolioItemSnapshotV1 | null;
  current: DecisionPortfolioItemSnapshotV1 | null;
  causeAttribution: "NOT_ESTABLISHED";
};

export type DecisionPortfolioOwnerQueueChangeV1 = {
  owner: DecisionOwnerV1;
  addedCandidateIds: readonly string[];
  removedCandidateIds: readonly string[];
};

export type DecisionPortfolioCapacityDeltaV1 = {
  keeganHours: number;
  ioanaHours: number;
  jeevesHours: number;
  cashCents: number;
};

export type DecisionPortfolioChangeV1 = {
  contractVersion: typeof DECISION_PORTFOLIO_CHANGE_CONTRACT_VERSION_V1;
  policyVersion: typeof DECISION_PORTFOLIO_CHANGE_POLICY_VERSION_V1;
  changeId: string;
  comparedAt: string;
  previousPortfolioId: string;
  currentPortfolioId: string;
  status: "NO_CHANGE" | "PORTFOLIO_DETAIL_CHANGE" | "SELECTION_CHANGE";
  selectedAddedIds: readonly string[];
  selectedRemovedIds: readonly string[];
  newKeeganDecisionIds: readonly string[];
  clearedKeeganDecisionIds: readonly string[];
  candidateChanges: readonly DecisionPortfolioCandidateChangeV1[];
  ownerQueueChanges: readonly DecisionPortfolioOwnerQueueChangeV1[];
  usedCapacityDelta: DecisionPortfolioCapacityDeltaV1;
  remainingCapacityDelta: DecisionPortfolioCapacityDeltaV1;
  evidenceRefsAdded: readonly string[];
  evidenceRefsRemoved: readonly string[];
  sourceRefsAdded: readonly string[];
  sourceRefsRemoved: readonly string[];
  attribution: {
    selectionCause: "NOT_ESTABLISHED";
    rankCause: "NOT_ESTABLISHED";
    outcomeCause: "NOT_ESTABLISHED";
  };
  authority: {
    portfolioMutation: false;
    allocationMutation: false;
    externalAction: false;
    approvalBypass: false;
  };
};

export class DecisionPortfolioChangeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DecisionPortfolioChangeError";
  }
}

function timestamp(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new DecisionPortfolioChangeError("INVALID_TIMESTAMP", `${label} must be an ISO-compatible timestamp`);
  }
  return value.trim();
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function difference(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right);
  return sortedUnique(left.filter((value) => !rightSet.has(value)));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
  );
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function snapshot(item: DecisionPortfolioV1["items"][number]): DecisionPortfolioItemSnapshotV1 {
  return {
    disposition: item.disposition,
    rank: item.rank,
    owner: item.candidate.owner,
    approvalClass: item.candidate.approvalClass,
    evidenceState: item.candidate.evidenceState,
    rationale: item.rationale,
    exclusionReason: item.exclusionReason
  };
}

function capacityDelta(
  previous: { keeganHours: number; ioanaHours: number; jeevesHours: number; cashCents: number },
  current: { keeganHours: number; ioanaHours: number; jeevesHours: number; cashCents: number }
): DecisionPortfolioCapacityDeltaV1 {
  return {
    keeganHours: current.keeganHours - previous.keeganHours,
    ioanaHours: current.ioanaHours - previous.ioanaHours,
    jeevesHours: current.jeevesHours - previous.jeevesHours,
    cashCents: current.cashCents - previous.cashCents
  };
}

function candidateChanges(
  previous: DecisionPortfolioV1,
  current: DecisionPortfolioV1
): DecisionPortfolioCandidateChangeV1[] {
  const previousById = new Map(previous.items.map((item) => [item.candidate.id, item]));
  const currentById = new Map(current.items.map((item) => [item.candidate.id, item]));
  const candidateIds = sortedUnique([...previousById.keys(), ...currentById.keys()]);

  return candidateIds.flatMap((candidateId) => {
    const previousItem = previousById.get(candidateId);
    const currentItem = currentById.get(candidateId);
    const previousSnapshot = previousItem ? snapshot(previousItem) : null;
    const currentSnapshot = currentItem ? snapshot(currentItem) : null;
    const changeKinds: DecisionPortfolioChangeKindV1[] = [];

    if (!previousItem && currentItem) changeKinds.push("ADDED");
    if (previousItem && !currentItem) changeKinds.push("REMOVED");
    if (previousSnapshot && currentSnapshot) {
      if (previousSnapshot.disposition !== currentSnapshot.disposition) changeKinds.push("DISPOSITION_CHANGED");
      if (previousSnapshot.rank !== currentSnapshot.rank) changeKinds.push("RANK_CHANGED");
      if (previousSnapshot.rationale !== currentSnapshot.rationale) changeKinds.push("RATIONALE_CHANGED");
      if (previousSnapshot.exclusionReason !== currentSnapshot.exclusionReason) changeKinds.push("EXCLUSION_REASON_CHANGED");
      if (previousSnapshot.owner !== currentSnapshot.owner) changeKinds.push("OWNER_CHANGED");
      if (previousSnapshot.approvalClass !== currentSnapshot.approvalClass) changeKinds.push("APPROVAL_CLASS_CHANGED");
      if (previousSnapshot.evidenceState !== currentSnapshot.evidenceState) changeKinds.push("EVIDENCE_STATE_CHANGED");
    }

    if (changeKinds.length === 0) return [];
    return [{
      candidateId,
      changeKinds: [...changeKinds].sort((a, b) => a.localeCompare(b)),
      previous: previousSnapshot,
      current: currentSnapshot,
      causeAttribution: "NOT_ESTABLISHED" as const
    }];
  });
}

function ownerQueueChanges(
  previous: DecisionPortfolioV1,
  current: DecisionPortfolioV1
): DecisionPortfolioOwnerQueueChangeV1[] {
  return (["KEEGAN", "IOANA", "JEEVES"] as const).map((owner) => ({
    owner,
    addedCandidateIds: difference(current.ownerQueues[owner], previous.ownerQueues[owner]),
    removedCandidateIds: difference(previous.ownerQueues[owner], current.ownerQueues[owner])
  }));
}

export function compareDecisionPortfoliosV1(input: {
  previous: DecisionPortfolioV1;
  current: DecisionPortfolioV1;
  comparedAt: string;
}): Readonly<DecisionPortfolioChangeV1> {
  if (input.previous.contractVersion !== "DecisionPortfolioV1" || input.current.contractVersion !== "DecisionPortfolioV1") {
    throw new DecisionPortfolioChangeError("INVALID_PORTFOLIO", "both inputs must be DecisionPortfolioV1 projections");
  }

  const comparedAt = timestamp(input.comparedAt, "comparedAt");
  const previousGeneratedAt = timestamp(input.previous.generatedAt, "previous.generatedAt");
  const currentGeneratedAt = timestamp(input.current.generatedAt, "current.generatedAt");
  if (Date.parse(currentGeneratedAt) < Date.parse(previousGeneratedAt)) {
    throw new DecisionPortfolioChangeError("NON_MONOTONIC_PORTFOLIO", "current portfolio predates previous portfolio");
  }
  if (Date.parse(comparedAt) < Date.parse(currentGeneratedAt)) {
    throw new DecisionPortfolioChangeError("FUTURE_PORTFOLIO", "comparison time predates current portfolio");
  }

  const selectedAddedIds = difference(input.current.selectedIds, input.previous.selectedIds);
  const selectedRemovedIds = difference(input.previous.selectedIds, input.current.selectedIds);
  const newKeeganDecisionIds = difference(input.current.keeganDecisionIds, input.previous.keeganDecisionIds);
  const clearedKeeganDecisionIds = difference(input.previous.keeganDecisionIds, input.current.keeganDecisionIds);
  const changes = candidateChanges(input.previous, input.current);
  const queues = ownerQueueChanges(input.previous, input.current);
  const evidenceRefsAdded = difference(input.current.evidenceRefs, input.previous.evidenceRefs);
  const evidenceRefsRemoved = difference(input.previous.evidenceRefs, input.current.evidenceRefs);
  const sourceRefsAdded = difference(input.current.sourceRefs, input.previous.sourceRefs);
  const sourceRefsRemoved = difference(input.previous.sourceRefs, input.current.sourceRefs);
  const usedCapacityDelta = capacityDelta(input.previous.usedCapacity, input.current.usedCapacity);
  const remainingCapacityDelta = capacityDelta(input.previous.remainingCapacity, input.current.remainingCapacity);

  const hasSelectionChange = selectedAddedIds.length > 0 || selectedRemovedIds.length > 0;
  const hasQueueChange = queues.some((queue) => queue.addedCandidateIds.length > 0 || queue.removedCandidateIds.length > 0);
  const hasCapacityChange = Object.values(usedCapacityDelta).some((value) => value !== 0) ||
    Object.values(remainingCapacityDelta).some((value) => value !== 0);
  const hasReferenceChange = evidenceRefsAdded.length > 0 || evidenceRefsRemoved.length > 0 ||
    sourceRefsAdded.length > 0 || sourceRefsRemoved.length > 0;
  const hasDetailChange = changes.length > 0 || hasQueueChange || hasCapacityChange || hasReferenceChange ||
    newKeeganDecisionIds.length > 0 || clearedKeeganDecisionIds.length > 0;
  const status = hasSelectionChange
    ? "SELECTION_CHANGE" as const
    : hasDetailChange
      ? "PORTFOLIO_DETAIL_CHANGE" as const
      : "NO_CHANGE" as const;

  const identity = canonical({
    policyVersion: DECISION_PORTFOLIO_CHANGE_POLICY_VERSION_V1,
    previousPortfolioId: input.previous.portfolioId,
    currentPortfolioId: input.current.portfolioId,
    comparedAt,
    status,
    selectedAddedIds,
    selectedRemovedIds,
    newKeeganDecisionIds,
    clearedKeeganDecisionIds,
    candidateChanges: changes,
    ownerQueueChanges: queues,
    usedCapacityDelta,
    remainingCapacityDelta,
    evidenceRefsAdded,
    evidenceRefsRemoved,
    sourceRefsAdded,
    sourceRefsRemoved
  });
  const changeId = `portfolio-change:${createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 24)}`;

  return freeze({
    contractVersion: DECISION_PORTFOLIO_CHANGE_CONTRACT_VERSION_V1,
    policyVersion: DECISION_PORTFOLIO_CHANGE_POLICY_VERSION_V1,
    changeId,
    comparedAt,
    previousPortfolioId: input.previous.portfolioId,
    currentPortfolioId: input.current.portfolioId,
    status,
    selectedAddedIds,
    selectedRemovedIds,
    newKeeganDecisionIds,
    clearedKeeganDecisionIds,
    candidateChanges: changes,
    ownerQueueChanges: queues,
    usedCapacityDelta,
    remainingCapacityDelta,
    evidenceRefsAdded,
    evidenceRefsRemoved,
    sourceRefsAdded,
    sourceRefsRemoved,
    attribution: {
      selectionCause: "NOT_ESTABLISHED",
      rankCause: "NOT_ESTABLISHED",
      outcomeCause: "NOT_ESTABLISHED"
    },
    authority: {
      portfolioMutation: false,
      allocationMutation: false,
      externalAction: false,
      approvalBypass: false
    }
  });
}
