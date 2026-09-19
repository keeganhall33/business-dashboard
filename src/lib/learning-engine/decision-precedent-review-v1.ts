import type {
  DecisionLearningRecordInputV1,
  DecisionReviewStateV1,
  OutcomeAttributionClassV1,
} from "@/lib/learning-engine/decision-record-v1";
import {
  attributionClassFor,
  decisionReviewStateFor,
} from "@/lib/learning-engine/decision-record-v1";

export const DECISION_PRECEDENT_REVIEW_VERSION_V1 = "DecisionPrecedentReviewV1" as const;

export type DecisionPrecedentClassV1 =
  | "PRICING"
  | "NEGOTIATION"
  | "PARTNERSHIP"
  | "SPONSORSHIP"
  | "CREATIVE_CAPACITY"
  | "MARKETING"
  | "ECOMMERCE"
  | "RELATIONSHIP"
  | "CAPITAL_ALLOCATION"
  | "STRATEGY"
  | "OTHER";

export type DecisionPrecedentApprovalClassV1 =
  | "AUTO_EXECUTE_SAFE"
  | "PREPARE_FOR_APPROVAL"
  | "KEEGAN_APPROVAL_REQUIRED"
  | "ARCHITECT_REVIEW_REQUIRED";

export type DecisionPrecedentReversibilityV1 =
  | "REVERSIBLE"
  | "PARTIALLY_REVERSIBLE"
  | "IRREVERSIBLE"
  | "UNKNOWN";

export type DecisionPrecedentTruthStateV1 =
  | "KNOWN"
  | "INFERRED"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED";

export type DecisionPrecedentContextV1 = Readonly<{
  decisionId: string;
  decisionClass: DecisionPrecedentClassV1;
  domainId: string;
  objectiveRefs: readonly string[];
  constraintRefs: readonly string[];
  resourceRefs: readonly string[];
  approvalClass: DecisionPrecedentApprovalClassV1;
  reversibility: DecisionPrecedentReversibilityV1;
  truthState: DecisionPrecedentTruthStateV1;
  observedAt: string;
  evidenceRefs: readonly string[];
}>;

export type DecisionPrecedentQueryV1 = Readonly<{
  decisionId: string;
  decisionClass: DecisionPrecedentClassV1;
  domainId: string;
  objectiveRefs: readonly string[];
  constraintRefs: readonly string[];
  resourceRefs: readonly string[];
  approvalClass: DecisionPrecedentApprovalClassV1;
  reversibility: DecisionPrecedentReversibilityV1;
  truthState: DecisionPrecedentTruthStateV1;
  observedAt: string;
  evidenceRefs: readonly string[];
}>;

export type DecisionPrecedentDifferenceV1 =
  | "OBJECTIVES_DIFFER"
  | "CONSTRAINTS_DIFFER"
  | "RESOURCES_DIFFER"
  | "APPROVAL_CLASS_DIFFERS"
  | "REVERSIBILITY_DIFFERS";

export type DecisionPrecedentCandidateV1 = Readonly<{
  decisionId: string;
  recommendationId: string;
  matchClass: "EXACT_STRUCTURAL_MATCH" | "MULTI_ANCHOR_MATCH";
  sharedObjectiveRefs: readonly string[];
  sharedConstraintRefs: readonly string[];
  sharedResourceRefs: readonly string[];
  sharedAnchorCount: number;
  materialDifferences: readonly DecisionPrecedentDifferenceV1[];
  historicalContextObservedAt: string;
  historicalDecisionReviewState: DecisionReviewStateV1 | "UNRECORDED";
  historicalDecisionGovernanceState: "DRAFT" | "REVIEWED" | "APPROVED" | "UNRECORDED";
  historicalActionStatus: DecisionLearningRecordInputV1["ACTION_STATUS"];
  historicalResultVsPrediction: DecisionLearningRecordInputV1["RESULT_VS_PREDICTION"];
  historicalOutcome: Readonly<{
    state: "RECORDED" | "UNKNOWN";
    metric: string;
    unit: DecisionLearningRecordInputV1["OBSERVED_OUTCOME"]["unit"];
    value: number | null;
    observedAt: string | null;
    attributionClass: OutcomeAttributionClassV1;
    attributionConfidence: DecisionLearningRecordInputV1["ATTRIBUTION_CONFIDENCE"];
  }>;
  historicalLesson: string;
  evidenceRefs: readonly string[];
  applicability: "HISTORICAL_CONTEXT_ONLY";
  causalClaim: "NOT_ESTABLISHED";
  personalPreferenceClaim: "NOT_ESTABLISHED";
  recommendationAuthority: "NONE";
}>;

export type DecisionPrecedentReviewV1 = Readonly<{
  contractVersion: typeof DECISION_PRECEDENT_REVIEW_VERSION_V1;
  status:
    | "PRECEDENTS_AVAILABLE"
    | "NO_COMPARABLE_PRECEDENT"
    | "REVIEW_REQUIRED"
    | "NO_EVIDENCE";
  evaluatedAt: string;
  queryDecisionId: string;
  precedents: readonly DecisionPrecedentCandidateV1[];
  withheldDecisionIds: readonly string[];
  unmatchedDecisionIds: readonly string[];
  issues: readonly string[];
  limitations: readonly string[];
  authority: Readonly<{
    recommendationAllowed: false;
    personalPreferenceInferenceAllowed: false;
    causalClaimAllowed: false;
    confidenceMutationAllowed: false;
    monetaryValueSynthesisAllowed: false;
    policyPromotionAllowed: false;
    externalActionAllowed: false;
  }>;
}>;

export type BuildDecisionPrecedentReviewInputV1 = Readonly<{
  query: DecisionPrecedentQueryV1;
  records: readonly DecisionLearningRecordInputV1[];
  contexts: readonly DecisionPrecedentContextV1[];
  evaluatedAt: string;
  minSharedAnchors?: number;
  maxPrecedents?: number;
}>;

const DECISION_CLASSES = new Set<DecisionPrecedentClassV1>([
  "PRICING",
  "NEGOTIATION",
  "PARTNERSHIP",
  "SPONSORSHIP",
  "CREATIVE_CAPACITY",
  "MARKETING",
  "ECOMMERCE",
  "RELATIONSHIP",
  "CAPITAL_ALLOCATION",
  "STRATEGY",
  "OTHER",
]);

const APPROVAL_CLASSES = new Set<DecisionPrecedentApprovalClassV1>([
  "AUTO_EXECUTE_SAFE",
  "PREPARE_FOR_APPROVAL",
  "KEEGAN_APPROVAL_REQUIRED",
  "ARCHITECT_REVIEW_REQUIRED",
]);

const REVERSIBILITY_STATES = new Set<DecisionPrecedentReversibilityV1>([
  "REVERSIBLE",
  "PARTIALLY_REVERSIBLE",
  "IRREVERSIBLE",
  "UNKNOWN",
]);

const TRUTH_STATES = new Set<DecisionPrecedentTruthStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
]);

const LIMITATIONS = Object.freeze([
  "Historical similarity is structural context only. It is not evidence that the same action should be taken now.",
  "A prior outcome does not establish causality, a personal preference, expected value, probability, or confidence for the current decision.",
  "Only explicit KNOWN context with provenance can participate. Inferred, unknown, stale, conflicted, future-dated, or unmatched context is withheld rather than guessed.",
  "Recorded monetary outcomes remain historical source observations only and are never converted into a forecast, expected value, ROI, or price recommendation.",
] as const);

const AUTHORITY = Object.freeze({
  recommendationAllowed: false,
  personalPreferenceInferenceAllowed: false,
  causalClaimAllowed: false,
  confidenceMutationAllowed: false,
  monetaryValueSynthesisAllowed: false,
  policyPromotionAllowed: false,
  externalActionAllowed: false,
} as const);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
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

function validateExplicitRefs(values: readonly string[], label: string, allowEmpty = true): string[] {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw new Error(`${label} must be ${allowEmpty ? "an" : "a non-empty"} array`);
  }
  const normalized = unique(values);
  if (normalized.length !== values.length) {
    throw new Error(`${label} cannot contain duplicate or empty references`);
  }
  if (normalized.length > 30) throw new Error(`${label} cannot contain more than 30 references`);
  for (const value of normalized) nonEmpty(value, `${label} item`);
  return normalized;
}

function validateContextShape(
  context: DecisionPrecedentContextV1 | DecisionPrecedentQueryV1,
  label: string,
): void {
  nonEmpty(context.decisionId, `${label}.decisionId`);
  if (!DECISION_CLASSES.has(context.decisionClass)) throw new Error(`${label}.decisionClass is invalid`);
  nonEmpty(context.domainId, `${label}.domainId`);
  validateExplicitRefs(context.objectiveRefs, `${label}.objectiveRefs`);
  validateExplicitRefs(context.constraintRefs, `${label}.constraintRefs`);
  validateExplicitRefs(context.resourceRefs, `${label}.resourceRefs`);
  if (!APPROVAL_CLASSES.has(context.approvalClass)) throw new Error(`${label}.approvalClass is invalid`);
  if (!REVERSIBILITY_STATES.has(context.reversibility)) throw new Error(`${label}.reversibility is invalid`);
  if (!TRUTH_STATES.has(context.truthState)) throw new Error(`${label}.truthState is invalid`);
  canonicalTimestamp(context.observedAt, `${label}.observedAt`);
  validateExplicitRefs(context.evidenceRefs, `${label}.evidenceRefs`, false);
}

function boundedMinSharedAnchors(value: number | undefined): number {
  if (value == null) return 2;
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error("minSharedAnchors must be an integer between 1 and 10");
  }
  return value;
}

function boundedMaxPrecedents(value: number | undefined): number {
  if (value == null) return 5;
  if (!Number.isInteger(value) || value < 1 || value > 20) {
    throw new Error("maxPrecedents must be an integer between 1 and 20");
  }
  return value;
}

function intersection(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right);
  return unique(left.filter((value) => rightSet.has(value)));
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const a = unique(left);
  const b = unique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function evidenceRefsFor(
  record: DecisionLearningRecordInputV1,
  context: DecisionPrecedentContextV1,
): string[] {
  const governanceRefs = record.DECISION_GOVERNANCE
    ? [
        ...record.DECISION_GOVERNANCE.supporting_evidence_refs,
        ...record.DECISION_GOVERNANCE.contradicting_evidence_refs,
      ]
    : [];
  return unique([
    ...context.evidenceRefs,
    ...record.OBSERVED_OUTCOME.evidence_refs,
    ...governanceRefs,
  ]);
}

function historicalOutcomeFor(
  record: DecisionLearningRecordInputV1,
  evaluatedAtMs: number,
): DecisionPrecedentCandidateV1["historicalOutcome"] | null {
  const outcome = record.OBSERVED_OUTCOME;
  if (outcome.observed_at == null || outcome.value == null || outcome.evidence_refs.length === 0) {
    return {
      state: "UNKNOWN",
      metric: nonEmpty(outcome.metric, "OBSERVED_OUTCOME.metric"),
      unit: outcome.unit,
      value: null,
      observedAt: null,
      attributionClass: attributionClassFor(record),
      attributionConfidence: record.ATTRIBUTION_CONFIDENCE,
    };
  }

  const observedAt = canonicalTimestamp(outcome.observed_at, "OBSERVED_OUTCOME.observed_at");
  if (Date.parse(observedAt) > evaluatedAtMs) return null;

  return {
    state: "RECORDED",
    metric: nonEmpty(outcome.metric, "OBSERVED_OUTCOME.metric"),
    unit: outcome.unit,
    value: outcome.value,
    observedAt,
    attributionClass: attributionClassFor(record),
    attributionConfidence: record.ATTRIBUTION_CONFIDENCE,
  };
}

function candidateFor(
  query: DecisionPrecedentQueryV1,
  context: DecisionPrecedentContextV1,
  record: DecisionLearningRecordInputV1,
  evaluatedAt: string,
  evaluatedAtMs: number,
  minSharedAnchors: number,
): DecisionPrecedentCandidateV1 | null {
  if (context.decisionId === query.decisionId) return null;
  if (context.decisionClass !== query.decisionClass || context.domainId !== query.domainId) return null;

  const sharedObjectiveRefs = intersection(query.objectiveRefs, context.objectiveRefs);
  const sharedConstraintRefs = intersection(query.constraintRefs, context.constraintRefs);
  const sharedResourceRefs = intersection(query.resourceRefs, context.resourceRefs);
  const sharedAnchorCount = sharedObjectiveRefs.length + sharedConstraintRefs.length + sharedResourceRefs.length;
  if (sharedAnchorCount < minSharedAnchors) return null;

  const historicalOutcome = historicalOutcomeFor(record, evaluatedAtMs);
  if (!historicalOutcome) return null;

  const materialDifferences: DecisionPrecedentDifferenceV1[] = [];
  if (!sameSet(query.objectiveRefs, context.objectiveRefs)) materialDifferences.push("OBJECTIVES_DIFFER");
  if (!sameSet(query.constraintRefs, context.constraintRefs)) materialDifferences.push("CONSTRAINTS_DIFFER");
  if (!sameSet(query.resourceRefs, context.resourceRefs)) materialDifferences.push("RESOURCES_DIFFER");
  if (query.approvalClass !== context.approvalClass) materialDifferences.push("APPROVAL_CLASS_DIFFERS");
  if (query.reversibility !== context.reversibility) materialDifferences.push("REVERSIBILITY_DIFFERS");

  const exact = materialDifferences.length === 0;
  const review = record.DECISION_GOVERNANCE
    ? decisionReviewStateFor(record, { as_of: evaluatedAt })
    : null;

  return {
    decisionId: record.id,
    recommendationId: nonEmpty(record.recommendation_id, "record.recommendation_id"),
    matchClass: exact ? "EXACT_STRUCTURAL_MATCH" : "MULTI_ANCHOR_MATCH",
    sharedObjectiveRefs,
    sharedConstraintRefs,
    sharedResourceRefs,
    sharedAnchorCount,
    materialDifferences,
    historicalContextObservedAt: context.observedAt,
    historicalDecisionReviewState: review?.state ?? "UNRECORDED",
    historicalDecisionGovernanceState: record.DECISION_GOVERNANCE?.review_state ?? "UNRECORDED",
    historicalActionStatus: record.ACTION_STATUS,
    historicalResultVsPrediction: record.RESULT_VS_PREDICTION,
    historicalOutcome,
    historicalLesson: typeof record.LESSON === "string" ? record.LESSON.trim() : "",
    evidenceRefs: evidenceRefsFor(record, context),
    applicability: "HISTORICAL_CONTEXT_ONLY",
    causalClaim: "NOT_ESTABLISHED",
    personalPreferenceClaim: "NOT_ESTABLISHED",
    recommendationAuthority: "NONE",
  };
}

function candidateSort(left: DecisionPrecedentCandidateV1, right: DecisionPrecedentCandidateV1): number {
  if (left.matchClass !== right.matchClass) {
    return left.matchClass === "EXACT_STRUCTURAL_MATCH" ? -1 : 1;
  }
  if (left.sharedAnchorCount !== right.sharedAnchorCount) {
    return right.sharedAnchorCount - left.sharedAnchorCount;
  }
  if (left.historicalOutcome.state !== right.historicalOutcome.state) {
    return left.historicalOutcome.state === "RECORDED" ? -1 : 1;
  }
  const observedOrder = Date.parse(right.historicalContextObservedAt) - Date.parse(left.historicalContextObservedAt);
  if (observedOrder !== 0) return observedOrder;
  return left.decisionId.localeCompare(right.decisionId);
}

function uniqueRecordMap(records: readonly DecisionLearningRecordInputV1[]): Map<string, DecisionLearningRecordInputV1> {
  const byId = new Map<string, DecisionLearningRecordInputV1>();
  for (const record of records) {
    const id = nonEmpty(record.id, "record.id");
    if (byId.has(id)) throw new Error(`Duplicate decision learning record ${id}`);
    attributionClassFor(record);
    byId.set(id, record);
  }
  return byId;
}

export function buildDecisionPrecedentReviewV1(
  input: BuildDecisionPrecedentReviewInputV1,
): DecisionPrecedentReviewV1 {
  const evaluatedAt = canonicalTimestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  validateContextShape(input.query, "query");
  if (Date.parse(input.query.observedAt) > evaluatedAtMs) {
    throw new Error("query.observedAt cannot be in the future");
  }

  const minSharedAnchors = boundedMinSharedAnchors(input.minSharedAnchors);
  const maxPrecedents = boundedMaxPrecedents(input.maxPrecedents);
  const queryAnchors = unique([
    ...input.query.objectiveRefs,
    ...input.query.constraintRefs,
    ...input.query.resourceRefs,
  ]);
  if (queryAnchors.length < minSharedAnchors) {
    throw new Error("query does not contain enough explicit structural anchors for precedent review");
  }

  const recordsById = uniqueRecordMap(input.records);
  const contextsById = new Map<string, DecisionPrecedentContextV1>();
  for (const context of input.contexts) {
    validateContextShape(context, "context");
    if (contextsById.has(context.decisionId)) {
      throw new Error(`Duplicate decision precedent context ${context.decisionId}`);
    }
    contextsById.set(context.decisionId, context);
  }

  if (input.query.truthState !== "KNOWN") {
    return deepFreeze({
      contractVersion: DECISION_PRECEDENT_REVIEW_VERSION_V1,
      status: "REVIEW_REQUIRED",
      evaluatedAt,
      queryDecisionId: input.query.decisionId,
      precedents: [],
      withheldDecisionIds: [],
      unmatchedDecisionIds: [],
      issues: [`QUERY_CONTEXT_${input.query.truthState}`],
      limitations: [...LIMITATIONS],
      authority: AUTHORITY,
    });
  }

  const candidates: DecisionPrecedentCandidateV1[] = [];
  const withheldDecisionIds: string[] = [];
  const unmatchedDecisionIds: string[] = [];
  const issues = new Set<string>();

  for (const context of input.contexts) {
    if (context.decisionId === input.query.decisionId) continue;

    if (Date.parse(context.observedAt) > evaluatedAtMs) {
      withheldDecisionIds.push(context.decisionId);
      issues.add("FUTURE_CONTEXT_WITHHELD");
      continue;
    }

    if (context.truthState !== "KNOWN") {
      withheldDecisionIds.push(context.decisionId);
      issues.add(`CONTEXT_${context.truthState}`);
      continue;
    }

    const record = recordsById.get(context.decisionId);
    if (!record) {
      unmatchedDecisionIds.push(context.decisionId);
      issues.add("DECISION_RECORD_UNMATCHED");
      continue;
    }

    const candidate = candidateFor(
      input.query,
      context,
      record,
      evaluatedAt,
      evaluatedAtMs,
      minSharedAnchors,
    );
    if (!candidate) {
      if (
        context.decisionClass === input.query.decisionClass &&
        context.domainId === input.query.domainId &&
        historicalOutcomeFor(record, evaluatedAtMs) === null
      ) {
        withheldDecisionIds.push(context.decisionId);
        issues.add("FUTURE_OUTCOME_WITHHELD");
      }
      continue;
    }
    candidates.push(candidate);
  }

  const precedents = candidates.sort(candidateSort).slice(0, maxPrecedents);
  const status: DecisionPrecedentReviewV1["status"] =
    precedents.length > 0
      ? "PRECEDENTS_AVAILABLE"
      : input.contexts.length === 0 && input.records.length === 0
        ? "NO_EVIDENCE"
        : "NO_COMPARABLE_PRECEDENT";

  return deepFreeze({
    contractVersion: DECISION_PRECEDENT_REVIEW_VERSION_V1,
    status,
    evaluatedAt,
    queryDecisionId: input.query.decisionId,
    precedents,
    withheldDecisionIds: unique(withheldDecisionIds),
    unmatchedDecisionIds: unique(unmatchedDecisionIds),
    issues: [...issues].sort((a, b) => a.localeCompare(b)),
    limitations: [...LIMITATIONS],
    authority: AUTHORITY,
  });
}
