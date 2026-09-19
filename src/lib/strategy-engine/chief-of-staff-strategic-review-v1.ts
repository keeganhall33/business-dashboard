import {
  CHIEF_OF_STAFF_LEARNING_OVERLAY_POLICY_VERSION_V1,
  CHIEF_OF_STAFF_LEARNING_OVERLAY_VERSION_V1,
  type ChiefOfStaffLearningOverlaySignalV1,
  type ChiefOfStaffLearningOverlayV1
} from "@/lib/strategy-engine/chief-of-staff-learning-overlay-v1";
import {
  CHIEF_OF_STAFF_PORTFOLIO_BRIEF_POLICY_V1,
  type ChiefOfStaffPortfolioActionV1,
  type ChiefOfStaffPortfolioBlockedWorkV1,
  type ChiefOfStaffPortfolioBriefV1
} from "@/lib/strategy-engine/chief-of-staff-portfolio-brief-v1";
import {
  COUNTERFACTUAL_PORTFOLIO_REVIEW_POLICY_VERSION_V1,
  COUNTERFACTUAL_PORTFOLIO_REVIEW_VERSION_V1,
  type CounterfactualPortfolioReviewV1
} from "@/lib/strategy-engine/counterfactual-portfolio-review-v1";
import {
  EXPERIMENT_REALLOCATION_REVIEW_POLICY_VERSION_V1,
  EXPERIMENT_REALLOCATION_REVIEW_VERSION_V1,
  type ExperimentReallocationReviewV1
} from "@/lib/strategy-engine/experiment-reallocation-review-v1";

export const CHIEF_OF_STAFF_STRATEGIC_REVIEW_VERSION_V1 =
  "ChiefOfStaffStrategicReviewV1" as const;
export const CHIEF_OF_STAFF_STRATEGIC_REVIEW_POLICY_VERSION_V1 =
  "chief_of_staff_strategic_review_v1.0.0" as const;

const MAX_ITEMS = 2_000;
const MAX_REFS = 8_000;

export type ChiefOfStaffStrategicReviewQueueV1 =
  | "KEEGAN_DECISION"
  | "JEEVES_PREPARATION"
  | "INTERNAL_REVIEW"
  | "OWNER_ACTION"
  | "BLOCKED_OR_REVALIDATE";

export type ChiefOfStaffStrategicSignalOriginV1 =
  | "EXPERIMENT_REALLOCATION"
  | "COUNTERFACTUAL_REVIEW";

export type ChiefOfStaffStrategicSignalV1 = Readonly<{
  signalId: string;
  origin: ChiefOfStaffStrategicSignalOriginV1;
  sourceReviewId: string;
  candidateId: string;
  state: string;
  reasonCodes: readonly string[];
  nextInternalStep: string | null;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  inferredOutcome: null;
}>;

export type ChiefOfStaffStrategicDecisionContextV1 = Readonly<{
  candidateId: string;
  title: string;
  rank: number;
  owner: ChiefOfStaffPortfolioActionV1["owner"];
  approvalClass: ChiefOfStaffPortfolioActionV1["approvalClass"];
  portfolioQueue: ChiefOfStaffStrategicReviewQueueV1;
  learningSignals: readonly ChiefOfStaffLearningOverlaySignalV1[];
  strategicSignals: readonly ChiefOfStaffStrategicSignalV1[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  inferredOutcome: null;
}>;

export type ChiefOfStaffStrategicReviewSourceHealthV1 = Readonly<{
  source: "PORTFOLIO_BRIEF" | "LEARNING_OVERLAY" | "EXPERIMENT_REALLOCATION" | "COUNTERFACTUAL_REVIEW";
  sourceId: string | null;
  generatedAt: string | null;
  ageMs: number | null;
  accepted: boolean;
}>;

export type ChiefOfStaffStrategicReviewV1 = Readonly<{
  contractVersion: typeof CHIEF_OF_STAFF_STRATEGIC_REVIEW_VERSION_V1;
  policyVersion: typeof CHIEF_OF_STAFF_STRATEGIC_REVIEW_POLICY_VERSION_V1;
  generatedAt: string;
  maximumSourceAgeMs: number;
  state: "READY" | "VERIFY_SOURCE";
  sourcePortfolioId: string | null;
  sourceHealth: readonly ChiefOfStaffStrategicReviewSourceHealthV1[];
  verificationReasons: readonly string[];
  currentDecisionContext: readonly ChiefOfStaffStrategicDecisionContextV1[];
  unmatchedStrategicSignals: readonly ChiefOfStaffStrategicSignalV1[];
  summary: Readonly<{
    currentPortfolioItems: number;
    currentItemsWithLearningSignals: number;
    currentItemsWithStrategicSignals: number;
    experimentSignals: number;
    counterfactualSignals: number;
    reallocationReviewSignals: number;
    attributionEvidenceNeededSignals: number;
    counterfactualKeeganReviewSignals: number;
    verificationSignals: number;
    unmatchedStrategicSignals: number;
  }>;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  inferredOutcome: null;
  limitations: readonly string[];
  authority: Readonly<{
    synthesisOnly: true;
    persistenceAuthorized: false;
    portfolioMutationAuthorized: false;
    allocationChangeAuthorized: false;
    scenarioSelectionAuthorized: false;
    experimentExecutionAuthorized: false;
    campaignExecutionAuthorized: false;
    measurementExecutionAuthorized: false;
    learningPromotionAuthorized: false;
    policyPromotionAuthorized: false;
    spendChangeAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
    causalAttributionAuthorized: false;
  }>;
}>;

export type ChiefOfStaffStrategicReviewInputV1 = Readonly<{
  portfolioBrief: ChiefOfStaffPortfolioBriefV1;
  learningOverlay: ChiefOfStaffLearningOverlayV1;
  experimentReviews: readonly ExperimentReallocationReviewV1[];
  counterfactualReviews: readonly CounterfactualPortfolioReviewV1[];
  generatedAt: string;
  maximumSourceAgeMs: number;
}>;

const PORTFOLIO_AUTHORITY = Object.freeze({
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
});

const LEARNING_AUTHORITY = Object.freeze({
  synthesisOnly: true,
  persistenceAuthorized: false,
  decisionMutationAuthorized: false,
  assumptionMutationAuthorized: false,
  portfolioMutationAuthorized: false,
  reallocationAuthorized: false,
  evidenceCollectionAuthorized: false,
  measurementExecutionAuthorized: false,
  learningPromotionAuthorized: false,
  policyPromotionAuthorized: false,
  pricingChangeAuthorized: false,
  negotiationActionAuthorized: false,
  campaignExecutionAuthorized: false,
  experimentExecutionAuthorized: false,
  externalActionAuthorized: false,
  approvalBypassAuthorized: false
});

const EXPERIMENT_AUTHORITY = Object.freeze({
  analysisOnly: true,
  portfolioMutationAuthorized: false,
  allocationChangeAuthorized: false,
  experimentExecutionAuthorized: false,
  experimentStopAuthorized: false,
  experimentScaleAuthorized: false,
  spendChangeAuthorized: false,
  priceChangeAuthorized: false,
  publishAuthorized: false,
  outreachAuthorized: false,
  policyPromotionAuthorized: false,
  confidenceMutationAuthorized: false,
  monetaryMutationAuthorized: false,
  persistenceAuthorized: false,
  externalActionAuthorized: false,
  approvalBypassAuthorized: false
});

const COUNTERFACTUAL_AUTHORITY = Object.freeze({
  analysisOnly: true,
  scenarioSelectionAuthorized: false,
  portfolioMutationAuthorized: false,
  allocationChangeAuthorized: false,
  scoreMutationAuthorized: false,
  confidenceMutationAuthorized: false,
  monetaryMutationAuthorized: false,
  experimentExecutionAuthorized: false,
  campaignExecutionAuthorized: false,
  pricingChangeAuthorized: false,
  negotiationActionAuthorized: false,
  externalActionAuthorized: false,
  persistenceAuthorized: false,
  approvalBypassAuthorized: false,
  causalAttributionAuthorized: false
});

const AUTHORITY = Object.freeze({
  synthesisOnly: true as const,
  persistenceAuthorized: false as const,
  portfolioMutationAuthorized: false as const,
  allocationChangeAuthorized: false as const,
  scenarioSelectionAuthorized: false as const,
  experimentExecutionAuthorized: false as const,
  campaignExecutionAuthorized: false as const,
  measurementExecutionAuthorized: false as const,
  learningPromotionAuthorized: false as const,
  policyPromotionAuthorized: false as const,
  spendChangeAuthorized: false as const,
  pricingChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const,
  causalAttributionAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "This projection joins existing governed portfolio, Company Brain, experiment-review, and counterfactual-review outputs. It does not create a new allocator, experiment engine, scenario engine, memory store, or source of truth.",
  "A review signal means only that an existing governed source says the exact canonical candidate requires review, verification, or additional evidence. It is not an instruction to reallocate, stop, scale, select a scenario, or take external action.",
  "STOP, SCALE, counterfactual comparison, and exact decision matches preserve upstream semantics only. They do not establish causality, confidence, monetary value, expected return, priority, or a future outcome.",
  "Experiment and counterfactual signals attach only by exact canonical candidate id and exact source portfolio id. Fuzzy title, category, relationship, or semantic matching is prohibited.",
  "No portfolio mutation, allocation change, scenario selection, experiment or campaign execution, measurement execution, learning or policy promotion, spend, pricing, negotiation, external action, or approval bypass is authorized."
] as const);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function canonicalTimestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis)) return null;
  const canonical = new Date(millis).toISOString();
  return canonical === normalized ? canonical : null;
}

function positiveFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function uniqueStrings(value: unknown, maximum = MAX_REFS): readonly string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const normalized: string[] = [];
  for (const entry of value) {
    const parsed = text(entry);
    if (!parsed) return null;
    normalized.push(parsed);
  }
  if (new Set(normalized).size !== normalized.length) return null;
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function exactAuthority(value: unknown, expected: Readonly<Record<string, boolean>>): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
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

function sourceAge(
  label: string,
  generatedAt: unknown,
  decisionAtMs: number,
  maximumSourceAgeMs: number,
  reasons: Set<string>
): { generatedAt: string | null; ageMs: number | null; fresh: boolean } {
  const parsed = canonicalTimestamp(generatedAt);
  if (!parsed) {
    reasons.add(`${label}_SOURCE_TIMESTAMP_INVALID`);
    return { generatedAt: null, ageMs: null, fresh: false };
  }
  const ageMs = decisionAtMs - Date.parse(parsed);
  if (ageMs < 0) {
    reasons.add(`${label}_SOURCE_FROM_FUTURE`);
    return { generatedAt: parsed, ageMs, fresh: false };
  }
  if (ageMs > maximumSourceAgeMs) {
    reasons.add(`${label}_SOURCE_STALE`);
    return { generatedAt: parsed, ageMs, fresh: false };
  }
  return { generatedAt: parsed, ageMs, fresh: true };
}

function currentPortfolioItems(brief: ChiefOfStaffPortfolioBriefV1): Array<{
  item: ChiefOfStaffPortfolioActionV1 | ChiefOfStaffPortfolioBlockedWorkV1;
  queue: ChiefOfStaffStrategicReviewQueueV1;
}> {
  return [
    ...brief.decisionsForKeegan.map((item) => ({ item, queue: "KEEGAN_DECISION" as const })),
    ...brief.jeevesPreparationReady.map((item) => ({ item, queue: "JEEVES_PREPARATION" as const })),
    ...brief.internalReviewReady.map((item) => ({ item, queue: "INTERNAL_REVIEW" as const })),
    ...brief.ownerActionReady.map((item) => ({ item, queue: "OWNER_ACTION" as const })),
    ...brief.blockedWork.map((item) => ({ item, queue: "BLOCKED_OR_REVALIDATE" as const }))
  ];
}

function validatePortfolioBrief(brief: ChiefOfStaffPortfolioBriefV1, reasons: Set<string>): boolean {
  let valid = true;
  const reject = (reason: string) => {
    reasons.add(`PORTFOLIO_BRIEF_${reason}`);
    valid = false;
  };
  if (brief?.contractVersion !== "ChiefOfStaffPortfolioBriefV1"
    || brief?.policyVersion !== CHIEF_OF_STAFF_PORTFOLIO_BRIEF_POLICY_V1) reject("CONTRACT_INVALID");
  if (!exactAuthority(brief?.authority, PORTFOLIO_AUTHORITY)) reject("AUTHORITY_WIDENED");
  const collections = [
    brief?.decisionsForKeegan,
    brief?.jeevesPreparationReady,
    brief?.internalReviewReady,
    brief?.ownerActionReady,
    brief?.blockedWork
  ];
  if (collections.some((value) => !Array.isArray(value))) {
    reject("ITEMS_INVALID");
    return false;
  }
  const items = currentPortfolioItems(brief);
  if (items.length > MAX_ITEMS) reject("ITEM_LIMIT_EXCEEDED");
  const ids = items.map(({ item }) => item.candidateId);
  if (new Set(ids).size !== ids.length) reject("DUPLICATE_CURRENT_CANDIDATE");
  for (const { item } of items) {
    if (!text(item.candidateId) || !text(item.title)
      || uniqueStrings(item.evidenceRefs) == null || uniqueStrings(item.sourceRefs) == null) {
      reject("ITEM_INVALID");
      break;
    }
  }
  return valid;
}

function validateLearningOverlay(
  overlay: ChiefOfStaffLearningOverlayV1,
  portfolioId: string,
  reasons: Set<string>
): boolean {
  let valid = true;
  const reject = (reason: string) => {
    reasons.add(`LEARNING_OVERLAY_${reason}`);
    valid = false;
  };
  if (overlay?.contractVersion !== CHIEF_OF_STAFF_LEARNING_OVERLAY_VERSION_V1
    || overlay?.policyVersion !== CHIEF_OF_STAFF_LEARNING_OVERLAY_POLICY_VERSION_V1) reject("CONTRACT_INVALID");
  if (overlay?.state !== "READY") reject("SOURCE_REQUIRES_VERIFICATION");
  if (!exactAuthority(overlay?.authority, LEARNING_AUTHORITY)) reject("AUTHORITY_WIDENED");
  if (overlay?.causalInterpretation !== "NOT_ESTABLISHED"
    || overlay?.confidence !== "NOT_ESTABLISHED"
    || overlay?.monetaryValue !== null
    || overlay?.inferredOutcome !== null) reject("INTERPRETATION_WIDENED");
  if (!Array.isArray(overlay?.sourceHealth)
    || !Array.isArray(overlay?.currentDecisionContext)
    || !Array.isArray(overlay?.unmatchedKnowledgeSignals)) {
    reject("ITEMS_INVALID");
    return false;
  }
  const linkedPortfolio = overlay.sourceHealth.find((source) => source.source === "PORTFOLIO_BRIEF");
  if (!linkedPortfolio || linkedPortfolio.sourceId !== portfolioId || linkedPortfolio.accepted !== true) {
    reject("PORTFOLIO_IDENTITY_MISMATCH");
  }
  const contexts = overlay.currentDecisionContext;
  if (contexts.length > MAX_ITEMS || new Set(contexts.map((item) => item.candidateId)).size !== contexts.length) {
    reject("CURRENT_CONTEXT_INVALID");
  }
  for (const context of contexts) {
    if (!text(context.candidateId) || !Array.isArray(context.signals)) {
      reject("CURRENT_CONTEXT_INVALID");
      break;
    }
    for (const signal of context.signals) {
      if (signal.decisionId !== context.candidateId
        || signal.causalInterpretation !== "NOT_ESTABLISHED"
        || signal.confidence !== "NOT_ESTABLISHED"
        || signal.monetaryValue !== null
        || uniqueStrings(signal.evidenceRefs) == null
        || uniqueStrings(signal.sourceRefs) == null) {
        reject("LEARNING_SIGNAL_INVALID");
        break;
      }
    }
  }
  return valid;
}

function validateExperimentReview(
  review: ExperimentReallocationReviewV1,
  portfolioId: string,
  reasons: Set<string>
): boolean {
  let valid = true;
  const sourceId = text(review?.reviewId);
  const reject = (reason: string) => {
    reasons.add(`EXPERIMENT_REALLOCATION_${sourceId ?? "UNKNOWN"}_${reason}`);
    valid = false;
  };
  if (review?.contractVersion !== EXPERIMENT_REALLOCATION_REVIEW_VERSION_V1
    || review?.policyVersion !== EXPERIMENT_REALLOCATION_REVIEW_POLICY_VERSION_V1) reject("CONTRACT_INVALID");
  if (!sourceId || !text(review?.sourceExperimentPortfolioId)) reject("SOURCE_ID_INVALID");
  if (review?.sourceDecisionPortfolioId !== portfolioId) reject("PORTFOLIO_IDENTITY_MISMATCH");
  if (!exactAuthority(review?.authority, EXPERIMENT_AUTHORITY)) reject("AUTHORITY_WIDENED");
  if (!Array.isArray(review?.signals) || review.signals.length > MAX_ITEMS) {
    reject("SIGNALS_INVALID");
    return false;
  }
  const ids = review.signals.map((signal) => signal.experimentId);
  if (new Set(ids).size !== ids.length) reject("DUPLICATE_EXPERIMENT_SIGNAL");
  for (const signal of review.signals) {
    if (!text(signal.experimentId) || !text(signal.candidateId)
      || signal.causalInterpretation !== "NOT_INFERRED_HERE"
      || signal.confidence !== "NOT_ESTABLISHED"
      || signal.monetaryValue !== null
      || signal.predictedOutcome !== null
      || uniqueStrings(signal.reasonCodes) == null
      || uniqueStrings(signal.candidateEvidenceRefs) == null
      || uniqueStrings(signal.candidateSourceRefs) == null) {
      reject("SIGNAL_INVALID");
      break;
    }
  }
  return valid;
}

function validateCounterfactualReview(
  review: CounterfactualPortfolioReviewV1,
  portfolioId: string,
  reasons: Set<string>
): boolean {
  let valid = true;
  const sourceId = text(review?.reviewId);
  const reject = (reason: string) => {
    reasons.add(`COUNTERFACTUAL_REVIEW_${sourceId ?? "UNKNOWN"}_${reason}`);
    valid = false;
  };
  if (review?.contractVersion !== COUNTERFACTUAL_PORTFOLIO_REVIEW_VERSION_V1
    || review?.policyVersion !== COUNTERFACTUAL_PORTFOLIO_REVIEW_POLICY_VERSION_V1) reject("CONTRACT_INVALID");
  if (!sourceId || !text(review?.candidateId)) reject("SOURCE_ID_INVALID");
  if (review?.sourcePortfolioId !== portfolioId) reject("PORTFOLIO_IDENTITY_MISMATCH");
  if (!exactAuthority(review?.authority, COUNTERFACTUAL_AUTHORITY)) reject("AUTHORITY_WIDENED");
  if (review?.scenarioWinner !== null
    || review?.recommendedDisposition !== null
    || review?.confidence !== "NOT_ESTABLISHED"
    || review?.monetaryValue !== null
    || review?.outcomePrediction !== null
    || review?.causalInterpretation !== "NOT_ESTABLISHED") reject("INTERPRETATION_WIDENED");
  if (uniqueStrings(review?.reasonCodes) == null
    || uniqueStrings(review?.evidenceRefs) == null
    || uniqueStrings(review?.sourceRefs) == null) reject("REFS_INVALID");
  return valid;
}

function experimentSignal(
  review: ExperimentReallocationReviewV1,
  signal: ExperimentReallocationReviewV1["signals"][number]
): ChiefOfStaffStrategicSignalV1 | null {
  if (signal.state === "NO_REALLOCATION_SIGNAL") return null;
  return deepFreeze({
    signalId: `experiment-reallocation:${review.reviewId}:${signal.experimentId}`,
    origin: "EXPERIMENT_REALLOCATION",
    sourceReviewId: review.reviewId,
    candidateId: signal.candidateId,
    state: signal.state,
    reasonCodes: [...signal.reasonCodes],
    nextInternalStep: signal.nextInternalStep,
    evidenceRefs: [...signal.candidateEvidenceRefs],
    sourceRefs: [review.sourceExperimentPortfolioId, ...review.portfolioSourceRefs, ...signal.candidateSourceRefs],
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    inferredOutcome: null
  });
}

function counterfactualSignal(review: CounterfactualPortfolioReviewV1): ChiefOfStaffStrategicSignalV1 {
  return deepFreeze({
    signalId: `counterfactual-review:${review.reviewId}`,
    origin: "COUNTERFACTUAL_REVIEW",
    sourceReviewId: review.reviewId,
    candidateId: review.candidateId,
    state: review.state,
    reasonCodes: [...review.reasonCodes],
    nextInternalStep: review.nextInternalStep,
    evidenceRefs: [...review.evidenceRefs],
    sourceRefs: [review.sourceCounterfactualReviewId, ...review.sourceRefs],
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    inferredOutcome: null
  });
}

function sortStrategicSignals(values: readonly ChiefOfStaffStrategicSignalV1[]): readonly ChiefOfStaffStrategicSignalV1[] {
  return Object.freeze([...values].sort((a, b) => {
    const candidate = a.candidateId.localeCompare(b.candidateId);
    if (candidate !== 0) return candidate;
    const origin = a.origin.localeCompare(b.origin);
    if (origin !== 0) return origin;
    return a.signalId.localeCompare(b.signalId);
  }));
}

export function compileChiefOfStaffStrategicReviewV1(
  input: ChiefOfStaffStrategicReviewInputV1
): ChiefOfStaffStrategicReviewV1 {
  const generatedAt = canonicalTimestamp(input?.generatedAt);
  if (!generatedAt) throw new Error("CHIEF_OF_STAFF_STRATEGIC_REVIEW_INVALID_GENERATED_AT");
  const maximumSourceAgeMs = positiveFinite(input?.maximumSourceAgeMs);
  if (maximumSourceAgeMs == null) throw new Error("CHIEF_OF_STAFF_STRATEGIC_REVIEW_INVALID_FRESHNESS_POLICY");
  if (!Array.isArray(input?.experimentReviews) || input.experimentReviews.length > MAX_ITEMS
    || !Array.isArray(input?.counterfactualReviews) || input.counterfactualReviews.length > MAX_ITEMS) {
    throw new Error("CHIEF_OF_STAFF_STRATEGIC_REVIEW_INVALID_SOURCE_COLLECTION");
  }

  const generatedAtMs = Date.parse(generatedAt);
  const reasons = new Set<string>();
  const portfolioId = text(input?.portfolioBrief?.sourcePortfolio?.portfolioId);
  if (!portfolioId) reasons.add("PORTFOLIO_BRIEF_SOURCE_ID_INVALID");

  const portfolioAge = sourceAge("PORTFOLIO_BRIEF", input?.portfolioBrief?.generatedAt, generatedAtMs, maximumSourceAgeMs, reasons);
  const overlayAge = sourceAge("LEARNING_OVERLAY", input?.learningOverlay?.generatedAt, generatedAtMs, maximumSourceAgeMs, reasons);
  const portfolioAccepted = Boolean(portfolioId) && portfolioAge.fresh
    && validatePortfolioBrief(input.portfolioBrief, reasons);
  const overlayAccepted = Boolean(portfolioId) && overlayAge.fresh
    && validateLearningOverlay(input.learningOverlay, portfolioId ?? "", reasons);

  const sourceHealth: ChiefOfStaffStrategicReviewSourceHealthV1[] = [
    {
      source: "PORTFOLIO_BRIEF",
      sourceId: portfolioId,
      generatedAt: portfolioAge.generatedAt,
      ageMs: portfolioAge.ageMs,
      accepted: portfolioAccepted
    },
    {
      source: "LEARNING_OVERLAY",
      sourceId: input?.learningOverlay?.contractVersion === CHIEF_OF_STAFF_LEARNING_OVERLAY_VERSION_V1
        ? `${input.learningOverlay.contractVersion}:${input.learningOverlay.generatedAt}`
        : null,
      generatedAt: overlayAge.generatedAt,
      ageMs: overlayAge.ageMs,
      accepted: overlayAccepted
    }
  ];

  const experimentSignals: ChiefOfStaffStrategicSignalV1[] = [];
  const experimentReviewIds = new Set<string>();
  for (const review of input.experimentReviews) {
    const reviewId = text(review?.reviewId);
    if (reviewId && experimentReviewIds.has(reviewId)) {
      reasons.add(`EXPERIMENT_REALLOCATION_${reviewId}_DUPLICATE_REVIEW_ID`);
    }
    if (reviewId) experimentReviewIds.add(reviewId);
    const age = sourceAge(
      `EXPERIMENT_REALLOCATION_${reviewId ?? "UNKNOWN"}`,
      review?.reviewedAt,
      generatedAtMs,
      maximumSourceAgeMs,
      reasons
    );
    const accepted = Boolean(portfolioId) && Boolean(reviewId) && age.fresh
      && !reasons.has(`EXPERIMENT_REALLOCATION_${reviewId}_DUPLICATE_REVIEW_ID`)
      && validateExperimentReview(review, portfolioId ?? "", reasons);
    sourceHealth.push({
      source: "EXPERIMENT_REALLOCATION",
      sourceId: reviewId,
      generatedAt: age.generatedAt,
      ageMs: age.ageMs,
      accepted
    });
    if (accepted) {
      for (const signal of review.signals) {
        const projected = experimentSignal(review, signal);
        if (projected) experimentSignals.push(projected);
      }
    }
  }

  const counterfactualSignals: ChiefOfStaffStrategicSignalV1[] = [];
  const counterfactualReviewIds = new Set<string>();
  for (const review of input.counterfactualReviews) {
    const reviewId = text(review?.reviewId);
    if (reviewId && counterfactualReviewIds.has(reviewId)) {
      reasons.add(`COUNTERFACTUAL_REVIEW_${reviewId}_DUPLICATE_REVIEW_ID`);
    }
    if (reviewId) counterfactualReviewIds.add(reviewId);
    const age = sourceAge(
      `COUNTERFACTUAL_REVIEW_${reviewId ?? "UNKNOWN"}`,
      review?.generatedAt,
      generatedAtMs,
      maximumSourceAgeMs,
      reasons
    );
    const accepted = Boolean(portfolioId) && Boolean(reviewId) && age.fresh
      && !reasons.has(`COUNTERFACTUAL_REVIEW_${reviewId}_DUPLICATE_REVIEW_ID`)
      && validateCounterfactualReview(review, portfolioId ?? "", reasons);
    sourceHealth.push({
      source: "COUNTERFACTUAL_REVIEW",
      sourceId: reviewId,
      generatedAt: age.generatedAt,
      ageMs: age.ageMs,
      accepted
    });
    if (accepted) counterfactualSignals.push(counterfactualSignal(review));
  }

  const allStrategicSignals = sortStrategicSignals([...experimentSignals, ...counterfactualSignals]);
  if (allStrategicSignals.length > MAX_ITEMS) reasons.add("STRATEGIC_SIGNAL_LIMIT_EXCEEDED");
  const signalIds = allStrategicSignals.map((signal) => signal.signalId);
  if (new Set(signalIds).size !== signalIds.length) reasons.add("DUPLICATE_STRATEGIC_SIGNAL_ID");

  const portfolioItems = portfolioAccepted ? currentPortfolioItems(input.portfolioBrief) : [];
  const currentIds = new Set(portfolioItems.map(({ item }) => item.candidateId));
  const learningByDecision = new Map<string, readonly ChiefOfStaffLearningOverlaySignalV1[]>();
  if (overlayAccepted) {
    for (const context of input.learningOverlay.currentDecisionContext) {
      learningByDecision.set(context.candidateId, Object.freeze([...context.signals]));
    }
  }
  const strategicByDecision = new Map<string, ChiefOfStaffStrategicSignalV1[]>();
  for (const signal of allStrategicSignals) {
    const values = strategicByDecision.get(signal.candidateId) ?? [];
    values.push(signal);
    strategicByDecision.set(signal.candidateId, values);
  }

  const currentDecisionContext = Object.freeze(portfolioItems
    .map(({ item, queue }) => {
      const learningSignals = learningByDecision.get(item.candidateId) ?? Object.freeze([]);
      const strategicSignals = sortStrategicSignals(strategicByDecision.get(item.candidateId) ?? []);
      if (learningSignals.length === 0 && strategicSignals.length === 0) return null;
      return deepFreeze({
        candidateId: item.candidateId,
        title: item.title,
        rank: item.rank,
        owner: item.owner,
        approvalClass: item.approvalClass,
        portfolioQueue: queue,
        learningSignals,
        strategicSignals,
        causalInterpretation: "NOT_ESTABLISHED" as const,
        confidence: "NOT_ESTABLISHED" as const,
        monetaryValue: null,
        inferredOutcome: null
      });
    })
    .filter((item): item is ChiefOfStaffStrategicDecisionContextV1 => item !== null)
    .sort((a, b) => a.rank - b.rank || a.candidateId.localeCompare(b.candidateId)));

  const unmatchedStrategicSignals = sortStrategicSignals(
    allStrategicSignals.filter((signal) => !currentIds.has(signal.candidateId))
  );
  const verificationReasons = Object.freeze([...reasons].sort((a, b) => a.localeCompare(b)));
  const acceptedHealth = sourceHealth.filter((source) => source.accepted);
  const evidenceRefs = Object.freeze([
    ...new Set([
      ...(overlayAccepted ? input.learningOverlay.evidenceRefs : []),
      ...allStrategicSignals.flatMap((signal) => signal.evidenceRefs)
    ])
  ].sort((a, b) => a.localeCompare(b)));
  const sourceRefs = Object.freeze([
    ...new Set([
      ...(portfolioAccepted ? input.portfolioBrief.sourceRefs : []),
      ...(overlayAccepted ? input.learningOverlay.sourceRefs : []),
      ...allStrategicSignals.flatMap((signal) => signal.sourceRefs),
      ...acceptedHealth.map((source) => source.sourceId).filter((value): value is string => value !== null)
    ])
  ].sort((a, b) => a.localeCompare(b)));

  const result: ChiefOfStaffStrategicReviewV1 = {
    contractVersion: CHIEF_OF_STAFF_STRATEGIC_REVIEW_VERSION_V1,
    policyVersion: CHIEF_OF_STAFF_STRATEGIC_REVIEW_POLICY_VERSION_V1,
    generatedAt,
    maximumSourceAgeMs,
    state: verificationReasons.length === 0 ? "READY" : "VERIFY_SOURCE",
    sourcePortfolioId: portfolioId,
    sourceHealth: Object.freeze(sourceHealth.map((source) => deepFreeze({ ...source }))),
    verificationReasons,
    currentDecisionContext,
    unmatchedStrategicSignals,
    summary: deepFreeze({
      currentPortfolioItems: portfolioItems.length,
      currentItemsWithLearningSignals: currentDecisionContext.filter((item) => item.learningSignals.length > 0).length,
      currentItemsWithStrategicSignals: currentDecisionContext.filter((item) => item.strategicSignals.length > 0).length,
      experimentSignals: experimentSignals.length,
      counterfactualSignals: counterfactualSignals.length,
      reallocationReviewSignals: experimentSignals.filter((signal) => signal.state === "READY_FOR_REVIEW").length,
      attributionEvidenceNeededSignals: experimentSignals.filter((signal) => signal.state === "WAIT_FOR_ATTRIBUTION").length,
      counterfactualKeeganReviewSignals: counterfactualSignals.filter((signal) => signal.state === "KEEGAN_REVIEW_REQUIRED").length,
      verificationSignals: allStrategicSignals.filter((signal) => signal.state === "VERIFY" || signal.state === "VERIFY_REQUIRED").length,
      unmatchedStrategicSignals: unmatchedStrategicSignals.length
    }),
    evidenceRefs,
    sourceRefs,
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    inferredOutcome: null,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  };

  return deepFreeze(result) as ChiefOfStaffStrategicReviewV1;
}
