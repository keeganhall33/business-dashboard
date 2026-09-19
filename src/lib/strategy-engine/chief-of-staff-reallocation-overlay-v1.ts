import {
  DECISION_PORTFOLIO_REALLOCATION_LINEAGE_CONTRACT_VERSION_V1,
  DECISION_PORTFOLIO_REALLOCATION_LINEAGE_POLICY_VERSION_V1,
  type DecisionPortfolioReallocationEvidenceBindingV1,
  type DecisionPortfolioReallocationLineageV1
} from "./decision-portfolio-reallocation-lineage-v1";
import {
  DECISION_PORTFOLIO_POLICY_VERSION_V1,
  type DecisionPortfolioItemV1,
  type DecisionPortfolioV1
} from "./decision-portfolio-v1";

export const CHIEF_OF_STAFF_REALLOCATION_OVERLAY_CONTRACT_VERSION_V1 =
  "ChiefOfStaffReallocationOverlayV1" as const;
export const CHIEF_OF_STAFF_REALLOCATION_OVERLAY_POLICY_VERSION_V1 =
  "chief_of_staff_reallocation_overlay_v1.0.0" as const;

const MAX_REFS = 400;

export type ChiefOfStaffReallocationOverlayStateV1 =
  | "NO_REBUILD_REQUIRED"
  | "VERIFY_SOURCE"
  | "WAITING_FOR_REBUILD"
  | "VERIFY_EVIDENCE_BINDING"
  | "READY_NO_SELECTION_CHANGE"
  | "READY_SELECTION_CHANGE";

export type ChiefOfStaffReallocationReviewSignalV1 = Readonly<{
  candidateId: string;
  title: string;
  outcomeId: string;
  previousDisposition: DecisionPortfolioReallocationEvidenceBindingV1["previousDisposition"];
  currentDisposition: DecisionPortfolioReallocationEvidenceBindingV1["currentDisposition"];
  currentEvidenceState: DecisionPortfolioReallocationEvidenceBindingV1["currentEvidenceState"];
  recordedAttributionClass: DecisionPortfolioReallocationEvidenceBindingV1["recordedAttributionClass"];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  missingEvidenceRefs: readonly string[];
  missingSourceRefs: readonly string[];
  bindingIssues: DecisionPortfolioReallocationEvidenceBindingV1["bindingIssues"];
  state: DecisionPortfolioReallocationEvidenceBindingV1["state"];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
}>;

export type ChiefOfStaffReallocationChangeItemV1 = Readonly<{
  candidateId: string;
  title: string;
}>;

export type ChiefOfStaffReallocationOverlayV1 = Readonly<{
  contractVersion: typeof CHIEF_OF_STAFF_REALLOCATION_OVERLAY_CONTRACT_VERSION_V1;
  policyVersion: typeof CHIEF_OF_STAFF_REALLOCATION_OVERLAY_POLICY_VERSION_V1;
  generatedAt: string;
  maximumLineageAgeMs: number;
  sourceAgeMs: number;
  state: ChiefOfStaffReallocationOverlayStateV1;
  source: Readonly<{
    lineageId: string;
    sourceReviewId: string;
    previousPortfolioId: string;
    currentPortfolioId: string;
    certifiedAt: string;
  }>;
  summary: Readonly<{
    reviewedCandidates: number;
    reconsiderCandidates: number;
    verificationCandidates: number;
    boundReconsiderCandidates: number;
    unresolvedBindings: number;
    selectedAdded: number;
    selectedRemoved: number;
    newKeeganDecisions: number;
    clearedKeeganDecisions: number;
  }>;
  reviewSignals: readonly ChiefOfStaffReallocationReviewSignalV1[];
  portfolioChanges: Readonly<{
    selectedAdded: readonly ChiefOfStaffReallocationChangeItemV1[];
    selectedRemoved: readonly ChiefOfStaffReallocationChangeItemV1[];
    newKeeganDecisions: readonly ChiefOfStaffReallocationChangeItemV1[];
    clearedKeeganDecisions: readonly ChiefOfStaffReallocationChangeItemV1[];
  }>;
  interpretation: Readonly<{
    selectionChangedAfterReview: boolean;
    selectionChangeCause: "NOT_ESTABLISHED";
    rankChangeCause: "NOT_ESTABLISHED";
    outcomeCause: "NOT_ESTABLISHED";
    associationOnly: true;
  }>;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  limitations: readonly string[];
  authority: Readonly<{
    synthesisOnly: true;
    persistenceAuthorized: false;
    portfolioMutationAuthorized: false;
    allocationMutationAuthorized: false;
    decisionMutationAuthorized: false;
    confidenceMutationAuthorized: false;
    monetaryMutationAuthorized: false;
    reallocationAuthorized: false;
    pricingChangeAuthorized: false;
    campaignExecutionAuthorized: false;
    experimentExecutionAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

export class ChiefOfStaffReallocationOverlayError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ChiefOfStaffReallocationOverlayError";
  }
}

const EXPECTED_LINEAGE_AUTHORITY = Object.freeze({
  portfolioMutation: false,
  allocationMutation: false,
  scoreMutation: false,
  monetaryMutation: false,
  confidenceMutation: false,
  externalAction: false,
  approvalBypass: false
});

const AUTHORITY = Object.freeze({
  synthesisOnly: true as const,
  persistenceAuthorized: false as const,
  portfolioMutationAuthorized: false as const,
  allocationMutationAuthorized: false as const,
  decisionMutationAuthorized: false as const,
  confidenceMutationAuthorized: false as const,
  monetaryMutationAuthorized: false as const,
  reallocationAuthorized: false as const,
  pricingChangeAuthorized: false as const,
  campaignExecutionAuthorized: false as const,
  experimentExecutionAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "This overlay summarizes an already-certified reallocation lineage. It does not rebuild, select, rank, allocate, or execute a portfolio.",
  "A selection change observed after an outcome review is an association only. The outcome is not treated as the cause of the selection or rank change unless a separate governed attribution record establishes that claim.",
  "Recorded attribution classes are preserved exactly as historical evidence and are not upgraded into confidence, expected value, monetary value, or a recommendation.",
  "Verification, waiting, and evidence-binding states remain unresolved. They are not converted into healthy, complete, or action-ready states.",
  "No persistence, portfolio or decision mutation, reallocation, pricing change, campaign or experiment execution, external action, or approval bypass is authorized."
] as const);

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ChiefOfStaffReallocationOverlayError("REQUIRED_TEXT", `${label} is required`);
  }
  return value.trim();
}

function canonicalTimestamp(value: unknown, label: string): string {
  const normalized = text(value, label);
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== normalized) {
    throw new ChiefOfStaffReallocationOverlayError(
      "INVALID_TIMESTAMP",
      `${label} must be a canonical UTC ISO timestamp`
    );
  }
  return normalized;
}

function positiveFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ChiefOfStaffReallocationOverlayError(
      "INVALID_FRESHNESS_POLICY",
      `${label} must be a positive finite number`
    );
  }
  return value;
}

function exactUniqueStrings(values: unknown, label: string): readonly string[] {
  if (!Array.isArray(values) || values.length > MAX_REFS) {
    throw new ChiefOfStaffReallocationOverlayError("INVALID_REFS", `${label} is invalid`);
  }
  const normalized = values.map((value) => text(value, label));
  if (new Set(normalized).size !== normalized.length) {
    throw new ChiefOfStaffReallocationOverlayError("DUPLICATE_REF", `${label} contains duplicate references`);
  }
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function difference(left: readonly string[], right: readonly string[]): readonly string[] {
  const rightSet = new Set(right);
  return uniqueSorted(left.filter((value) => !rightSet.has(value)));
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  const a = uniqueSorted(left);
  const b = uniqueSorted(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function exactAuthority(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const expected = EXPECTED_LINEAGE_AUTHORITY as Record<string, boolean>;
  const actualKeys = Object.keys(actual).sort((a, b) => a.localeCompare(b));
  const expectedKeys = Object.keys(expected).sort((a, b) => a.localeCompare(b));
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index] && actual[key] === expected[key]);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value as Readonly<T>;
}

function validatePortfolio(portfolio: DecisionPortfolioV1, label: string): Map<string, DecisionPortfolioItemV1> {
  if (
    portfolio?.contractVersion !== "DecisionPortfolioV1"
    || portfolio?.policyVersion !== DECISION_PORTFOLIO_POLICY_VERSION_V1
  ) {
    throw new ChiefOfStaffReallocationOverlayError(
      "INVALID_PORTFOLIO_CONTRACT",
      `${label} must use the canonical DecisionPortfolioV1 contract and policy`
    );
  }
  canonicalTimestamp(portfolio.generatedAt, `${label}.generatedAt`);
  text(portfolio.portfolioId, `${label}.portfolioId`);
  if (!Array.isArray(portfolio.items)) {
    throw new ChiefOfStaffReallocationOverlayError("INVALID_PORTFOLIO_ITEMS", `${label}.items is invalid`);
  }
  const ids = portfolio.items.map((item) => text(item?.candidate?.id, `${label}.candidate.id`));
  if (new Set(ids).size !== ids.length) {
    throw new ChiefOfStaffReallocationOverlayError(
      "DUPLICATE_PORTFOLIO_CANDIDATE",
      `${label} contains duplicate candidate ids`
    );
  }
  const selected = portfolio.items
    .filter((item) => item.disposition === "SELECTED")
    .map((item) => item.candidate.id);
  if (!sameStrings(selected, exactUniqueStrings(portfolio.selectedIds, `${label}.selectedIds`))) {
    throw new ChiefOfStaffReallocationOverlayError(
      "SELECTED_ID_MISMATCH",
      `${label}.selectedIds must exactly match selected portfolio items`
    );
  }
  const keegan = portfolio.items
    .filter((item) => item.disposition === "SELECTED" && item.candidate.approvalClass === "KEEGAN")
    .map((item) => item.candidate.id);
  if (!sameStrings(keegan, exactUniqueStrings(portfolio.keeganDecisionIds, `${label}.keeganDecisionIds`))) {
    throw new ChiefOfStaffReallocationOverlayError(
      "KEEGAN_DECISION_ID_MISMATCH",
      `${label}.keeganDecisionIds must exactly match selected KEEGAN approvals`
    );
  }
  return new Map(portfolio.items.map((item) => [item.candidate.id, item]));
}

function validateLineageIdentity(
  lineage: DecisionPortfolioReallocationLineageV1,
  previous: DecisionPortfolioV1,
  current: DecisionPortfolioV1
): void {
  if (
    lineage?.contractVersion !== DECISION_PORTFOLIO_REALLOCATION_LINEAGE_CONTRACT_VERSION_V1
    || lineage?.policyVersion !== DECISION_PORTFOLIO_REALLOCATION_LINEAGE_POLICY_VERSION_V1
  ) {
    throw new ChiefOfStaffReallocationOverlayError(
      "INVALID_LINEAGE_CONTRACT",
      "Only the canonical DecisionPortfolioReallocationLineageV1 may feed this overlay"
    );
  }
  if (!exactAuthority(lineage.authority)) {
    throw new ChiefOfStaffReallocationOverlayError(
      "LINEAGE_AUTHORITY_WIDENED",
      "Reallocation lineage authority is missing, widened, or malformed"
    );
  }
  if (
    lineage.sourcePortfolioId !== previous.portfolioId
    || lineage.currentPortfolioId !== current.portfolioId
  ) {
    throw new ChiefOfStaffReallocationOverlayError(
      "LINEAGE_PORTFOLIO_MISMATCH",
      "Reallocation lineage must bind to the exact previous and current portfolios"
    );
  }
}

function validateLineageSets(lineage: DecisionPortfolioReallocationLineageV1): void {
  const reviewed = exactUniqueStrings(lineage.reviewedCandidateIds, "lineage.reviewedCandidateIds");
  const reconsider = exactUniqueStrings(lineage.reconsiderCandidateIds, "lineage.reconsiderCandidateIds");
  const verification = exactUniqueStrings(lineage.verificationCandidateIds, "lineage.verificationCandidateIds");
  const reviewedSet = new Set(reviewed);
  if (reconsider.some((id) => !reviewedSet.has(id)) || verification.some((id) => !reviewedSet.has(id))) {
    throw new ChiefOfStaffReallocationOverlayError(
      "LINEAGE_REVIEW_SET_MISMATCH",
      "Reconsider and verification candidates must belong to the reviewed candidate set"
    );
  }
  if (reconsider.some((id) => verification.includes(id))) {
    throw new ChiefOfStaffReallocationOverlayError(
      "LINEAGE_REVIEW_SET_OVERLAP",
      "A candidate cannot simultaneously require reconsideration and verification"
    );
  }
  if (!Array.isArray(lineage.evidenceBindings)) {
    throw new ChiefOfStaffReallocationOverlayError("INVALID_BINDINGS", "lineage.evidenceBindings is invalid");
  }
  const bindingIds = lineage.evidenceBindings.map((binding) => text(binding.candidateId, "binding.candidateId"));
  if (!sameStrings(bindingIds, reconsider)) {
    throw new ChiefOfStaffReallocationOverlayError(
      "LINEAGE_BINDING_SET_MISMATCH",
      "Evidence bindings must exist exactly once for every reconsidered candidate"
    );
  }
  const outcomeIds = lineage.evidenceBindings.map((binding) => text(binding.outcomeId, "binding.outcomeId"));
  if (new Set(outcomeIds).size !== outcomeIds.length) {
    throw new ChiefOfStaffReallocationOverlayError(
      "DUPLICATE_OUTCOME_BINDING",
      "A reallocation outcome may not be counted more than once"
    );
  }
}

function validateBinding(
  binding: DecisionPortfolioReallocationEvidenceBindingV1,
  currentById: ReadonlyMap<string, DecisionPortfolioItemV1>
): void {
  const evidenceRefs = exactUniqueStrings(binding.evidenceRefs, `${binding.candidateId}.evidenceRefs`);
  const sourceRefs = exactUniqueStrings(binding.sourceRefs, `${binding.candidateId}.sourceRefs`);
  const missingEvidenceRefs = exactUniqueStrings(
    binding.missingEvidenceRefs,
    `${binding.candidateId}.missingEvidenceRefs`
  );
  const missingSourceRefs = exactUniqueStrings(
    binding.missingSourceRefs,
    `${binding.candidateId}.missingSourceRefs`
  );
  const bindingIssues = exactUniqueStrings(binding.bindingIssues, `${binding.candidateId}.bindingIssues`);
  const current = currentById.get(binding.candidateId);

  if (binding.state === "BOUND") {
    if (
      !current
      || current.candidate.evidenceState !== "KNOWN"
      || binding.currentEvidenceState !== "KNOWN"
      || binding.currentDisposition !== current.disposition
      || missingEvidenceRefs.length > 0
      || missingSourceRefs.length > 0
      || bindingIssues.length > 0
    ) {
      throw new ChiefOfStaffReallocationOverlayError(
        "BOUND_EVIDENCE_INTEGRITY_MISMATCH",
        `Bound reallocation evidence for ${binding.candidateId} is not actually decision-grade`
      );
    }
    const currentEvidence = new Set(exactUniqueStrings(current.candidate.evidenceRefs, `${binding.candidateId}.currentEvidenceRefs`));
    const currentSources = new Set(exactUniqueStrings(current.candidate.sourceRefs, `${binding.candidateId}.currentSourceRefs`));
    if (evidenceRefs.some((ref) => !currentEvidence.has(ref)) || sourceRefs.some((ref) => !currentSources.has(ref))) {
      throw new ChiefOfStaffReallocationOverlayError(
        "BOUND_EVIDENCE_DRIFT",
        `Bound reallocation evidence for ${binding.candidateId} is absent from the current candidate`
      );
    }
  } else if (binding.state === "VERIFY") {
    if (bindingIssues.length === 0) {
      throw new ChiefOfStaffReallocationOverlayError(
        "VERIFY_BINDING_WITHOUT_ISSUE",
        `Verification binding for ${binding.candidateId} must preserve its unresolved issue`
      );
    }
  } else {
    throw new ChiefOfStaffReallocationOverlayError(
      "INVALID_BINDING_STATE",
      `${binding.candidateId} has an invalid binding state`
    );
  }
}

function validateChange(
  lineage: DecisionPortfolioReallocationLineageV1,
  previous: DecisionPortfolioV1,
  current: DecisionPortfolioV1
): void {
  const expectedSelectedAdded = difference(current.selectedIds, previous.selectedIds);
  const expectedSelectedRemoved = difference(previous.selectedIds, current.selectedIds);
  const expectedNewKeegan = difference(current.keeganDecisionIds, previous.keeganDecisionIds);
  const expectedClearedKeegan = difference(previous.keeganDecisionIds, current.keeganDecisionIds);
  if (
    !sameStrings(lineage.change.selectedAddedIds, expectedSelectedAdded)
    || !sameStrings(lineage.change.selectedRemovedIds, expectedSelectedRemoved)
    || !sameStrings(lineage.change.newKeeganDecisionIds, expectedNewKeegan)
    || !sameStrings(lineage.change.clearedKeeganDecisionIds, expectedClearedKeegan)
  ) {
    throw new ChiefOfStaffReallocationOverlayError(
      "LINEAGE_CHANGE_MISMATCH",
      "Reallocation lineage change summary does not match the exact portfolio pair"
    );
  }
  const selectionChanged = expectedSelectedAdded.length > 0 || expectedSelectedRemoved.length > 0;
  if (selectionChanged !== (lineage.change.status === "SELECTION_CHANGE")) {
    throw new ChiefOfStaffReallocationOverlayError(
      "LINEAGE_CHANGE_STATUS_MISMATCH",
      "Reallocation lineage selection-change status does not match the exact portfolio pair"
    );
  }
}

function validateAudit(lineage: DecisionPortfolioReallocationLineageV1): void {
  const bound = lineage.evidenceBindings.filter((binding) => binding.state === "BOUND").length;
  const unresolved = lineage.evidenceBindings.length - bound;
  if (
    lineage.audit.reviewedCandidates !== lineage.reviewedCandidateIds.length
    || lineage.audit.reconsiderCandidates !== lineage.reconsiderCandidateIds.length
    || lineage.audit.verificationCandidates !== lineage.verificationCandidateIds.length
    || lineage.audit.boundReconsiderCandidates !== bound
    || lineage.audit.unresolvedBindings !== unresolved
  ) {
    throw new ChiefOfStaffReallocationOverlayError(
      "LINEAGE_AUDIT_MISMATCH",
      "Reallocation lineage audit does not match its underlying records"
    );
  }
}

function validateStatus(lineage: DecisionPortfolioReallocationLineageV1): ChiefOfStaffReallocationOverlayStateV1 {
  const unresolvedBindings = lineage.evidenceBindings.filter((binding) => binding.state !== "BOUND").length;
  switch (lineage.status) {
    case "NO_REBUILD_REQUIRED":
      if (lineage.lineageReady || lineage.rebuildObserved || lineage.reconsiderCandidateIds.length > 0) {
        throw new ChiefOfStaffReallocationOverlayError("LINEAGE_STATUS_MISMATCH", "No-rebuild lineage state is inconsistent");
      }
      return "NO_REBUILD_REQUIRED";
    case "VERIFICATION_REQUIRED":
      if (lineage.lineageReady || lineage.verificationCandidateIds.length === 0) {
        throw new ChiefOfStaffReallocationOverlayError("LINEAGE_STATUS_MISMATCH", "Verification lineage state is inconsistent");
      }
      return "VERIFY_SOURCE";
    case "WAITING_FOR_REBUILD":
      if (lineage.lineageReady || lineage.rebuildObserved || lineage.reconsiderCandidateIds.length === 0) {
        throw new ChiefOfStaffReallocationOverlayError("LINEAGE_STATUS_MISMATCH", "Waiting lineage state is inconsistent");
      }
      return "WAITING_FOR_REBUILD";
    case "EVIDENCE_BINDING_REQUIRED":
      if (lineage.lineageReady || !lineage.rebuildObserved || unresolvedBindings === 0) {
        throw new ChiefOfStaffReallocationOverlayError("LINEAGE_STATUS_MISMATCH", "Evidence-binding lineage state is inconsistent");
      }
      return "VERIFY_EVIDENCE_BINDING";
    case "LINEAGE_READY_NO_SELECTION_CHANGE":
      if (!lineage.lineageReady || !lineage.rebuildObserved || unresolvedBindings > 0 || lineage.change.status === "SELECTION_CHANGE") {
        throw new ChiefOfStaffReallocationOverlayError("LINEAGE_STATUS_MISMATCH", "Ready/no-selection-change lineage state is inconsistent");
      }
      return "READY_NO_SELECTION_CHANGE";
    case "LINEAGE_READY_SELECTION_CHANGE":
      if (!lineage.lineageReady || !lineage.rebuildObserved || unresolvedBindings > 0 || lineage.change.status !== "SELECTION_CHANGE") {
        throw new ChiefOfStaffReallocationOverlayError("LINEAGE_STATUS_MISMATCH", "Ready/selection-change lineage state is inconsistent");
      }
      return "READY_SELECTION_CHANGE";
    default:
      throw new ChiefOfStaffReallocationOverlayError("INVALID_LINEAGE_STATUS", "Reallocation lineage status is invalid");
  }
}

function resolveChangeItems(
  ids: readonly string[],
  items: ReadonlyMap<string, DecisionPortfolioItemV1>,
  label: string
): readonly ChiefOfStaffReallocationChangeItemV1[] {
  return Object.freeze(ids.map((candidateId) => {
    const item = items.get(candidateId);
    if (!item) {
      throw new ChiefOfStaffReallocationOverlayError(
        "CHANGE_CANDIDATE_MISSING",
        `${label} references candidate ${candidateId} outside its canonical portfolio`
      );
    }
    return Object.freeze({ candidateId, title: text(item.candidate.title, `${candidateId}.title`) });
  }));
}

export function compileChiefOfStaffReallocationOverlayV1(input: Readonly<{
  previous: DecisionPortfolioV1;
  current: DecisionPortfolioV1;
  lineage: DecisionPortfolioReallocationLineageV1;
  generatedAt: string;
  maximumLineageAgeMs: number;
}>): ChiefOfStaffReallocationOverlayV1 {
  const previousById = validatePortfolio(input.previous, "previous");
  const currentById = validatePortfolio(input.current, "current");
  validateLineageIdentity(input.lineage, input.previous, input.current);
  validateLineageSets(input.lineage);
  for (const binding of input.lineage.evidenceBindings) validateBinding(binding, currentById);
  validateChange(input.lineage, input.previous, input.current);
  validateAudit(input.lineage);
  const state = validateStatus(input.lineage);

  const previousAt = canonicalTimestamp(input.previous.generatedAt, "previous.generatedAt");
  const currentAt = canonicalTimestamp(input.current.generatedAt, "current.generatedAt");
  const certifiedAt = canonicalTimestamp(input.lineage.certifiedAt, "lineage.certifiedAt");
  const generatedAt = canonicalTimestamp(input.generatedAt, "generatedAt");
  const maximumLineageAgeMs = positiveFinite(input.maximumLineageAgeMs, "maximumLineageAgeMs");
  if (Date.parse(currentAt) < Date.parse(previousAt)) {
    throw new ChiefOfStaffReallocationOverlayError(
      "PORTFOLIO_CHRONOLOGY_INVALID",
      "Current portfolio cannot predate the previous portfolio"
    );
  }
  if (Date.parse(certifiedAt) < Date.parse(currentAt)) {
    throw new ChiefOfStaffReallocationOverlayError(
      "LINEAGE_BEFORE_CURRENT_PORTFOLIO",
      "Reallocation lineage cannot predate the current portfolio it certifies"
    );
  }
  const sourceAgeMs = Date.parse(generatedAt) - Date.parse(certifiedAt);
  if (sourceAgeMs < 0) {
    throw new ChiefOfStaffReallocationOverlayError(
      "LINEAGE_FROM_FUTURE",
      "Reallocation lineage cannot be newer than the overlay decision time"
    );
  }
  if (sourceAgeMs > maximumLineageAgeMs) {
    throw new ChiefOfStaffReallocationOverlayError(
      "STALE_LINEAGE",
      "Reallocation lineage is older than the caller-owned freshness policy"
    );
  }

  const reviewSignals = Object.freeze(input.lineage.evidenceBindings.map((binding) => {
    const item = currentById.get(binding.candidateId) ?? previousById.get(binding.candidateId);
    if (!item) {
      throw new ChiefOfStaffReallocationOverlayError(
        "REVIEW_CANDIDATE_MISSING",
        `Reviewed candidate ${binding.candidateId} is absent from both canonical portfolios`
      );
    }
    return Object.freeze({
      candidateId: binding.candidateId,
      title: text(item.candidate.title, `${binding.candidateId}.title`),
      outcomeId: binding.outcomeId,
      previousDisposition: binding.previousDisposition,
      currentDisposition: binding.currentDisposition,
      currentEvidenceState: binding.currentEvidenceState,
      recordedAttributionClass: binding.recordedAttributionClass,
      evidenceRefs: Object.freeze([...binding.evidenceRefs]),
      sourceRefs: Object.freeze([...binding.sourceRefs]),
      missingEvidenceRefs: Object.freeze([...binding.missingEvidenceRefs]),
      missingSourceRefs: Object.freeze([...binding.missingSourceRefs]),
      bindingIssues: Object.freeze([...binding.bindingIssues]),
      state: binding.state,
      causalInterpretation: "NOT_ESTABLISHED" as const,
      confidence: "NOT_ESTABLISHED" as const,
      monetaryValue: null
    });
  }));

  const selectedAdded = resolveChangeItems(input.lineage.change.selectedAddedIds, currentById, "selectedAddedIds");
  const selectedRemoved = resolveChangeItems(input.lineage.change.selectedRemovedIds, previousById, "selectedRemovedIds");
  const newKeeganDecisions = resolveChangeItems(input.lineage.change.newKeeganDecisionIds, currentById, "newKeeganDecisionIds");
  const clearedKeeganDecisions = resolveChangeItems(input.lineage.change.clearedKeeganDecisionIds, previousById, "clearedKeeganDecisionIds");

  const evidenceRefs = uniqueSorted(reviewSignals.flatMap((signal) => signal.evidenceRefs));
  const sourceRefs = uniqueSorted(reviewSignals.flatMap((signal) => signal.sourceRefs));

  return deepFreeze({
    contractVersion: CHIEF_OF_STAFF_REALLOCATION_OVERLAY_CONTRACT_VERSION_V1,
    policyVersion: CHIEF_OF_STAFF_REALLOCATION_OVERLAY_POLICY_VERSION_V1,
    generatedAt,
    maximumLineageAgeMs,
    sourceAgeMs,
    state,
    source: {
      lineageId: text(input.lineage.lineageId, "lineage.lineageId"),
      sourceReviewId: text(input.lineage.sourceReviewId, "lineage.sourceReviewId"),
      previousPortfolioId: input.previous.portfolioId,
      currentPortfolioId: input.current.portfolioId,
      certifiedAt
    },
    summary: {
      reviewedCandidates: input.lineage.audit.reviewedCandidates,
      reconsiderCandidates: input.lineage.audit.reconsiderCandidates,
      verificationCandidates: input.lineage.audit.verificationCandidates,
      boundReconsiderCandidates: input.lineage.audit.boundReconsiderCandidates,
      unresolvedBindings: input.lineage.audit.unresolvedBindings,
      selectedAdded: selectedAdded.length,
      selectedRemoved: selectedRemoved.length,
      newKeeganDecisions: newKeeganDecisions.length,
      clearedKeeganDecisions: clearedKeeganDecisions.length
    },
    reviewSignals,
    portfolioChanges: {
      selectedAdded,
      selectedRemoved,
      newKeeganDecisions,
      clearedKeeganDecisions
    },
    interpretation: {
      selectionChangedAfterReview: input.lineage.interpretation.selectionChangedAfterReview,
      selectionChangeCause: "NOT_ESTABLISHED",
      rankChangeCause: "NOT_ESTABLISHED",
      outcomeCause: "NOT_ESTABLISHED",
      associationOnly: true
    },
    evidenceRefs,
    sourceRefs,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
