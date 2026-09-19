import type {
  AttributionConfidenceV1,
  CalibrationErrorV1,
  DecisionLearningRecordInputV1,
  LearningActionStatusV1,
  ResultVsPredictionV1,
} from "@/lib/learning-engine/decision-record-v1";

export const NEGOTIATION_PRICING_LEARNING_VERSION_V1 =
  "NegotiationPricingLearningReviewV1" as const;

export type NegotiationDealClassV1 =
  | "ORIGINAL"
  | "COMMISSION"
  | "PARTNERSHIP"
  | "SPONSORSHIP"
  | "LICENSING"
  | "EDITION"
  | "OTHER";

export type NegotiationLearningTagV1 =
  | "PRICE_HOLD"
  | "PRICE_CHANGE"
  | "PACKAGE_OPTIONS"
  | "VALUE_ADD"
  | "CONCESSION"
  | "PAYMENT_TERMS"
  | "RIGHTS_SCOPE"
  | "EXCLUSIVITY"
  | "TIMING"
  | "WALK_AWAY"
  | "OTHER";

export type NegotiationDecisionContextV1 = Readonly<{
  decisionId: string;
  dealId: string;
  dealClass: NegotiationDealClassV1;
  counterpartyCanonicalId: string | null;
  truthState: "KNOWN" | "INFERRED" | "UNKNOWN" | "CONFLICTED";
  observedAt: string;
  learningTags: readonly NegotiationLearningTagV1[];
  evidenceRefs: readonly string[];
}>;

export type NegotiationLearningObservationV1 = Readonly<{
  decisionId: string;
  recommendationId: string;
  dealId: string;
  dealClass: NegotiationDealClassV1;
  counterpartyCanonicalId: string | null;
  learningTags: readonly NegotiationLearningTagV1[];
  actionStatus: LearningActionStatusV1;
  resultVsPrediction: ResultVsPredictionV1;
  attributionConfidence: AttributionConfidenceV1;
  calibrationError: CalibrationErrorV1;
  observedOutcome: Readonly<{
    state: "RECORDED" | "UNKNOWN";
    metric: string;
    unit: DecisionLearningRecordInputV1["OBSERVED_OUTCOME"]["unit"];
    value: number | null;
    observedAt: string | null;
  }>;
  lesson: string;
  evidenceRefs: readonly string[];
  causalClaim: "NOT_ESTABLISHED";
  policyPromotion: "NOT_AUTHORIZED";
}>;

export type NegotiationRecurringLessonCandidateV1 = Readonly<{
  patternId: string;
  dealClass: NegotiationDealClassV1;
  learningTag: NegotiationLearningTagV1;
  recurrenceState:
    | "CROSS_COUNTERPARTY_REVIEW_CANDIDATE"
    | "CROSS_DEAL_SAME_COUNTERPARTY_REVIEW_CANDIDATE";
  decisionIds: readonly string[];
  dealIds: readonly string[];
  counterpartyCanonicalIds: readonly string[];
  actionStatuses: readonly LearningActionStatusV1[];
  attributionClasses: readonly AttributionConfidenceV1[];
  lessons: readonly string[];
  evidenceRefs: readonly string[];
  reviewState: "REVIEW_CANDIDATE_ONLY";
  causalClaim: "NOT_ESTABLISHED";
  pricingRuleCreated: false;
  negotiationRuleCreated: false;
}>;

export type NegotiationPricingLearningReviewV1 = Readonly<{
  contractVersion: typeof NEGOTIATION_PRICING_LEARNING_VERSION_V1;
  status: "LIVE" | "LIVE_WITH_GAPS" | "NO_EVIDENCE";
  evaluatedAt: string;
  observations: readonly NegotiationLearningObservationV1[];
  recurringLessonCandidates: readonly NegotiationRecurringLessonCandidateV1[];
  unmatchedDecisionIds: readonly string[];
  withheldDecisionIds: readonly string[];
  issues: readonly string[];
  limitations: readonly string[];
  authority: Readonly<{
    priceMutationAllowed: false;
    negotiationActionAllowed: false;
    policyPromotionAllowed: false;
    externalActionAllowed: false;
    causalClaimAllowed: false;
  }>;
}>;

export type NegotiationPricingLearningInputV1 = Readonly<{
  records: readonly DecisionLearningRecordInputV1[];
  contexts: readonly NegotiationDecisionContextV1[];
  evaluatedAt: string;
  maxObservations?: number;
}>;

const DEAL_CLASSES = new Set<NegotiationDealClassV1>([
  "ORIGINAL",
  "COMMISSION",
  "PARTNERSHIP",
  "SPONSORSHIP",
  "LICENSING",
  "EDITION",
  "OTHER",
]);
const LEARNING_TAGS = new Set<NegotiationLearningTagV1>([
  "PRICE_HOLD",
  "PRICE_CHANGE",
  "PACKAGE_OPTIONS",
  "VALUE_ADD",
  "CONCESSION",
  "PAYMENT_TERMS",
  "RIGHTS_SCOPE",
  "EXCLUSIVITY",
  "TIMING",
  "WALK_AWAY",
  "OTHER",
]);
const MATURE_ACTION_STATES = new Set<LearningActionStatusV1>([
  "successful",
  "unsuccessful",
  "inconclusive",
]);
const LIMITATIONS = Object.freeze([
  "This review preserves recorded negotiation and pricing outcomes; it does not infer why a counterparty acted or whether a tactic caused an outcome.",
  "A repeated pattern is only a review candidate and cannot become a pricing, negotiation, or operating rule without separate governed review.",
  "Historical monetary observations remain source measurements only; the review does not create expected value, uplift, ROI, or confidence estimates.",
  "Only contexts explicitly marked KNOWN are eligible. Inferred, unknown, conflicted, unmatched, or future evidence is withheld rather than guessed.",
] as const);
const AUTHORITY = Object.freeze({
  priceMutationAllowed: false,
  negotiationActionAllowed: false,
  policyPromotionAllowed: false,
  externalActionAllowed: false,
  causalClaimAllowed: false,
} as const);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function canonicalTimestamp(value: unknown, label: string): string {
  const text = nonEmpty(value, label);
  const millis = Date.parse(text);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== text) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return text;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function boundedCount(value: number | undefined): number {
  if (value == null) return 50;
  if (!Number.isInteger(value) || value < 1 || value > 200) {
    throw new Error("maxObservations must be an integer between 1 and 200");
  }
  return value;
}

function validateContext(context: NegotiationDecisionContextV1, evaluatedAtMs: number): void {
  nonEmpty(context.decisionId, "context.decisionId");
  nonEmpty(context.dealId, "context.dealId");
  if (!DEAL_CLASSES.has(context.dealClass)) throw new Error("context.dealClass is invalid");
  if (context.counterpartyCanonicalId != null) nonEmpty(context.counterpartyCanonicalId, "context.counterpartyCanonicalId");
  const observedAt = canonicalTimestamp(context.observedAt, "context.observedAt");
  if (Date.parse(observedAt) > evaluatedAtMs) throw new Error("context.observedAt cannot be in the future");
  if (!Array.isArray(context.learningTags) || context.learningTags.length === 0) {
    throw new Error("context.learningTags must contain at least one explicit tag");
  }
  const tags = new Set<NegotiationLearningTagV1>();
  for (const tag of context.learningTags) {
    if (!LEARNING_TAGS.has(tag)) throw new Error(`Unsupported negotiation learning tag ${String(tag)}`);
    if (tags.has(tag)) throw new Error(`Duplicate negotiation learning tag ${tag}`);
    tags.add(tag);
  }
  if (!Array.isArray(context.evidenceRefs) || context.evidenceRefs.length === 0) {
    throw new Error("context.evidenceRefs must contain at least one provenance reference");
  }
  if (unique(context.evidenceRefs).length !== context.evidenceRefs.length) {
    throw new Error("context.evidenceRefs cannot contain duplicate or empty references");
  }
}

function validateRecordIdentity(records: readonly DecisionLearningRecordInputV1[]): Map<string, DecisionLearningRecordInputV1> {
  const byId = new Map<string, DecisionLearningRecordInputV1>();
  for (const record of records) {
    const id = nonEmpty(record.id, "record.id");
    if (byId.has(id)) throw new Error(`Duplicate decision learning record ${id}`);
    byId.set(id, record);
  }
  return byId;
}

function outcomeState(
  record: DecisionLearningRecordInputV1,
  evaluatedAtMs: number,
): "RECORDED" | "UNKNOWN" | "FUTURE" {
  const outcome = record.OBSERVED_OUTCOME;
  if (outcome.observed_at == null || outcome.value == null || outcome.evidence_refs.length === 0) return "UNKNOWN";
  const observedAt = canonicalTimestamp(outcome.observed_at, "OBSERVED_OUTCOME.observed_at");
  if (Date.parse(observedAt) > evaluatedAtMs) return "FUTURE";
  if (record.RESULT_VS_PREDICTION === "UNKNOWN") return "UNKNOWN";
  return "RECORDED";
}

function observationFor(
  record: DecisionLearningRecordInputV1,
  context: NegotiationDecisionContextV1,
  evaluatedAtMs: number,
): NegotiationLearningObservationV1 | null {
  const state = outcomeState(record, evaluatedAtMs);
  if (state === "FUTURE") return null;
  const outcome = record.OBSERVED_OUTCOME;
  const governanceRefs = record.DECISION_GOVERNANCE
    ? [
        ...record.DECISION_GOVERNANCE.supporting_evidence_refs,
        ...record.DECISION_GOVERNANCE.contradicting_evidence_refs,
      ]
    : [];
  return {
    decisionId: record.id,
    recommendationId: nonEmpty(record.recommendation_id, "record.recommendation_id"),
    dealId: context.dealId,
    dealClass: context.dealClass,
    counterpartyCanonicalId: context.counterpartyCanonicalId,
    learningTags: [...context.learningTags].sort((a, b) => a.localeCompare(b)),
    actionStatus: record.ACTION_STATUS,
    resultVsPrediction: record.RESULT_VS_PREDICTION,
    attributionConfidence: record.ATTRIBUTION_CONFIDENCE,
    calibrationError: record.CALIBRATION_ERROR,
    observedOutcome: {
      state,
      metric: nonEmpty(outcome.metric, "OBSERVED_OUTCOME.metric"),
      unit: outcome.unit,
      value: state === "RECORDED" ? outcome.value : null,
      observedAt: state === "RECORDED" ? outcome.observed_at : null,
    },
    lesson: typeof record.LESSON === "string" ? record.LESSON.trim() : "",
    evidenceRefs: unique([...context.evidenceRefs, ...outcome.evidence_refs, ...governanceRefs]),
    causalClaim: "NOT_ESTABLISHED",
    policyPromotion: "NOT_AUTHORIZED",
  };
}

function buildRecurringCandidates(
  observations: readonly NegotiationLearningObservationV1[],
): NegotiationRecurringLessonCandidateV1[] {
  const groups = new Map<string, NegotiationLearningObservationV1[]>();
  for (const observation of observations) {
    if (observation.observedOutcome.state !== "RECORDED") continue;
    if (!MATURE_ACTION_STATES.has(observation.actionStatus)) continue;
    for (const tag of observation.learningTags) {
      const key = `${observation.dealClass}:${tag}`;
      const group = groups.get(key) ?? [];
      group.push(observation);
      groups.set(key, group);
    }
  }

  const candidates: NegotiationRecurringLessonCandidateV1[] = [];
  for (const [key, group] of groups.entries()) {
    const dealIds = unique(group.map((item) => item.dealId));
    if (dealIds.length < 2) continue;
    const [dealClass, learningTag] = key.split(":") as [NegotiationDealClassV1, NegotiationLearningTagV1];
    const counterparties = unique(
      group
        .map((item) => item.counterpartyCanonicalId ?? "")
        .filter(Boolean),
    );
    candidates.push({
      patternId: `negotiation-pattern:${dealClass.toLowerCase()}:${learningTag.toLowerCase()}`,
      dealClass,
      learningTag,
      recurrenceState:
        counterparties.length >= 2
          ? "CROSS_COUNTERPARTY_REVIEW_CANDIDATE"
          : "CROSS_DEAL_SAME_COUNTERPARTY_REVIEW_CANDIDATE",
      decisionIds: unique(group.map((item) => item.decisionId)),
      dealIds,
      counterpartyCanonicalIds: counterparties,
      actionStatuses: [...new Set(group.map((item) => item.actionStatus))].sort((a, b) => a.localeCompare(b)),
      attributionClasses: [...new Set(group.map((item) => item.attributionConfidence))].sort((a, b) => a.localeCompare(b)),
      lessons: unique(group.map((item) => item.lesson).filter(Boolean)),
      evidenceRefs: unique(group.flatMap((item) => item.evidenceRefs)),
      reviewState: "REVIEW_CANDIDATE_ONLY",
      causalClaim: "NOT_ESTABLISHED",
      pricingRuleCreated: false,
      negotiationRuleCreated: false,
    });
  }
  return candidates.sort(
    (left, right) => left.dealClass.localeCompare(right.dealClass) || left.learningTag.localeCompare(right.learningTag),
  );
}

/**
 * Creates a bounded Company Brain review over explicit negotiation/pricing
 * context and existing decision/outcome memory. Historical observations remain
 * evidence, not causal rules. Any durable policy or external negotiation still
 * requires the existing governed review/approval path.
 */
export function buildNegotiationPricingLearningReviewV1(
  input: NegotiationPricingLearningInputV1,
): NegotiationPricingLearningReviewV1 {
  const evaluatedAt = canonicalTimestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const maxObservations = boundedCount(input.maxObservations);
  const byId = validateRecordIdentity(input.records);
  const contextIds = new Set<string>();
  const observations: NegotiationLearningObservationV1[] = [];
  const unmatched = new Set<string>();
  const withheld = new Set<string>();
  const issues = new Set<string>();

  for (const context of input.contexts) {
    validateContext(context, evaluatedAtMs);
    if (contextIds.has(context.decisionId)) throw new Error(`Duplicate negotiation context ${context.decisionId}`);
    contextIds.add(context.decisionId);

    if (context.truthState !== "KNOWN") {
      withheld.add(context.decisionId);
      issues.add(`CONTEXT_${context.truthState}`);
      continue;
    }
    const record = byId.get(context.decisionId);
    if (!record) {
      unmatched.add(context.decisionId);
      issues.add("DECISION_RECORD_UNMATCHED");
      continue;
    }
    const observation = observationFor(record, context, evaluatedAtMs);
    if (!observation) {
      withheld.add(context.decisionId);
      issues.add("FUTURE_OUTCOME_WITHHELD");
      continue;
    }
    if (observations.length < maxObservations) observations.push(observation);
    else issues.add("OBSERVATION_BOUND_REACHED");
  }

  observations.sort((left, right) => left.dealId.localeCompare(right.dealId) || left.decisionId.localeCompare(right.decisionId));
  const recurringLessonCandidates = buildRecurringCandidates(observations);
  const gaps = unmatched.size > 0 || withheld.size > 0 || issues.size > 0;

  return deepFreeze({
    contractVersion: NEGOTIATION_PRICING_LEARNING_VERSION_V1,
    status: observations.length === 0 ? "NO_EVIDENCE" : gaps ? "LIVE_WITH_GAPS" : "LIVE",
    evaluatedAt,
    observations,
    recurringLessonCandidates,
    unmatchedDecisionIds: [...unmatched].sort((a, b) => a.localeCompare(b)),
    withheldDecisionIds: [...withheld].sort((a, b) => a.localeCompare(b)),
    issues: [...issues].sort((a, b) => a.localeCompare(b)),
    limitations: [...LIMITATIONS],
    authority: AUTHORITY,
  });
}
