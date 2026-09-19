import { createHash } from "node:crypto";

import {
  compareDecisionPortfoliosV1,
  DECISION_PORTFOLIO_CHANGE_CONTRACT_VERSION_V1,
  DECISION_PORTFOLIO_CHANGE_POLICY_VERSION_V1,
  type DecisionPortfolioChangeV1
} from "./decision-portfolio-change-v1";
import {
  DECISION_PORTFOLIO_REALLOCATION_CONTRACT_VERSION_V1,
  DECISION_PORTFOLIO_REALLOCATION_POLICY_VERSION_V1,
  type DecisionAttributionClassV1,
  type DecisionPortfolioReallocationReviewV1
} from "./decision-portfolio-reallocation-v1";
import {
  DECISION_PORTFOLIO_POLICY_VERSION_V1,
  type DecisionDispositionV1,
  type DecisionEvidenceStateV1,
  type DecisionPortfolioV1
} from "./decision-portfolio-v1";

export const DECISION_PORTFOLIO_REALLOCATION_LINEAGE_CONTRACT_VERSION_V1 =
  "DecisionPortfolioReallocationLineageV1" as const;
export const DECISION_PORTFOLIO_REALLOCATION_LINEAGE_POLICY_VERSION_V1 =
  "decision_portfolio_reallocation_lineage_policy_v1.0.0" as const;

const MAX_REFS = 200;

export type DecisionPortfolioReallocationLineageStatusV1 =
  | "NO_REBUILD_REQUIRED"
  | "VERIFICATION_REQUIRED"
  | "WAITING_FOR_REBUILD"
  | "EVIDENCE_BINDING_REQUIRED"
  | "LINEAGE_READY_NO_SELECTION_CHANGE"
  | "LINEAGE_READY_SELECTION_CHANGE";

export type DecisionPortfolioReallocationEvidenceBindingV1 = {
  candidateId: string;
  outcomeId: string;
  previousDisposition: DecisionDispositionV1;
  currentDisposition: DecisionDispositionV1 | null;
  currentEvidenceState: DecisionEvidenceStateV1 | null;
  recordedAttributionClass: DecisionAttributionClassV1;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  missingEvidenceRefs: readonly string[];
  missingSourceRefs: readonly string[];
  bindingIssues: readonly (
    | "RECONSIDERED_CANDIDATE_MISSING"
    | "CURRENT_CANDIDATE_NOT_KNOWN"
    | "REVIEW_EVIDENCE_NOT_BOUND"
    | "REVIEW_SOURCE_NOT_BOUND"
  )[];
  state: "BOUND" | "VERIFY";
};

export type DecisionPortfolioReallocationLineageV1 = {
  contractVersion: typeof DECISION_PORTFOLIO_REALLOCATION_LINEAGE_CONTRACT_VERSION_V1;
  policyVersion: typeof DECISION_PORTFOLIO_REALLOCATION_LINEAGE_POLICY_VERSION_V1;
  lineageId: string;
  certifiedAt: string;
  sourceReviewId: string;
  sourcePortfolioId: string;
  currentPortfolioId: string;
  changeId: string;
  status: DecisionPortfolioReallocationLineageStatusV1;
  lineageReady: boolean;
  rebuildObserved: boolean;
  reviewedCandidateIds: readonly string[];
  reconsiderCandidateIds: readonly string[];
  verificationCandidateIds: readonly string[];
  evidenceBindings: readonly DecisionPortfolioReallocationEvidenceBindingV1[];
  change: {
    status: DecisionPortfolioChangeV1["status"];
    selectedAddedIds: readonly string[];
    selectedRemovedIds: readonly string[];
    newKeeganDecisionIds: readonly string[];
    clearedKeeganDecisionIds: readonly string[];
  };
  interpretation: {
    reviewEvidenceBoundToCurrentCandidates: boolean;
    selectionChangedAfterReview: boolean;
    selectionChangeCause: "NOT_ESTABLISHED";
    rankChangeCause: "NOT_ESTABLISHED";
    outcomeCause: "NOT_ESTABLISHED";
    associationOnly: true;
  };
  authority: {
    portfolioMutation: false;
    allocationMutation: false;
    scoreMutation: false;
    monetaryMutation: false;
    confidenceMutation: false;
    externalAction: false;
    approvalBypass: false;
  };
  audit: {
    reviewedCandidates: number;
    reconsiderCandidates: number;
    verificationCandidates: number;
    boundReconsiderCandidates: number;
    unresolvedBindings: number;
  };
};

export class DecisionPortfolioReallocationLineageError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DecisionPortfolioReallocationLineageError";
  }
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DecisionPortfolioReallocationLineageError("REQUIRED_TEXT", `${label} is required`);
  }
  return value.trim();
}

function timestamp(value: unknown, label: string): string {
  const normalized = text(value, label);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new DecisionPortfolioReallocationLineageError(
      "INVALID_TIMESTAMP",
      `${label} must be an ISO-compatible timestamp`
    );
  }
  return normalized;
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

function stable(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function refs(values: readonly string[], label: string): string[] {
  if (!Array.isArray(values) || values.length > MAX_REFS) {
    throw new DecisionPortfolioReallocationLineageError("INVALID_REFS", `${label} is invalid`);
  }
  const normalized = values.map((value) => text(value, label));
  if (new Set(normalized).size !== normalized.length) {
    throw new DecisionPortfolioReallocationLineageError("DUPLICATE_REF", `${label} contains duplicate references`);
  }
  return [...normalized].sort((a, b) => a.localeCompare(b));
}

function difference(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right);
  return [...new Set(left.filter((value) => !rightSet.has(value)))].sort((a, b) => a.localeCompare(b));
}

function sameRefs(left: readonly string[], right: readonly string[]): boolean {
  return stable([...left].sort((a, b) => a.localeCompare(b))) === stable([...right].sort((a, b) => a.localeCompare(b)));
}

function assertPortfolio(portfolio: DecisionPortfolioV1, label: string): void {
  if (
    portfolio.contractVersion !== "DecisionPortfolioV1" ||
    portfolio.policyVersion !== DECISION_PORTFOLIO_POLICY_VERSION_V1
  ) {
    throw new DecisionPortfolioReallocationLineageError(
      "INVALID_PORTFOLIO_CONTRACT",
      `${label} must use the canonical DecisionPortfolioV1 contract and policy`
    );
  }
}

function assertNoWidenedAuthority(review: DecisionPortfolioReallocationReviewV1): void {
  if (Object.values(review.authority).some((value) => value !== false)) {
    throw new DecisionPortfolioReallocationLineageError(
      "REALLOCATION_AUTHORITY_WIDENED",
      "source reallocation review widened action authority"
    );
  }
}

function validateReview(
  review: DecisionPortfolioReallocationReviewV1,
  previous: DecisionPortfolioV1
): void {
  if (
    review.contractVersion !== DECISION_PORTFOLIO_REALLOCATION_CONTRACT_VERSION_V1 ||
    review.policyVersion !== DECISION_PORTFOLIO_REALLOCATION_POLICY_VERSION_V1
  ) {
    throw new DecisionPortfolioReallocationLineageError(
      "INVALID_REALLOCATION_REVIEW",
      "source reallocation review contract or policy is invalid"
    );
  }
  if (review.sourcePortfolioId !== previous.portfolioId) {
    throw new DecisionPortfolioReallocationLineageError(
      "SOURCE_PORTFOLIO_MISMATCH",
      "source reallocation review does not belong to the previous portfolio"
    );
  }
  assertNoWidenedAuthority(review);

  const generatedAt = timestamp(review.generatedAt, "review.generatedAt");
  if (Date.parse(generatedAt) < Date.parse(timestamp(previous.generatedAt, "previous.generatedAt"))) {
    throw new DecisionPortfolioReallocationLineageError(
      "REVIEW_BEFORE_SOURCE_PORTFOLIO",
      "source reallocation review predates the previous portfolio"
    );
  }

  const previousById = new Map(previous.items.map((item) => [item.candidate.id, item]));
  const candidateIds = new Set<string>();
  const outcomeIds = new Set<string>();
  for (const candidateReview of review.candidateReviews) {
    const candidateId = text(candidateReview.candidateId, "candidateReview.candidateId");
    const outcomeId = text(candidateReview.outcomeId, `${candidateId}.outcomeId`);
    if (candidateIds.has(candidateId)) {
      throw new DecisionPortfolioReallocationLineageError(
        "DUPLICATE_REVIEW_CANDIDATE",
        `source review repeats candidate ${candidateId}`
      );
    }
    if (outcomeIds.has(outcomeId)) {
      throw new DecisionPortfolioReallocationLineageError(
        "DUPLICATE_REVIEW_OUTCOME",
        `source review repeats outcome ${outcomeId}`
      );
    }
    candidateIds.add(candidateId);
    outcomeIds.add(outcomeId);
    const previousItem = previousById.get(candidateId);
    if (!previousItem) {
      throw new DecisionPortfolioReallocationLineageError(
        "REVIEW_CANDIDATE_NOT_IN_SOURCE",
        `source review candidate ${candidateId} is not in the previous portfolio`
      );
    }
    if (previousItem.disposition !== candidateReview.previousDisposition) {
      throw new DecisionPortfolioReallocationLineageError(
        "PREVIOUS_DISPOSITION_MISMATCH",
        `source review disposition for ${candidateId} does not match the previous portfolio`
      );
    }
    refs(candidateReview.evidenceRefs, `${candidateId}.evidenceRefs`);
    refs(candidateReview.sourceRefs, `${candidateId}.sourceRefs`);
  }

  const reconsiderCount = review.candidateReviews.filter((item) => item.reviewState === "RECONSIDER").length;
  const verificationCount = review.candidateReviews.filter((item) => item.reviewState === "VERIFY").length;
  const expectedStatus = verificationCount > 0
    ? "VERIFICATION_REQUIRED"
    : reconsiderCount > 0
      ? "REVIEW_REQUIRED"
      : "NO_CHANGE";
  const expectedRequiresRebuild = reconsiderCount > 0 && verificationCount === 0;
  if (
    review.audit.outcomesConsidered !== review.candidateReviews.length ||
    review.audit.reconsiderCount !== reconsiderCount ||
    review.audit.verificationCount !== verificationCount ||
    review.status !== expectedStatus ||
    review.requiresPortfolioRebuild !== expectedRequiresRebuild
  ) {
    throw new DecisionPortfolioReallocationLineageError(
      "REALLOCATION_REVIEW_INTEGRITY_MISMATCH",
      "source reallocation review summary does not match its candidate reviews"
    );
  }

  const expectedEvidenceRefs = refs(
    review.candidateReviews.flatMap((item) => item.evidenceRefs),
    "review.candidateEvidenceRefs"
  );
  const expectedSourceRefs = refs(
    review.candidateReviews.flatMap((item) => item.sourceRefs),
    "review.candidateSourceRefs"
  );
  const actualEvidenceRefs = refs(review.evidenceRefs, "review.evidenceRefs");
  const actualSourceRefs = refs(review.sourceRefs, "review.sourceRefs");
  if (!sameRefs(expectedEvidenceRefs, actualEvidenceRefs) || !sameRefs(expectedSourceRefs, actualSourceRefs)) {
    throw new DecisionPortfolioReallocationLineageError(
      "REALLOCATION_REVIEW_PROVENANCE_MISMATCH",
      "source reallocation review provenance does not match its candidate reviews"
    );
  }
}

function validateChange(
  supplied: DecisionPortfolioChangeV1,
  previous: DecisionPortfolioV1,
  current: DecisionPortfolioV1
): DecisionPortfolioChangeV1 {
  if (
    supplied.contractVersion !== DECISION_PORTFOLIO_CHANGE_CONTRACT_VERSION_V1 ||
    supplied.policyVersion !== DECISION_PORTFOLIO_CHANGE_POLICY_VERSION_V1
  ) {
    throw new DecisionPortfolioReallocationLineageError(
      "INVALID_CHANGE_CONTRACT",
      "portfolio change contract or policy is invalid"
    );
  }
  if (Object.values(supplied.authority).some((value) => value !== false)) {
    throw new DecisionPortfolioReallocationLineageError(
      "CHANGE_AUTHORITY_WIDENED",
      "portfolio change widened action authority"
    );
  }
  if (
    supplied.attribution.selectionCause !== "NOT_ESTABLISHED" ||
    supplied.attribution.rankCause !== "NOT_ESTABLISHED" ||
    supplied.attribution.outcomeCause !== "NOT_ESTABLISHED"
  ) {
    throw new DecisionPortfolioReallocationLineageError(
      "CHANGE_ATTRIBUTION_WIDENED",
      "portfolio change may not invent attribution"
    );
  }
  const recomputed = compareDecisionPortfoliosV1({
    previous,
    current,
    comparedAt: timestamp(supplied.comparedAt, "change.comparedAt")
  });
  if (stable(supplied) !== stable(recomputed)) {
    throw new DecisionPortfolioReallocationLineageError(
      "CHANGE_PROJECTION_MISMATCH",
      "supplied portfolio change does not match the canonical recomputation"
    );
  }
  return recomputed;
}

function buildBindings(
  review: DecisionPortfolioReallocationReviewV1,
  current: DecisionPortfolioV1
): DecisionPortfolioReallocationEvidenceBindingV1[] {
  const currentById = new Map(current.items.map((item) => [item.candidate.id, item]));
  return review.candidateReviews
    .filter((item) => item.reviewState === "RECONSIDER")
    .map((item) => {
      const currentItem = currentById.get(item.candidateId);
      const currentEvidenceRefs = currentItem ? refs(currentItem.candidate.evidenceRefs, `${item.candidateId}.currentEvidenceRefs`) : [];
      const currentSourceRefs = currentItem ? refs(currentItem.candidate.sourceRefs, `${item.candidateId}.currentSourceRefs`) : [];
      const reviewEvidenceRefs = refs(item.evidenceRefs, `${item.candidateId}.reviewEvidenceRefs`);
      const reviewSourceRefs = refs(item.sourceRefs, `${item.candidateId}.reviewSourceRefs`);
      const missingEvidenceRefs = difference(reviewEvidenceRefs, currentEvidenceRefs);
      const missingSourceRefs = difference(reviewSourceRefs, currentSourceRefs);
      const bindingIssues: DecisionPortfolioReallocationEvidenceBindingV1["bindingIssues"][number][] = [];

      if (!currentItem) bindingIssues.push("RECONSIDERED_CANDIDATE_MISSING");
      if (currentItem && currentItem.candidate.evidenceState !== "KNOWN") {
        bindingIssues.push("CURRENT_CANDIDATE_NOT_KNOWN");
      }
      if (missingEvidenceRefs.length > 0) bindingIssues.push("REVIEW_EVIDENCE_NOT_BOUND");
      if (missingSourceRefs.length > 0) bindingIssues.push("REVIEW_SOURCE_NOT_BOUND");

      return {
        candidateId: item.candidateId,
        outcomeId: item.outcomeId,
        previousDisposition: item.previousDisposition,
        currentDisposition: currentItem?.disposition ?? null,
        currentEvidenceState: currentItem?.candidate.evidenceState ?? null,
        recordedAttributionClass: item.attributionClass,
        evidenceRefs: reviewEvidenceRefs,
        sourceRefs: reviewSourceRefs,
        missingEvidenceRefs,
        missingSourceRefs,
        bindingIssues,
        state: bindingIssues.length === 0 ? "BOUND" as const : "VERIFY" as const
      };
    })
    .sort((a, b) => a.candidateId.localeCompare(b.candidateId));
}

export function certifyDecisionPortfolioReallocationLineageV1(input: {
  previous: DecisionPortfolioV1;
  current: DecisionPortfolioV1;
  reallocationReview: DecisionPortfolioReallocationReviewV1;
  change: DecisionPortfolioChangeV1;
  certifiedAt: string;
}): Readonly<DecisionPortfolioReallocationLineageV1> {
  assertPortfolio(input.previous, "previous");
  assertPortfolio(input.current, "current");
  validateReview(input.reallocationReview, input.previous);
  const canonicalChange = validateChange(input.change, input.previous, input.current);

  const previousGeneratedAt = timestamp(input.previous.generatedAt, "previous.generatedAt");
  const currentGeneratedAt = timestamp(input.current.generatedAt, "current.generatedAt");
  const reviewGeneratedAt = timestamp(input.reallocationReview.generatedAt, "review.generatedAt");
  const certifiedAt = timestamp(input.certifiedAt, "certifiedAt");

  if (Date.parse(currentGeneratedAt) < Date.parse(previousGeneratedAt)) {
    throw new DecisionPortfolioReallocationLineageError(
      "CURRENT_PORTFOLIO_PREDATES_SOURCE",
      "current portfolio predates the source portfolio"
    );
  }
  if (Date.parse(certifiedAt) < Date.parse(canonicalChange.comparedAt)) {
    throw new DecisionPortfolioReallocationLineageError(
      "CERTIFICATION_BEFORE_CHANGE",
      "certification cannot precede the canonical portfolio comparison"
    );
  }

  const reviewedCandidateIds = [...input.reallocationReview.candidateReviews]
    .map((item) => item.candidateId)
    .sort((a, b) => a.localeCompare(b));
  const reconsiderCandidateIds = input.reallocationReview.candidateReviews
    .filter((item) => item.reviewState === "RECONSIDER")
    .map((item) => item.candidateId)
    .sort((a, b) => a.localeCompare(b));
  const verificationCandidateIds = input.reallocationReview.candidateReviews
    .filter((item) => item.reviewState === "VERIFY")
    .map((item) => item.candidateId)
    .sort((a, b) => a.localeCompare(b));

  const rebuildObserved =
    input.current.portfolioId !== input.previous.portfolioId &&
    Date.parse(currentGeneratedAt) > Date.parse(reviewGeneratedAt);
  const evidenceBindings = buildBindings(input.reallocationReview, input.current);
  const unresolvedBindings = evidenceBindings.filter((binding) => binding.state !== "BOUND").length;
  const reviewEvidenceBoundToCurrentCandidates =
    evidenceBindings.length > 0 && unresolvedBindings === 0;

  let status: DecisionPortfolioReallocationLineageStatusV1;
  let lineageReady = false;
  if (input.reallocationReview.status === "VERIFICATION_REQUIRED") {
    status = "VERIFICATION_REQUIRED";
  } else if (!input.reallocationReview.requiresPortfolioRebuild) {
    status = "NO_REBUILD_REQUIRED";
  } else if (!rebuildObserved) {
    status = "WAITING_FOR_REBUILD";
  } else if (!reviewEvidenceBoundToCurrentCandidates) {
    status = "EVIDENCE_BINDING_REQUIRED";
  } else if (canonicalChange.status === "SELECTION_CHANGE") {
    status = "LINEAGE_READY_SELECTION_CHANGE";
    lineageReady = true;
  } else {
    status = "LINEAGE_READY_NO_SELECTION_CHANGE";
    lineageReady = true;
  }

  const identity = canonical({
    policyVersion: DECISION_PORTFOLIO_REALLOCATION_LINEAGE_POLICY_VERSION_V1,
    certifiedAt,
    sourceReviewId: input.reallocationReview.reviewId,
    sourcePortfolioId: input.previous.portfolioId,
    currentPortfolioId: input.current.portfolioId,
    changeId: canonicalChange.changeId,
    status,
    reviewedCandidateIds,
    reconsiderCandidateIds,
    verificationCandidateIds,
    evidenceBindings
  });
  const lineageId = `portfolio-reallocation-lineage:${createHash("sha256")
    .update(JSON.stringify(identity))
    .digest("hex")
    .slice(0, 24)}`;

  return freeze({
    contractVersion: DECISION_PORTFOLIO_REALLOCATION_LINEAGE_CONTRACT_VERSION_V1,
    policyVersion: DECISION_PORTFOLIO_REALLOCATION_LINEAGE_POLICY_VERSION_V1,
    lineageId,
    certifiedAt,
    sourceReviewId: input.reallocationReview.reviewId,
    sourcePortfolioId: input.previous.portfolioId,
    currentPortfolioId: input.current.portfolioId,
    changeId: canonicalChange.changeId,
    status,
    lineageReady,
    rebuildObserved,
    reviewedCandidateIds,
    reconsiderCandidateIds,
    verificationCandidateIds,
    evidenceBindings,
    change: {
      status: canonicalChange.status,
      selectedAddedIds: canonicalChange.selectedAddedIds,
      selectedRemovedIds: canonicalChange.selectedRemovedIds,
      newKeeganDecisionIds: canonicalChange.newKeeganDecisionIds,
      clearedKeeganDecisionIds: canonicalChange.clearedKeeganDecisionIds
    },
    interpretation: {
      reviewEvidenceBoundToCurrentCandidates,
      selectionChangedAfterReview: canonicalChange.status === "SELECTION_CHANGE",
      selectionChangeCause: "NOT_ESTABLISHED",
      rankChangeCause: "NOT_ESTABLISHED",
      outcomeCause: "NOT_ESTABLISHED",
      associationOnly: true
    },
    authority: {
      portfolioMutation: false,
      allocationMutation: false,
      scoreMutation: false,
      monetaryMutation: false,
      confidenceMutation: false,
      externalAction: false,
      approvalBypass: false
    },
    audit: {
      reviewedCandidates: reviewedCandidateIds.length,
      reconsiderCandidates: reconsiderCandidateIds.length,
      verificationCandidates: verificationCandidateIds.length,
      boundReconsiderCandidates: evidenceBindings.filter((binding) => binding.state === "BOUND").length,
      unresolvedBindings
    }
  });
}
