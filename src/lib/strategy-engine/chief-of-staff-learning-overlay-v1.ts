import {
  COMPANY_BRAIN_ASSUMPTION_REVIEW_POLICY_VERSION_V1,
  COMPANY_BRAIN_ASSUMPTION_REVIEW_VERSION_V1,
  type CompanyBrainAssumptionReviewItemV1,
  type CompanyBrainAssumptionReviewV1
} from "@/lib/intelligence/organizational-learning/company-brain-assumption-review-v1";
import {
  COMPANY_BRAIN_CHIEF_OF_STAFF_BRIEF_POLICY_VERSION_V1,
  COMPANY_BRAIN_CHIEF_OF_STAFF_BRIEF_VERSION_V1,
  type CompanyBrainChiefOfStaffAttentionItemV1,
  type CompanyBrainChiefOfStaffBriefV1
} from "@/lib/intelligence/organizational-learning/company-brain-chief-of-staff-brief-v1";
import {
  CHIEF_OF_STAFF_PORTFOLIO_BRIEF_POLICY_V1,
  type ChiefOfStaffPortfolioActionV1,
  type ChiefOfStaffPortfolioBlockedWorkV1,
  type ChiefOfStaffPortfolioBriefV1
} from "@/lib/strategy-engine/chief-of-staff-portfolio-brief-v1";

export const CHIEF_OF_STAFF_LEARNING_OVERLAY_VERSION_V1 =
  "ChiefOfStaffLearningOverlayV1" as const;
export const CHIEF_OF_STAFF_LEARNING_OVERLAY_POLICY_VERSION_V1 =
  "chief_of_staff_learning_overlay_v1.0.0" as const;

const MAX_ITEMS = 2_000;
const MAX_REFS = 8_000;

export type ChiefOfStaffLearningOverlayPortfolioQueueV1 =
  | "KEEGAN_DECISION"
  | "JEEVES_PREPARATION"
  | "INTERNAL_REVIEW"
  | "OWNER_ACTION"
  | "BLOCKED_OR_REVALIDATE";

export type ChiefOfStaffLearningOverlaySignalOriginV1 =
  | "COMPANY_BRAIN"
  | "ASSUMPTION_REVIEW";

export type ChiefOfStaffLearningOverlaySignalV1 = Readonly<{
  signalId: string;
  origin: ChiefOfStaffLearningOverlaySignalOriginV1;
  sourceItemId: string;
  decisionId: string;
  signalType: string;
  safeNextStep: string;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
}>;

export type ChiefOfStaffLearningOverlayDecisionContextV1 = Readonly<{
  candidateId: string;
  title: string;
  rank: number;
  owner: ChiefOfStaffPortfolioActionV1["owner"];
  approvalClass: ChiefOfStaffPortfolioActionV1["approvalClass"];
  portfolioQueue: ChiefOfStaffLearningOverlayPortfolioQueueV1;
  signals: readonly ChiefOfStaffLearningOverlaySignalV1[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
}>;

export type ChiefOfStaffLearningOverlaySourceHealthV1 = Readonly<{
  source: "PORTFOLIO_BRIEF" | "COMPANY_BRAIN" | "ASSUMPTION_REVIEW";
  sourceId: string | null;
  generatedAt: string | null;
  ageMs: number | null;
  accepted: boolean;
}>;

export type ChiefOfStaffLearningOverlayV1 = Readonly<{
  contractVersion: typeof CHIEF_OF_STAFF_LEARNING_OVERLAY_VERSION_V1;
  policyVersion: typeof CHIEF_OF_STAFF_LEARNING_OVERLAY_POLICY_VERSION_V1;
  generatedAt: string;
  maximumSourceAgeMs: number;
  state: "READY" | "VERIFY_SOURCE";
  sourceHealth: readonly ChiefOfStaffLearningOverlaySourceHealthV1[];
  verificationReasons: readonly string[];
  currentDecisionContext: readonly ChiefOfStaffLearningOverlayDecisionContextV1[];
  unmatchedKnowledgeSignals: readonly ChiefOfStaffLearningOverlaySignalV1[];
  summary: Readonly<{
    currentPortfolioItems: number;
    currentItemsWithKnowledgeSignals: number;
    matchedKnowledgeSignals: number;
    unmatchedKnowledgeSignals: number;
    decisionRevisitSignals: number;
    assumptionEvidenceNeededSignals: number;
    measurementAttentionSignals: number;
    recurringLessonSignals: number;
    verificationSignals: number;
    pricingAssumptionRevisits: number;
    negotiationAssumptionRevisits: number;
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
    decisionMutationAuthorized: false;
    assumptionMutationAuthorized: false;
    portfolioMutationAuthorized: false;
    reallocationAuthorized: false;
    evidenceCollectionAuthorized: false;
    measurementExecutionAuthorized: false;
    learningPromotionAuthorized: false;
    policyPromotionAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    campaignExecutionAuthorized: false;
    experimentExecutionAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

export type ChiefOfStaffLearningOverlayInputV1 = Readonly<{
  portfolioBrief: ChiefOfStaffPortfolioBriefV1;
  companyBrain: CompanyBrainChiefOfStaffBriefV1;
  assumptionReview: CompanyBrainAssumptionReviewV1;
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

const COMPANY_BRAIN_AUTHORITY = Object.freeze({
  analysisOnly: true,
  persistenceAuthorized: false,
  decisionMutationAuthorized: false,
  measurementExecutionAuthorized: false,
  evidenceCollectionAuthorized: false,
  learningPromotionAuthorized: false,
  policyPromotionAuthorized: false,
  capabilityPromotionAuthorized: false,
  portfolioMutationAuthorized: false,
  reallocationAuthorized: false,
  pricingChangeAuthorized: false,
  negotiationActionAuthorized: false,
  campaignExecutionAuthorized: false,
  experimentExecutionAuthorized: false,
  externalActionAuthorized: false,
  approvalBypassAuthorized: false
});

const ASSUMPTION_AUTHORITY = Object.freeze({
  analysisOnly: true,
  persistenceAuthorized: false,
  decisionMutationAuthorized: false,
  assumptionMutationAuthorized: false,
  learningPromotionAuthorized: false,
  policyPromotionAuthorized: false,
  capabilityPromotionAuthorized: false,
  portfolioMutationAuthorized: false,
  reallocationAuthorized: false,
  pricingChangeAuthorized: false,
  negotiationActionAuthorized: false,
  campaignExecutionAuthorized: false,
  experimentExecutionAuthorized: false,
  externalActionAuthorized: false,
  approvalBypassAuthorized: false
});

const AUTHORITY = Object.freeze({
  synthesisOnly: true as const,
  persistenceAuthorized: false as const,
  decisionMutationAuthorized: false as const,
  assumptionMutationAuthorized: false as const,
  portfolioMutationAuthorized: false as const,
  reallocationAuthorized: false as const,
  evidenceCollectionAuthorized: false as const,
  measurementExecutionAuthorized: false as const,
  learningPromotionAuthorized: false as const,
  policyPromotionAuthorized: false as const,
  pricingChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  campaignExecutionAuthorized: false as const,
  experimentExecutionAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "This overlay cross-references existing governed chief-of-staff and Company Brain projections. It does not create another strategy, memory, portfolio, or learning source of truth.",
  "An exact decision-id match means only that current portfolio work has recorded knowledge requiring review or observation. It is not evidence that the knowledge caused current performance or that allocation should change.",
  "Unmatched knowledge signals remain visible because a historical decision can require review even when it is not in the current portfolio. Their absence from the current portfolio is not a recommendation to add or remove work.",
  "Supported, refuted, unresolved, due, overdue, recurring, and verification states preserve upstream semantics only. No confidence, monetary value, causal effect, future outcome, priority, or resource value is inferred.",
  "No persistence, decision or assumption mutation, evidence collection, measurement execution, learning or policy promotion, reallocation, pricing, negotiation, campaign, experiment, external action, or approval bypass is authorized."
] as const);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function timestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis)) return null;
  return new Date(millis).toISOString() === normalized ? normalized : null;
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
  const parsed = timestamp(generatedAt);
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
  queue: ChiefOfStaffLearningOverlayPortfolioQueueV1;
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
  if (!brief?.overview) reject("SUMMARY_INVALID");
  const collections = [
    brief?.decisionsForKeegan,
    brief?.jeevesPreparationReady,
    brief?.internalReviewReady,
    brief?.ownerActionReady,
    brief?.blockedWork,
    brief?.informationGain,
    brief?.tradeoffs,
    brief?.duplicateNoopCandidateIds
  ];
  if (collections.some((value) => !Array.isArray(value))) {
    reject("ITEMS_INVALID");
    return false;
  }
  const current = currentPortfolioItems(brief);
  if (current.length > MAX_ITEMS) reject("ITEM_LIMIT_EXCEEDED");
  const ids = current.map(({ item }) => item.candidateId);
  if (new Set(ids).size !== ids.length) reject("DUPLICATE_CURRENT_CANDIDATE");
  for (const { item } of current) {
    if (!text(item.candidateId) || !text(item.title) || !uniqueStrings(item.evidenceRefs) || !uniqueStrings(item.sourceRefs)) {
      reject("ITEM_INVALID");
      break;
    }
  }
  if (brief?.overview) {
    if (brief.overview.decisionsForKeegan !== brief.decisionsForKeegan.length
      || brief.overview.jeevesPreparationReady !== brief.jeevesPreparationReady.length
      || brief.overview.internalReviewReady !== brief.internalReviewReady.length
      || brief.overview.ownerActionReady !== brief.ownerActionReady.length
      || brief.overview.blockedOrRevalidate !== brief.blockedWork.length
      || brief.overview.duplicateNoops !== brief.duplicateNoopCandidateIds.length
      || brief.overview.informationGain !== brief.informationGain.length
      || brief.overview.deferred !== brief.tradeoffs.filter((item) => item.disposition === "DEFERRED").length
      || brief.overview.rejected !== brief.tradeoffs.filter((item) => item.disposition === "REJECTED").length) {
      reject("SUMMARY_MISMATCH");
    }
  }
  return valid;
}

function companyBrainItems(brief: CompanyBrainChiefOfStaffBriefV1): CompanyBrainChiefOfStaffAttentionItemV1[] {
  return [
    ...brief.verification,
    ...brief.decisionRevisit,
    ...brief.outcomeReview,
    ...brief.measurementNow,
    ...brief.measurementPlanReview,
    ...brief.recurringLessonReview,
    ...brief.recurringEvidenceNeeded
  ];
}

function validateCompanyBrain(brief: CompanyBrainChiefOfStaffBriefV1, reasons: Set<string>): boolean {
  let valid = true;
  const reject = (reason: string) => {
    reasons.add(`COMPANY_BRAIN_${reason}`);
    valid = false;
  };
  if (brief?.contractVersion !== COMPANY_BRAIN_CHIEF_OF_STAFF_BRIEF_VERSION_V1
    || brief?.policyVersion !== COMPANY_BRAIN_CHIEF_OF_STAFF_BRIEF_POLICY_VERSION_V1) reject("CONTRACT_INVALID");
  if (brief?.state !== "READY") reject("SOURCE_REQUIRES_VERIFICATION");
  if (!exactAuthority(brief?.authority, COMPANY_BRAIN_AUTHORITY)) reject("AUTHORITY_WIDENED");
  if (brief?.causalInterpretation !== "NOT_ESTABLISHED"
    || brief?.confidence !== "NOT_ESTABLISHED"
    || brief?.monetaryValue !== null
    || brief?.inferredOutcome !== null) reject("INTERPRETATION_WIDENED");
  const collections = [
    brief?.verification,
    brief?.decisionRevisit,
    brief?.outcomeReview,
    brief?.measurementNow,
    brief?.measurementPlanReview,
    brief?.recurringLessonReview,
    brief?.recurringEvidenceNeeded
  ];
  if (collections.some((value) => !Array.isArray(value))) {
    reject("ITEMS_INVALID");
    return false;
  }
  const items = companyBrainItems(brief);
  if (items.length > MAX_ITEMS) reject("ITEM_LIMIT_EXCEEDED");
  const ids = items.map((item) => item.attentionId);
  if (new Set(ids).size !== ids.length) reject("DUPLICATE_ATTENTION_ID");
  for (const item of items) {
    if (!text(item.attentionId) || !text(item.sourceItemId)
      || !uniqueStrings(item.evidenceRefs) || !uniqueStrings(item.sourceRefs)) {
      reject("ITEM_INVALID");
      break;
    }
    if (item.causalInterpretation !== "NOT_ESTABLISHED"
      || item.confidence !== "NOT_ESTABLISHED" || item.monetaryValue !== null) {
      reject("ITEM_INTERPRETATION_WIDENED");
      break;
    }
  }
  if (brief?.summary) {
    if (brief.summary.attentionItems !== items.length
      || brief.summary.verification !== brief.verification.length
      || brief.summary.decisionRevisit !== brief.decisionRevisit.length
      || brief.summary.outcomeReview !== brief.outcomeReview.length
      || brief.summary.measurementNow !== brief.measurementNow.length
      || brief.summary.measurementPlanReview !== brief.measurementPlanReview.length
      || brief.summary.recurringLessonReview !== brief.recurringLessonReview.length
      || brief.summary.recurringEvidenceNeeded !== brief.recurringEvidenceNeeded.length) {
      reject("SUMMARY_MISMATCH");
    }
  } else reject("SUMMARY_INVALID");
  return valid;
}

function assumptionItems(brief: CompanyBrainAssumptionReviewV1): CompanyBrainAssumptionReviewItemV1[] {
  return [
    ...brief.verificationRequired,
    ...brief.decisionRevisit,
    ...brief.evidenceNeeded,
    ...brief.supportedReview,
    ...brief.waitingOutcome
  ];
}

function validateAssumptionReview(brief: CompanyBrainAssumptionReviewV1, reasons: Set<string>): boolean {
  let valid = true;
  const reject = (reason: string) => {
    reasons.add(`ASSUMPTION_REVIEW_${reason}`);
    valid = false;
  };
  if (brief?.contractVersion !== COMPANY_BRAIN_ASSUMPTION_REVIEW_VERSION_V1
    || brief?.policyVersion !== COMPANY_BRAIN_ASSUMPTION_REVIEW_POLICY_VERSION_V1) reject("CONTRACT_INVALID");
  if (brief?.state !== "READY") reject("SOURCE_REQUIRES_VERIFICATION");
  if (!exactAuthority(brief?.authority, ASSUMPTION_AUTHORITY)) reject("AUTHORITY_WIDENED");
  if (brief?.causalInterpretation !== "NOT_ESTABLISHED"
    || brief?.confidence !== "NOT_ESTABLISHED"
    || brief?.monetaryValue !== null
    || brief?.inferredOutcome !== null) reject("INTERPRETATION_WIDENED");
  const collections = [
    brief?.verificationRequired,
    brief?.decisionRevisit,
    brief?.evidenceNeeded,
    brief?.supportedReview,
    brief?.waitingOutcome
  ];
  if (collections.some((value) => !Array.isArray(value))) {
    reject("ITEMS_INVALID");
    return false;
  }
  const items = assumptionItems(brief);
  if (items.length > MAX_ITEMS) reject("ITEM_LIMIT_EXCEEDED");
  const ids = items.map((item) => item.itemId);
  if (new Set(ids).size !== ids.length) reject("DUPLICATE_ITEM_ID");
  for (const item of items) {
    if (!text(item.itemId) || !text(item.decisionId) || !text(item.assumptionId)
      || !uniqueStrings(item.evidenceRefs) || !uniqueStrings(item.sourceRefs)) {
      reject("ITEM_INVALID");
      break;
    }
    if (item.causalInterpretation !== "NOT_ESTABLISHED"
      || item.confidence !== "NOT_ESTABLISHED" || item.monetaryValue !== null) {
      reject("ITEM_INTERPRETATION_WIDENED");
      break;
    }
  }
  if (brief?.summary) {
    if (brief.summary.materialAssumptions !== items.length
      || brief.summary.verificationRequired !== brief.verificationRequired.length
      || brief.summary.decisionRevisit !== brief.decisionRevisit.length
      || brief.summary.evidenceNeeded !== brief.evidenceNeeded.length
      || brief.summary.supportedReview !== brief.supportedReview.length
      || brief.summary.waitingOutcome !== brief.waitingOutcome.length) reject("SUMMARY_MISMATCH");
  } else reject("SUMMARY_INVALID");
  return valid;
}

function signalFromCompanyBrain(item: CompanyBrainChiefOfStaffAttentionItemV1): ChiefOfStaffLearningOverlaySignalV1 | null {
  if (!item.decisionId) return null;
  return deepFreeze({
    signalId: `company-brain:${item.attentionId}`,
    origin: "COMPANY_BRAIN",
    sourceItemId: item.sourceItemId,
    decisionId: item.decisionId,
    signalType: item.lane,
    safeNextStep: item.safeNextStep,
    evidenceRefs: [...item.evidenceRefs],
    sourceRefs: [item.sourceBriefId, ...item.sourceRefs],
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null
  });
}

function signalFromAssumption(item: CompanyBrainAssumptionReviewItemV1): ChiefOfStaffLearningOverlaySignalV1 {
  return deepFreeze({
    signalId: `assumption-review:${item.itemId}`,
    origin: "ASSUMPTION_REVIEW",
    sourceItemId: item.itemId,
    decisionId: item.decisionId,
    signalType: item.lane,
    safeNextStep: item.lane,
    evidenceRefs: [...item.evidenceRefs],
    sourceRefs: [...item.sourceRefs],
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null
  });
}

function sortSignals(values: readonly ChiefOfStaffLearningOverlaySignalV1[]): readonly ChiefOfStaffLearningOverlaySignalV1[] {
  return Object.freeze([...values].sort((a, b) => {
    const decision = a.decisionId.localeCompare(b.decisionId);
    if (decision !== 0) return decision;
    const origin = a.origin.localeCompare(b.origin);
    if (origin !== 0) return origin;
    return a.signalId.localeCompare(b.signalId);
  }));
}

export function compileChiefOfStaffLearningOverlayV1(
  input: ChiefOfStaffLearningOverlayInputV1
): ChiefOfStaffLearningOverlayV1 {
  const generatedAt = timestamp(input?.generatedAt);
  if (!generatedAt) throw new Error("CHIEF_OF_STAFF_LEARNING_OVERLAY_INVALID_GENERATED_AT");
  const maximumSourceAgeMs = positiveFinite(input?.maximumSourceAgeMs);
  if (maximumSourceAgeMs == null) throw new Error("CHIEF_OF_STAFF_LEARNING_OVERLAY_INVALID_FRESHNESS_POLICY");
  const generatedAtMs = Date.parse(generatedAt);
  const reasons = new Set<string>();

  const portfolioId = text(input?.portfolioBrief?.sourcePortfolio?.portfolioId);
  const companyBrainId = text(input?.companyBrain?.briefId);
  const assumptionReviewId = text(input?.assumptionReview?.reviewId);
  if (!portfolioId) reasons.add("PORTFOLIO_BRIEF_SOURCE_ID_INVALID");
  if (!companyBrainId) reasons.add("COMPANY_BRAIN_SOURCE_ID_INVALID");
  if (!assumptionReviewId) reasons.add("ASSUMPTION_REVIEW_SOURCE_ID_INVALID");

  const portfolioAge = sourceAge("PORTFOLIO_BRIEF", input?.portfolioBrief?.generatedAt, generatedAtMs, maximumSourceAgeMs, reasons);
  const brainAge = sourceAge("COMPANY_BRAIN", input?.companyBrain?.generatedAt, generatedAtMs, maximumSourceAgeMs, reasons);
  const assumptionAge = sourceAge("ASSUMPTION_REVIEW", input?.assumptionReview?.generatedAt, generatedAtMs, maximumSourceAgeMs, reasons);

  const portfolioAccepted = Boolean(portfolioId) && portfolioAge.fresh
    && validatePortfolioBrief(input.portfolioBrief, reasons);
  const brainAccepted = Boolean(companyBrainId) && brainAge.fresh
    && validateCompanyBrain(input.companyBrain, reasons);
  const assumptionAccepted = Boolean(assumptionReviewId) && assumptionAge.fresh
    && validateAssumptionReview(input.assumptionReview, reasons);

  const portfolioItems = portfolioAccepted ? currentPortfolioItems(input.portfolioBrief) : [];
  const currentIds = new Set(portfolioItems.map(({ item }) => item.candidateId));

  const companyBrainSignals = brainAccepted
    ? companyBrainItems(input.companyBrain)
        .map(signalFromCompanyBrain)
        .filter((item): item is ChiefOfStaffLearningOverlaySignalV1 => item !== null)
    : [];
  const assumptionSignals = assumptionAccepted
    ? assumptionItems(input.assumptionReview).map(signalFromAssumption)
    : [];
  const allSignals = sortSignals([...companyBrainSignals, ...assumptionSignals]);
  if (allSignals.length > MAX_ITEMS) reasons.add("KNOWLEDGE_SIGNAL_LIMIT_EXCEEDED");
  const signalIds = allSignals.map((item) => item.signalId);
  if (new Set(signalIds).size !== signalIds.length) reasons.add("DUPLICATE_KNOWLEDGE_SIGNAL_ID");

  const signalsByDecision = new Map<string, ChiefOfStaffLearningOverlaySignalV1[]>();
  for (const signal of allSignals) {
    const values = signalsByDecision.get(signal.decisionId) ?? [];
    values.push(signal);
    signalsByDecision.set(signal.decisionId, values);
  }

  const currentDecisionContext = Object.freeze(portfolioItems
    .map(({ item, queue }) => {
      const signals = sortSignals(signalsByDecision.get(item.candidateId) ?? []);
      if (signals.length === 0) return null;
      return deepFreeze({
        candidateId: item.candidateId,
        title: item.title,
        rank: item.rank,
        owner: item.owner,
        approvalClass: item.approvalClass,
        portfolioQueue: queue,
        signals,
        causalInterpretation: "NOT_ESTABLISHED" as const,
        confidence: "NOT_ESTABLISHED" as const,
        monetaryValue: null
      });
    })
    .filter((item): item is ChiefOfStaffLearningOverlayDecisionContextV1 => item !== null)
    .sort((a, b) => a.rank - b.rank || a.candidateId.localeCompare(b.candidateId)));

  const unmatchedKnowledgeSignals = sortSignals(allSignals.filter((item) => !currentIds.has(item.decisionId)));
  const matchedSignals = currentDecisionContext.flatMap((item) => item.signals);
  const evidenceRefs = Object.freeze([...new Set(allSignals.flatMap((item) => item.evidenceRefs))].sort((a, b) => a.localeCompare(b)));
  const sourceRefs = Object.freeze([...new Set(allSignals.flatMap((item) => item.sourceRefs))].sort((a, b) => a.localeCompare(b)));
  const verificationReasons = Object.freeze([...reasons].sort((a, b) => a.localeCompare(b)));

  const output: ChiefOfStaffLearningOverlayV1 = {
    contractVersion: CHIEF_OF_STAFF_LEARNING_OVERLAY_VERSION_V1,
    policyVersion: CHIEF_OF_STAFF_LEARNING_OVERLAY_POLICY_VERSION_V1,
    generatedAt,
    maximumSourceAgeMs,
    state: verificationReasons.length === 0 ? "READY" : "VERIFY_SOURCE",
    sourceHealth: Object.freeze([
      {
        source: "PORTFOLIO_BRIEF",
        sourceId: portfolioId,
        generatedAt: portfolioAge.generatedAt,
        ageMs: portfolioAge.ageMs,
        accepted: portfolioAccepted
      },
      {
        source: "COMPANY_BRAIN",
        sourceId: companyBrainId,
        generatedAt: brainAge.generatedAt,
        ageMs: brainAge.ageMs,
        accepted: brainAccepted
      },
      {
        source: "ASSUMPTION_REVIEW",
        sourceId: assumptionReviewId,
        generatedAt: assumptionAge.generatedAt,
        ageMs: assumptionAge.ageMs,
        accepted: assumptionAccepted
      }
    ]),
    verificationReasons,
    currentDecisionContext,
    unmatchedKnowledgeSignals,
    summary: Object.freeze({
      currentPortfolioItems: portfolioItems.length,
      currentItemsWithKnowledgeSignals: currentDecisionContext.length,
      matchedKnowledgeSignals: matchedSignals.length,
      unmatchedKnowledgeSignals: unmatchedKnowledgeSignals.length,
      decisionRevisitSignals: allSignals.filter((item) => item.signalType === "REVIEW_DECISION_REVISIT" || item.signalType === "REVISIT_DECISION").length,
      assumptionEvidenceNeededSignals: allSignals.filter((item) => item.signalType === "GATHER_ASSUMPTION_EVIDENCE").length,
      measurementAttentionSignals: allSignals.filter((item) => item.signalType === "PREPARE_MEASUREMENT_EVIDENCE_REVIEW" || item.signalType === "REVIEW_MEASUREMENT_PLAN").length,
      recurringLessonSignals: allSignals.filter((item) => item.signalType === "REVIEW_RECURRING_LESSON" || item.signalType === "GATHER_MORE_INDEPENDENT_EVIDENCE").length,
      verificationSignals: allSignals.filter((item) => item.signalType.startsWith("VERIFY_")).length,
      pricingAssumptionRevisits: assumptionAccepted ? input.assumptionReview.summary.pricingAssumptionsRequiringRevisit : 0,
      negotiationAssumptionRevisits: assumptionAccepted ? input.assumptionReview.summary.negotiationAssumptionsRequiringRevisit : 0
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

  return deepFreeze(output) as ChiefOfStaffLearningOverlayV1;
}
