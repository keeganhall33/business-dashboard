import type { DecisionLearningRecordInputV1 } from "@/lib/learning-engine/decision-record-v1";

export const DECISION_TENDENCY_REVIEW_VERSION_V1 = "DecisionTendencyReviewV1" as const;

export type DecisionTendencyDimensionV1 =
  | "CONTROL_VS_CASH"
  | "PRESTIGE_VS_IMMEDIATE_REVENUE"
  | "OWNERSHIP_VS_LICENSING"
  | "OPTIONALITY_VS_COMMITMENT"
  | "RELATIONSHIP_EQUITY_VS_TRANSACTION"
  | "SPEED_VS_CERTAINTY"
  | "OTHER";

export type DecisionTendencyContextClassV1 =
  | "PRICING"
  | "NEGOTIATION"
  | "PARTNERSHIP"
  | "SPONSORSHIP"
  | "LICENSING"
  | "MARKETING"
  | "ECOMMERCE"
  | "RELATIONSHIP"
  | "CAPITAL_ALLOCATION"
  | "STRATEGY"
  | "OTHER";

export type DecisionTendencyTruthStateV1 =
  | "KNOWN"
  | "INFERRED"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED";

export type DecisionTendencySelectedPoleV1 =
  | "FIRST_POLE"
  | "SECOND_POLE"
  | "BALANCED_OR_CONTEXTUAL";

export type DecisionTendencyObservationV1 = Readonly<{
  decisionId: string;
  dimension: DecisionTendencyDimensionV1;
  firstPoleLabel: string;
  secondPoleLabel: string;
  selectedPole: DecisionTendencySelectedPoleV1;
  contextClass: DecisionTendencyContextClassV1;
  truthState: DecisionTendencyTruthStateV1;
  observedAt: string;
  evidenceRefs: readonly string[];
}>;

export type DecisionTendencyStateV1 =
  | "REPEATED_FIRST_POLE"
  | "REPEATED_SECOND_POLE"
  | "MIXED_OR_CONTEXT_DEPENDENT"
  | "POTENTIAL_DRIFT_REVIEW"
  | "INSUFFICIENT_EVIDENCE";

export type DecisionTendencySignalV1 = Readonly<{
  dimension: DecisionTendencyDimensionV1;
  firstPoleLabel: string;
  secondPoleLabel: string;
  state: DecisionTendencyStateV1;
  observedDecisionCount: number;
  firstPoleDecisionIds: readonly string[];
  secondPoleDecisionIds: readonly string[];
  balancedOrContextualDecisionIds: readonly string[];
  contextClasses: readonly DecisionTendencyContextClassV1[];
  evidenceRefs: readonly string[];
  driftReview: Readonly<{
    previousPole: "FIRST_POLE" | "SECOND_POLE";
    recentPole: "FIRST_POLE" | "SECOND_POLE";
    previousDecisionIds: readonly string[];
    recentDecisionIds: readonly string[];
  }> | null;
  permanentPreferenceClaim: "NOT_ESTABLISHED";
  outcomeQualityClaim: "NOT_EVALUATED";
  causalClaim: "NOT_ESTABLISHED";
  recommendationAuthority: "NONE";
}>;

export type DecisionTendencyReviewV1 = Readonly<{
  contractVersion: typeof DECISION_TENDENCY_REVIEW_VERSION_V1;
  status: "SIGNALS_AVAILABLE" | "NO_ELIGIBLE_EVIDENCE" | "REVIEW_REQUIRED";
  evaluatedAt: string;
  signals: readonly DecisionTendencySignalV1[];
  withheldDecisionIds: readonly string[];
  unmatchedDecisionIds: readonly string[];
  issues: readonly string[];
  limitations: readonly string[];
  authority: Readonly<{
    permanentPreferenceInferenceAllowed: false;
    recommendationAllowed: false;
    autonomousDecisionAllowed: false;
    policyPromotionAllowed: false;
    causalClaimAllowed: false;
    confidenceSynthesisAllowed: false;
    monetaryValueSynthesisAllowed: false;
    externalActionAllowed: false;
  }>;
}>;

export type BuildDecisionTendencyReviewInputV1 = Readonly<{
  records: readonly DecisionLearningRecordInputV1[];
  observations: readonly DecisionTendencyObservationV1[];
  evaluatedAt: string;
  minDistinctDecisions?: number;
}>;

const DIMENSIONS = new Set<DecisionTendencyDimensionV1>([
  "CONTROL_VS_CASH",
  "PRESTIGE_VS_IMMEDIATE_REVENUE",
  "OWNERSHIP_VS_LICENSING",
  "OPTIONALITY_VS_COMMITMENT",
  "RELATIONSHIP_EQUITY_VS_TRANSACTION",
  "SPEED_VS_CERTAINTY",
  "OTHER",
]);

const CONTEXT_CLASSES = new Set<DecisionTendencyContextClassV1>([
  "PRICING",
  "NEGOTIATION",
  "PARTNERSHIP",
  "SPONSORSHIP",
  "LICENSING",
  "MARKETING",
  "ECOMMERCE",
  "RELATIONSHIP",
  "CAPITAL_ALLOCATION",
  "STRATEGY",
  "OTHER",
]);

const TRUTH_STATES = new Set<DecisionTendencyTruthStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
]);

const SELECTED_POLES = new Set<DecisionTendencySelectedPoleV1>([
  "FIRST_POLE",
  "SECOND_POLE",
  "BALANCED_OR_CONTEXTUAL",
]);

const DECIDED_ACTION_STATES = new Set<DecisionLearningRecordInputV1["ACTION_STATUS"]>([
  "approved",
  "executed",
  "measuring",
  "successful",
  "unsuccessful",
  "inconclusive",
]);

const LIMITATIONS = Object.freeze([
  "This review summarizes repeated recorded choices. It does not establish a permanent personal preference or authorize future decisions.",
  "A repeated choice is not evidence that the choice produced a good outcome, caused an outcome, or should be repeated in a different context.",
  "Only explicit KNOWN observations linked to an approved-or-later canonical decision record are eligible; inferred, unknown, stale, conflicted, future, unmatched, or recommendation-only observations are withheld.",
  "Potential drift is a review flag based on a change in recorded choices across two consecutive two-decision windows, not a claim that preferences changed or why they changed.",
] as const);

const AUTHORITY = Object.freeze({
  permanentPreferenceInferenceAllowed: false,
  recommendationAllowed: false,
  autonomousDecisionAllowed: false,
  policyPromotionAllowed: false,
  causalClaimAllowed: false,
  confidenceSynthesisAllowed: false,
  monetaryValueSynthesisAllowed: false,
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

function validateEvidenceRefs(values: readonly string[], label: string): void {
  if (!Array.isArray(values) || values.length === 0) throw new Error(`${label} must contain provenance`);
  const normalized = unique(values);
  if (normalized.length !== values.length) throw new Error(`${label} cannot contain duplicate or empty references`);
  if (normalized.length > 30) throw new Error(`${label} cannot contain more than 30 references`);
}

function validateObservation(observation: DecisionTendencyObservationV1): void {
  nonEmpty(observation.decisionId, "observation.decisionId");
  if (!DIMENSIONS.has(observation.dimension)) throw new Error("observation.dimension is invalid");
  nonEmpty(observation.firstPoleLabel, "observation.firstPoleLabel");
  nonEmpty(observation.secondPoleLabel, "observation.secondPoleLabel");
  if (observation.firstPoleLabel.trim() === observation.secondPoleLabel.trim()) {
    throw new Error("observation pole labels must be distinct");
  }
  if (!SELECTED_POLES.has(observation.selectedPole)) throw new Error("observation.selectedPole is invalid");
  if (!CONTEXT_CLASSES.has(observation.contextClass)) throw new Error("observation.contextClass is invalid");
  if (!TRUTH_STATES.has(observation.truthState)) throw new Error("observation.truthState is invalid");
  canonicalTimestamp(observation.observedAt, "observation.observedAt");
  validateEvidenceRefs(observation.evidenceRefs, "observation.evidenceRefs");
}

function boundedMinDistinctDecisions(value: number | undefined): number {
  if (value == null) return 3;
  if (!Number.isInteger(value) || value < 2 || value > 10) {
    throw new Error("minDistinctDecisions must be an integer between 2 and 10");
  }
  return value;
}

function recordMap(records: readonly DecisionLearningRecordInputV1[]): Map<string, DecisionLearningRecordInputV1> {
  const byId = new Map<string, DecisionLearningRecordInputV1>();
  for (const record of records) {
    const id = nonEmpty(record.id, "record.id");
    if (byId.has(id)) throw new Error(`Duplicate decision learning record ${id}`);
    byId.set(id, record);
  }
  return byId;
}

function singlePole(items: readonly DecisionTendencyObservationV1[]): "FIRST_POLE" | "SECOND_POLE" | null {
  if (items.length === 0) return null;
  const first = items[0].selectedPole;
  if (first === "BALANCED_OR_CONTEXTUAL") return null;
  return items.every((item) => item.selectedPole === first) ? first : null;
}

function driftReviewFor(
  items: readonly DecisionTendencyObservationV1[],
): DecisionTendencySignalV1["driftReview"] {
  if (items.length < 4) return null;
  const previous = items.slice(-4, -2);
  const recent = items.slice(-2);
  const previousPole = singlePole(previous);
  const recentPole = singlePole(recent);
  if (!previousPole || !recentPole || previousPole === recentPole) return null;
  return {
    previousPole,
    recentPole,
    previousDecisionIds: previous.map((item) => item.decisionId),
    recentDecisionIds: recent.map((item) => item.decisionId),
  };
}

function signalFor(
  items: readonly DecisionTendencyObservationV1[],
  minDistinctDecisions: number,
): DecisionTendencySignalV1 {
  const ordered = [...items].sort((left, right) => {
    const timeOrder = Date.parse(left.observedAt) - Date.parse(right.observedAt);
    return timeOrder !== 0 ? timeOrder : left.decisionId.localeCompare(right.decisionId);
  });
  const first = ordered[0];
  const firstPoleDecisionIds = ordered.filter((item) => item.selectedPole === "FIRST_POLE").map((item) => item.decisionId);
  const secondPoleDecisionIds = ordered.filter((item) => item.selectedPole === "SECOND_POLE").map((item) => item.decisionId);
  const balancedOrContextualDecisionIds = ordered
    .filter((item) => item.selectedPole === "BALANCED_OR_CONTEXTUAL")
    .map((item) => item.decisionId);
  const driftReview = driftReviewFor(ordered);

  let state: DecisionTendencyStateV1;
  if (ordered.length < minDistinctDecisions) {
    state = "INSUFFICIENT_EVIDENCE";
  } else if (driftReview) {
    state = "POTENTIAL_DRIFT_REVIEW";
  } else if (firstPoleDecisionIds.length === ordered.length) {
    state = "REPEATED_FIRST_POLE";
  } else if (secondPoleDecisionIds.length === ordered.length) {
    state = "REPEATED_SECOND_POLE";
  } else {
    state = "MIXED_OR_CONTEXT_DEPENDENT";
  }

  return {
    dimension: first.dimension,
    firstPoleLabel: first.firstPoleLabel,
    secondPoleLabel: first.secondPoleLabel,
    state,
    observedDecisionCount: ordered.length,
    firstPoleDecisionIds,
    secondPoleDecisionIds,
    balancedOrContextualDecisionIds,
    contextClasses: [...new Set(ordered.map((item) => item.contextClass))].sort((a, b) => a.localeCompare(b)),
    evidenceRefs: unique(ordered.flatMap((item) => item.evidenceRefs)),
    driftReview,
    permanentPreferenceClaim: "NOT_ESTABLISHED",
    outcomeQualityClaim: "NOT_EVALUATED",
    causalClaim: "NOT_ESTABLISHED",
    recommendationAuthority: "NONE",
  };
}

export function buildDecisionTendencyReviewV1(
  input: BuildDecisionTendencyReviewInputV1,
): DecisionTendencyReviewV1 {
  const evaluatedAt = canonicalTimestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const minDistinctDecisions = boundedMinDistinctDecisions(input.minDistinctDecisions);
  const recordsById = recordMap(input.records);

  const seenDecisionDimensions = new Set<string>();
  const eligible: DecisionTendencyObservationV1[] = [];
  const withheldDecisionIds: string[] = [];
  const unmatchedDecisionIds: string[] = [];
  const issues = new Set<string>();

  for (const observation of input.observations) {
    validateObservation(observation);
    const identity = `${observation.decisionId}:${observation.dimension}`;
    if (seenDecisionDimensions.has(identity)) {
      throw new Error(`Duplicate decision tendency observation ${identity}`);
    }
    seenDecisionDimensions.add(identity);

    if (Date.parse(observation.observedAt) > evaluatedAtMs) {
      withheldDecisionIds.push(observation.decisionId);
      issues.add("FUTURE_OBSERVATION_WITHHELD");
      continue;
    }
    if (observation.truthState !== "KNOWN") {
      withheldDecisionIds.push(observation.decisionId);
      issues.add(`OBSERVATION_${observation.truthState}`);
      continue;
    }

    const record = recordsById.get(observation.decisionId);
    if (!record) {
      unmatchedDecisionIds.push(observation.decisionId);
      issues.add("DECISION_RECORD_UNMATCHED");
      continue;
    }
    if (!DECIDED_ACTION_STATES.has(record.ACTION_STATUS)) {
      withheldDecisionIds.push(observation.decisionId);
      issues.add("DECISION_NOT_YET_APPROVED");
      continue;
    }

    eligible.push(observation);
  }

  const byDimension = new Map<DecisionTendencyDimensionV1, DecisionTendencyObservationV1[]>();
  for (const observation of eligible) {
    const group = byDimension.get(observation.dimension) ?? [];
    group.push(observation);
    byDimension.set(observation.dimension, group);
  }

  const signals: DecisionTendencySignalV1[] = [];
  for (const [dimension, group] of byDimension.entries()) {
    const labelPairs = new Set(group.map((item) => `${item.firstPoleLabel.trim()}\u0000${item.secondPoleLabel.trim()}`));
    if (labelPairs.size !== 1) {
      issues.add(`DIMENSION_LABEL_CONFLICT:${dimension}`);
      withheldDecisionIds.push(...group.map((item) => item.decisionId));
      continue;
    }
    signals.push(signalFor(group, minDistinctDecisions));
  }

  signals.sort((left, right) => left.dimension.localeCompare(right.dimension));

  const status: DecisionTendencyReviewV1["status"] =
    signals.length > 0
      ? "SIGNALS_AVAILABLE"
      : issues.size > 0
        ? "REVIEW_REQUIRED"
        : "NO_ELIGIBLE_EVIDENCE";

  return deepFreeze({
    contractVersion: DECISION_TENDENCY_REVIEW_VERSION_V1,
    status,
    evaluatedAt,
    signals,
    withheldDecisionIds: unique(withheldDecisionIds),
    unmatchedDecisionIds: unique(unmatchedDecisionIds),
    issues: [...issues].sort((a, b) => a.localeCompare(b)),
    limitations: [...LIMITATIONS],
    authority: AUTHORITY,
  });
}
