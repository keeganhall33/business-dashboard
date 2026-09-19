import type { DecisionPortfolioV1 } from "./decision-portfolio-v1";

export const DECISION_PORTFOLIO_DEPENDENCY_EVIDENCE_VERSION_V1 =
  "DecisionPortfolioDependencyEvidenceV1" as const;
export const DECISION_PORTFOLIO_DEPENDENCY_EVIDENCE_POLICY_VERSION_V1 =
  "decision_portfolio_dependency_evidence_v1.0.0" as const;

const MAX_EVIDENCE_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_REFS = 100;
const ISO_UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export type DependencyEvidenceStateV1 =
  | "KNOWN"
  | "UNKNOWN"
  | "PARTIAL"
  | "STALE"
  | "CONFLICTED";

export type DependencyCompletionStateV1 =
  | "SATISFIED"
  | "NOT_SATISFIED"
  | "UNKNOWN";

export type DecisionDependencyEvidenceRecordV1 = Readonly<{
  dependencyId: string;
  observedAt: string;
  evidenceState: DependencyEvidenceStateV1;
  completionState: DependencyCompletionStateV1;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
}>;

export type DecisionDependencyCandidateStateV1 =
  | "READY"
  | "WAITING"
  | "VERIFY";

export type DecisionDependencyEvidenceStatusV1 =
  | "READY_FOR_EXECUTION_COMPILER"
  | "WAIT_FOR_DEPENDENCIES"
  | "VERIFY_DEPENDENCY_EVIDENCE";

export type DecisionDependencyEvidenceReasonV1 =
  | "ALL_SELECTED_DEPENDENCIES_SATISFIED"
  | "NO_SELECTED_DEPENDENCIES"
  | "DEPENDENCY_EVIDENCE_MISSING"
  | "DEPENDENCY_NOT_SATISFIED"
  | "DEPENDENCY_STATE_UNKNOWN"
  | "DEPENDENCY_EVIDENCE_NOT_KNOWN"
  | "DEPENDENCY_EVIDENCE_CONFLICTED"
  | "DUPLICATE_DEPENDENCY_EVIDENCE"
  | "UNREFERENCED_DEPENDENCY_EVIDENCE"
  | "DEPENDENCY_EVIDENCE_STALE"
  | "DEPENDENCY_EVIDENCE_IN_FUTURE"
  | "DEPENDENCY_EVIDENCE_PROVENANCE_MISSING"
  | "UNSAFE_PROVENANCE"
  | "INVALID_PORTFOLIO"
  | "INVALID_REVIEW_TIME"
  | "INVALID_FRESHNESS_POLICY";

export type DecisionDependencyCandidateReviewV1 = Readonly<{
  candidateId: string;
  state: DecisionDependencyCandidateStateV1;
  dependencyIds: readonly string[];
  satisfiedDependencyIds: readonly string[];
  waitingDependencyIds: readonly string[];
  verificationDependencyIds: readonly string[];
}>;

export type DecisionPortfolioDependencyEvidenceReviewV1 = Readonly<{
  contractVersion: typeof DECISION_PORTFOLIO_DEPENDENCY_EVIDENCE_VERSION_V1;
  policyVersion: typeof DECISION_PORTFOLIO_DEPENDENCY_EVIDENCE_POLICY_VERSION_V1;
  portfolioId: string;
  reviewedAt: string;
  status: DecisionDependencyEvidenceStatusV1;
  reasonCodes: readonly DecisionDependencyEvidenceReasonV1[];
  referencedDependencyIds: readonly string[];
  satisfiedDependencyIds: readonly string[];
  candidateReviews: readonly DecisionDependencyCandidateReviewV1[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  nextInternalStep:
    | "PASS_VERIFIED_DEPENDENCIES_TO_EXECUTION_COMPILER"
    | "WAIT_FOR_DEPENDENCY_COMPLETION"
    | "VERIFY_DEPENDENCY_EVIDENCE"
    | null;
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  causalInterpretation: "NOT_ESTABLISHED";
  authority: Readonly<{
    analysisOnly: true;
    preparationInputCompilation: boolean;
    portfolioMutationAuthorized: false;
    dependencyMutationAuthorized: false;
    executionAuthorized: false;
    persistenceAuthorized: false;
    providerWriteAuthorized: false;
    externalActionAuthorized: false;
    spendAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
  limitations: readonly string[];
}>;

export type DecisionPortfolioDependencyEvidenceInputV1 = Readonly<{
  portfolio: DecisionPortfolioV1;
  dependencyEvidence: readonly DecisionDependencyEvidenceRecordV1[];
  reviewedAt: string;
  maximumEvidenceAgeMs: number;
}>;

const EVIDENCE_STATES = new Set<DependencyEvidenceStateV1>([
  "KNOWN",
  "UNKNOWN",
  "PARTIAL",
  "STALE",
  "CONFLICTED"
]);
const COMPLETION_STATES = new Set<DependencyCompletionStateV1>([
  "SATISFIED",
  "NOT_SATISFIED",
  "UNKNOWN"
]);

const LIMITATIONS = Object.freeze([
  "Only dependencies with one exact, fresh, KNOWN SATISFIED record are emitted to the existing execution compiler as satisfied.",
  "A satisfied dependency is a recorded upstream fact, not proof that the dependent work will succeed and not authority to execute that work.",
  "Missing, stale, future-dated, partial, conflicted, duplicate, or unsupported dependency evidence fails closed rather than becoming a satisfied dependency.",
  "This review does not mutate the portfolio, dependency state, resources, approvals, persistence, providers, or any external system."
] as const);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function timestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized || !ISO_UTC_TIMESTAMP_RE.test(normalized)) return null;
  const millis = Date.parse(normalized);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

function looksUnsafeReference(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("password=") ||
    normalized.includes("token=") ||
    normalized.includes("api_key=") ||
    normalized.includes("apikey=") ||
    normalized.includes("secret=") ||
    normalized.includes("authorization:") ||
    normalized.includes("bearer ")
  );
}

function normalizeRefs(values: readonly string[] | undefined): {
  refs: readonly string[];
  unsafe: boolean;
} {
  if (!Array.isArray(values)) return { refs: Object.freeze([]), unsafe: false };
  let unsafe = false;
  const refs = values
    .map((value) => text(value))
    .filter((value): value is string => value !== null)
    .filter((value) => {
      if (looksUnsafeReference(value)) {
        unsafe = true;
        return false;
      }
      return true;
    });
  return {
    refs: Object.freeze([...new Set(refs)].slice(0, MAX_REFS).sort((a, b) => a.localeCompare(b))),
    unsafe
  };
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

/**
 * Converts explicit current dependency-completion evidence into the exact
 * `satisfiedDependencyIds` input accepted by DecisionPortfolioExecutionCompilerV1.
 * It never marks a dependency satisfied from adjacency, ordering, candidate state,
 * age alone, or the caller merely naming the dependency as satisfied.
 */
export function reviewDecisionPortfolioDependencyEvidenceV1(
  input: DecisionPortfolioDependencyEvidenceInputV1
): DecisionPortfolioDependencyEvidenceReviewV1 {
  const portfolio = input?.portfolio;
  const reviewedAt = timestamp(input?.reviewedAt);
  const reviewedAtMs = reviewedAt ? Date.parse(reviewedAt) : Number.NaN;
  const maximumEvidenceAgeMs = input?.maximumEvidenceAgeMs;
  const reasons = new Set<DecisionDependencyEvidenceReasonV1>();

  const portfolioValid = Boolean(
    portfolio
      && portfolio.contractVersion === "DecisionPortfolioV1"
      && text(portfolio.portfolioId)
      && Array.isArray(portfolio.items)
      && Array.isArray(portfolio.selectedIds)
  );
  if (!portfolioValid) reasons.add("INVALID_PORTFOLIO");
  if (!reviewedAt) reasons.add("INVALID_REVIEW_TIME");
  if (
    !Number.isFinite(maximumEvidenceAgeMs)
      || maximumEvidenceAgeMs <= 0
      || maximumEvidenceAgeMs > MAX_EVIDENCE_AGE_MS
  ) {
    reasons.add("INVALID_FRESHNESS_POLICY");
  }

  const selectedItems = portfolioValid
    ? portfolio.items.filter((item) => item.disposition === "SELECTED")
    : [];
  const selectedIds = selectedItems.map((item) => item.candidate.id);
  if (
    portfolioValid
      && (new Set(selectedIds).size !== selectedIds.length
        || selectedIds.length !== portfolio.selectedIds.length
        || sortedUnique(selectedIds).some((id, index) => id !== sortedUnique(portfolio.selectedIds)[index]))
  ) {
    reasons.add("INVALID_PORTFOLIO");
  }

  const referencedDependencyIds = sortedUnique(
    selectedItems.flatMap((item) => item.candidate.dependencyIds.map((dependencyId) => dependencyId.trim()))
  );
  const referencedSet = new Set(referencedDependencyIds);
  const byDependency = new Map<string, DecisionDependencyEvidenceRecordV1[]>();
  const allEvidenceRefs: string[] = [];
  const allSourceRefs: string[] = [];
  const invalidDependencyIds = new Set<string>();
  const waitingDependencyIds = new Set<string>();
  const satisfiedDependencyIds = new Set<string>();

  if (!Array.isArray(input?.dependencyEvidence)) {
    reasons.add("DEPENDENCY_EVIDENCE_MISSING");
  } else {
    for (const record of input.dependencyEvidence) {
      const dependencyId = text(record?.dependencyId);
      if (!dependencyId) {
        reasons.add("DEPENDENCY_EVIDENCE_MISSING");
        continue;
      }
      const records = byDependency.get(dependencyId) ?? [];
      records.push(record);
      byDependency.set(dependencyId, records);
      if (!referencedSet.has(dependencyId)) reasons.add("UNREFERENCED_DEPENDENCY_EVIDENCE");
    }
  }

  for (const dependencyId of referencedDependencyIds) {
    const records = byDependency.get(dependencyId) ?? [];
    if (records.length === 0) {
      reasons.add("DEPENDENCY_EVIDENCE_MISSING");
      waitingDependencyIds.add(dependencyId);
      continue;
    }
    if (records.length > 1) {
      reasons.add("DUPLICATE_DEPENDENCY_EVIDENCE");
      invalidDependencyIds.add(dependencyId);
      continue;
    }

    const record = records[0];
    if (!EVIDENCE_STATES.has(record.evidenceState) || !COMPLETION_STATES.has(record.completionState)) {
      reasons.add("DEPENDENCY_EVIDENCE_NOT_KNOWN");
      invalidDependencyIds.add(dependencyId);
      continue;
    }

    const evidenceRefs = normalizeRefs(record.evidenceRefs);
    const sourceRefs = normalizeRefs(record.sourceRefs);
    allEvidenceRefs.push(...evidenceRefs.refs);
    allSourceRefs.push(...sourceRefs.refs);
    if (evidenceRefs.unsafe || sourceRefs.unsafe) {
      reasons.add("UNSAFE_PROVENANCE");
      invalidDependencyIds.add(dependencyId);
    }
    if (evidenceRefs.refs.length === 0 || sourceRefs.refs.length === 0) {
      reasons.add("DEPENDENCY_EVIDENCE_PROVENANCE_MISSING");
      invalidDependencyIds.add(dependencyId);
    }

    const observedAt = timestamp(record.observedAt);
    if (!observedAt || !reviewedAt) {
      reasons.add("DEPENDENCY_EVIDENCE_IN_FUTURE");
      invalidDependencyIds.add(dependencyId);
    } else {
      const observedAtMs = Date.parse(observedAt);
      if (observedAtMs > reviewedAtMs) {
        reasons.add("DEPENDENCY_EVIDENCE_IN_FUTURE");
        invalidDependencyIds.add(dependencyId);
      } else if (
        Number.isFinite(maximumEvidenceAgeMs)
          && maximumEvidenceAgeMs > 0
          && reviewedAtMs - observedAtMs > maximumEvidenceAgeMs
      ) {
        reasons.add("DEPENDENCY_EVIDENCE_STALE");
        invalidDependencyIds.add(dependencyId);
      }
    }

    if (record.evidenceState === "CONFLICTED") {
      reasons.add("DEPENDENCY_EVIDENCE_CONFLICTED");
      invalidDependencyIds.add(dependencyId);
    } else if (record.evidenceState !== "KNOWN") {
      reasons.add("DEPENDENCY_EVIDENCE_NOT_KNOWN");
      waitingDependencyIds.add(dependencyId);
    }

    if (record.completionState === "UNKNOWN") {
      reasons.add("DEPENDENCY_STATE_UNKNOWN");
      waitingDependencyIds.add(dependencyId);
    } else if (record.completionState === "NOT_SATISFIED") {
      reasons.add("DEPENDENCY_NOT_SATISFIED");
      waitingDependencyIds.add(dependencyId);
    }

    if (
      record.evidenceState === "KNOWN"
      && record.completionState === "SATISFIED"
      && !invalidDependencyIds.has(dependencyId)
    ) {
      satisfiedDependencyIds.add(dependencyId);
    }
  }

  const candidateReviews: DecisionDependencyCandidateReviewV1[] = selectedItems
    .map((item) => {
      const dependencyIds = sortedUnique(item.candidate.dependencyIds.map((value) => value.trim()));
      const verificationDependencyIds = dependencyIds.filter((id) => invalidDependencyIds.has(id));
      const waitingIds = dependencyIds.filter(
        (id) => waitingDependencyIds.has(id) && !invalidDependencyIds.has(id)
      );
      const satisfiedIds = dependencyIds.filter((id) => satisfiedDependencyIds.has(id));
      const state: DecisionDependencyCandidateStateV1 = verificationDependencyIds.length > 0
        ? "VERIFY"
        : waitingIds.length > 0 || satisfiedIds.length !== dependencyIds.length
          ? "WAITING"
          : "READY";
      return freezeDeep({
        candidateId: item.candidate.id,
        state,
        dependencyIds,
        satisfiedDependencyIds: satisfiedIds,
        waitingDependencyIds: waitingIds,
        verificationDependencyIds
      });
    })
    .sort((a, b) => a.candidateId.localeCompare(b.candidateId));

  const hasVerification = reasons.has("INVALID_PORTFOLIO")
    || reasons.has("INVALID_REVIEW_TIME")
    || reasons.has("INVALID_FRESHNESS_POLICY")
    || reasons.has("DEPENDENCY_EVIDENCE_CONFLICTED")
    || reasons.has("DUPLICATE_DEPENDENCY_EVIDENCE")
    || reasons.has("DEPENDENCY_EVIDENCE_STALE")
    || reasons.has("DEPENDENCY_EVIDENCE_IN_FUTURE")
    || reasons.has("DEPENDENCY_EVIDENCE_PROVENANCE_MISSING")
    || reasons.has("UNSAFE_PROVENANCE");
  const hasWaiting = reasons.has("DEPENDENCY_EVIDENCE_MISSING")
    || reasons.has("DEPENDENCY_NOT_SATISFIED")
    || reasons.has("DEPENDENCY_STATE_UNKNOWN")
    || reasons.has("DEPENDENCY_EVIDENCE_NOT_KNOWN");

  let status: DecisionDependencyEvidenceStatusV1;
  if (hasVerification) status = "VERIFY_DEPENDENCY_EVIDENCE";
  else if (hasWaiting) status = "WAIT_FOR_DEPENDENCIES";
  else status = "READY_FOR_EXECUTION_COMPILER";

  if (status === "READY_FOR_EXECUTION_COMPILER") {
    reasons.add(referencedDependencyIds.length === 0
      ? "NO_SELECTED_DEPENDENCIES"
      : "ALL_SELECTED_DEPENDENCIES_SATISFIED");
  }

  const reasonCodes = Object.freeze(
    [...reasons].sort((a, b) => a.localeCompare(b))
  ) as readonly DecisionDependencyEvidenceReasonV1[];
  const compilerSatisfiedDependencyIds = status === "READY_FOR_EXECUTION_COMPILER"
    ? sortedUnique([...satisfiedDependencyIds])
    : Object.freeze([] as string[]);

  return freezeDeep({
    contractVersion: DECISION_PORTFOLIO_DEPENDENCY_EVIDENCE_VERSION_V1,
    policyVersion: DECISION_PORTFOLIO_DEPENDENCY_EVIDENCE_POLICY_VERSION_V1,
    portfolioId: text(portfolio?.portfolioId) ?? "unknown-portfolio",
    reviewedAt: reviewedAt ?? input?.reviewedAt ?? "INVALID",
    status,
    reasonCodes,
    referencedDependencyIds,
    satisfiedDependencyIds: compilerSatisfiedDependencyIds,
    candidateReviews,
    evidenceRefs: sortedUnique(allEvidenceRefs),
    sourceRefs: sortedUnique(allSourceRefs),
    nextInternalStep: status === "READY_FOR_EXECUTION_COMPILER"
      ? "PASS_VERIFIED_DEPENDENCIES_TO_EXECUTION_COMPILER"
      : status === "WAIT_FOR_DEPENDENCIES"
        ? "WAIT_FOR_DEPENDENCY_COMPLETION"
        : "VERIFY_DEPENDENCY_EVIDENCE",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    causalInterpretation: "NOT_ESTABLISHED",
    authority: {
      analysisOnly: true,
      preparationInputCompilation: status === "READY_FOR_EXECUTION_COMPILER",
      portfolioMutationAuthorized: false,
      dependencyMutationAuthorized: false,
      executionAuthorized: false,
      persistenceAuthorized: false,
      providerWriteAuthorized: false,
      externalActionAuthorized: false,
      spendAuthorized: false,
      approvalBypassAuthorized: false
    },
    limitations: LIMITATIONS
  });
}
