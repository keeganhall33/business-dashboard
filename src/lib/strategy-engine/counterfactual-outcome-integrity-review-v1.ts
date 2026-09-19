import { createHash } from "node:crypto";

import type {
  CounterfactualReviewV1,
  CounterfactualScenarioViewV1
} from "../decision-simulation/counterfactual-review-v1";
import type {
  AssumptionOutcomeV1,
  DecisionAttributionClassV1,
  DecisionMemoryRecordV1,
  DecisionOutcomeAssessmentV1
} from "../intelligence/organizational-learning/decision-memory-v1";

export const COUNTERFACTUAL_OUTCOME_INTEGRITY_REVIEW_VERSION_V1 =
  "CounterfactualOutcomeIntegrityReviewV1" as const;
export const COUNTERFACTUAL_OUTCOME_INTEGRITY_REVIEW_POLICY_VERSION_V1 =
  "counterfactual_outcome_integrity_review_v1.0.0" as const;

const MAX_OUTCOME_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_REFS = 400;

export type CounterfactualOutcomeIntegrityStateV1 =
  | "READY_FOR_GOVERNED_LEARNING_REVIEW"
  | "WAIT_FOR_OUTCOME"
  | "VERIFY_SOURCE"
  | "BLOCKED";

export type CounterfactualOutcomeIntegrityReasonV1 =
  | "READY_FOR_GOVERNED_LEARNING_REVIEW"
  | "INVALID_COUNTERFACTUAL_CONTRACT"
  | "INVALID_DECISION_MEMORY_CONTRACT"
  | "INVALID_REVIEW_TIME"
  | "INVALID_FRESHNESS_POLICY"
  | "DECISION_ID_MISMATCH"
  | "COUNTERFACTUAL_AUTHORITY_WIDENED"
  | "DECISION_AUTHORITY_WIDENED"
  | "DECISION_INTEGRITY_FLAGS"
  | "COUNTERFACTUAL_NOT_COMPARISON_READY"
  | "COUNTERFACTUAL_AFTER_DECISION"
  | "DECISION_IN_FUTURE"
  | "SELECTED_ALTERNATIVE_MISSING"
  | "SELECTED_ALTERNATIVE_UNSUPPORTED"
  | "SELECTED_SCENARIO_MISSING"
  | "SELECTED_SCENARIO_DUPLICATED"
  | "SELECTED_SCENARIO_NOT_COMPARABLE"
  | "DECISION_NOT_EXECUTED"
  | "OUTCOME_NOT_OBSERVED"
  | "OUTCOME_NOT_DECISION_GRADE"
  | "OUTCOME_BEFORE_DECISION"
  | "OUTCOME_IN_FUTURE"
  | "OUTCOME_STALE"
  | "MATERIAL_ASSUMPTION_NOT_IN_DECISION_MEMORY"
  | "MATERIAL_ASSUMPTION_NOT_ASSESSED"
  | "ASSUMPTION_ASSESSMENT_DUPLICATED"
  | "ASSUMPTION_ASSESSMENT_WITHOUT_EVIDENCE";

export type CounterfactualAssumptionLearningSignalV1 = Readonly<{
  assumptionId: string;
  scenarioStatement: string;
  material: boolean;
  scenarioEvidenceRefs: readonly string[];
  decisionStatement: string | null;
  decisionStatementState: DecisionMemoryRecordV1["assumptions"][number]["statement"]["state"] | null;
  decisionEvidenceRefs: readonly string[];
  outcomeAssessment: AssumptionOutcomeV1 | "NOT_ASSESSED";
  outcomeEvidenceRefs: readonly string[];
}>;

export type CounterfactualUnselectedScenarioV1 = Readonly<{
  scenarioId: string;
  scenarioClass: CounterfactualScenarioViewV1["scenarioClass"];
  label: string;
  outcomeStatus: "UNOBSERVED_COUNTERFACTUAL";
}>;

export type CounterfactualOutcomeIntegrityReviewInputV1 = Readonly<{
  counterfactualReview: CounterfactualReviewV1;
  decisionRecord: DecisionMemoryRecordV1;
  reviewedAt: string;
  maximumOutcomeAgeMs: number;
}>;

export type CounterfactualOutcomeIntegrityReviewV1 = Readonly<{
  contractVersion: typeof COUNTERFACTUAL_OUTCOME_INTEGRITY_REVIEW_VERSION_V1;
  policyVersion: typeof COUNTERFACTUAL_OUTCOME_INTEGRITY_REVIEW_POLICY_VERSION_V1;
  reviewId: string;
  reviewedAt: string;
  state: CounterfactualOutcomeIntegrityStateV1;
  reasonCodes: readonly CounterfactualOutcomeIntegrityReasonV1[];
  decisionId: string;
  decisionRecordId: string;
  sourceCounterfactualReviewId: string;
  counterfactualEvaluatedAt: string | null;
  decidedAt: string | null;
  selectedAlternativeId: string;
  selectedScenarioId: string | null;
  selectedScenarioClass: CounterfactualScenarioViewV1["scenarioClass"] | null;
  selectedScenarioLabel: string | null;
  bindingBasis: "EXACT_SELECTED_ALTERNATIVE_TO_SCENARIO_ID" | null;
  semanticEquivalence: "NOT_ESTABLISHED";
  assumptionSignals: readonly CounterfactualAssumptionLearningSignalV1[];
  unselectedScenarios: readonly CounterfactualUnselectedScenarioV1[];
  outcomeObservationId: string | null;
  outcomeAssessment: DecisionOutcomeAssessmentV1 | null;
  attributionClass: DecisionAttributionClassV1;
  outcomeAgeMs: number | null;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  nextInternalStep:
    | "REVIEW_SELECTED_SCENARIO_ASSUMPTION_RESULTS"
    | "COLLECT_OR_COMPLETE_OUTCOME_EVIDENCE"
    | "VERIFY_COUNTERFACTUAL_DECISION_LINEAGE"
    | null;
  counterfactualWinner: null;
  unselectedScenarioOutcomeInference: "PROHIBITED";
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    learningReviewOnly: true;
    scenarioSelectionAuthorized: false;
    counterfactualOutcomeInferenceAuthorized: false;
    decisionMutationAuthorized: false;
    portfolioMutationAuthorized: false;
    allocationChangeAuthorized: false;
    confidenceMutationAuthorized: false;
    monetaryMutationAuthorized: false;
    policyPromotionAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    campaignExecutionAuthorized: false;
    experimentExecutionAuthorized: false;
    externalActionAuthorized: false;
    persistenceAuthorized: false;
    approvalBypassAuthorized: false;
    causalAttributionAuthorized: false;
  }>;
}>;

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  learningReviewOnly: true as const,
  scenarioSelectionAuthorized: false as const,
  counterfactualOutcomeInferenceAuthorized: false as const,
  decisionMutationAuthorized: false as const,
  portfolioMutationAuthorized: false as const,
  allocationChangeAuthorized: false as const,
  confidenceMutationAuthorized: false as const,
  monetaryMutationAuthorized: false as const,
  policyPromotionAuthorized: false as const,
  pricingChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  campaignExecutionAuthorized: false as const,
  experimentExecutionAuthorized: false as const,
  externalActionAuthorized: false as const,
  persistenceAuthorized: false as const,
  approvalBypassAuthorized: false as const,
  causalAttributionAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "Only the scenario explicitly selected by the canonical decision record may be compared with later observed decision evidence.",
  "Unselected scenarios remain counterfactual and unobserved. This review never infers what would have happened under an unchosen path or selects an ex-post winner.",
  "Assumption outcomes are preserved only when explicitly recorded with evidence. Missing assessments remain unresolved rather than being guessed from the overall outcome.",
  "Recorded attribution is preserved as historical evidence and is not upgraded into causality, confidence, monetary value, a pricing rule, a negotiation rule, or a future recommendation.",
  "This projection authorizes no persistence, policy promotion, allocation change, campaign or experiment execution, external action, or approval bypass."
] as const);

const BLOCKING_REASONS = new Set<CounterfactualOutcomeIntegrityReasonV1>([
  "INVALID_COUNTERFACTUAL_CONTRACT",
  "INVALID_DECISION_MEMORY_CONTRACT",
  "INVALID_REVIEW_TIME",
  "DECISION_ID_MISMATCH",
  "COUNTERFACTUAL_AUTHORITY_WIDENED",
  "DECISION_AUTHORITY_WIDENED",
  "DECISION_INTEGRITY_FLAGS",
  "COUNTERFACTUAL_AFTER_DECISION",
  "DECISION_IN_FUTURE",
  "SELECTED_ALTERNATIVE_MISSING",
  "SELECTED_SCENARIO_MISSING",
  "SELECTED_SCENARIO_DUPLICATED"
]);

const VERIFY_REASONS = new Set<CounterfactualOutcomeIntegrityReasonV1>([
  "INVALID_FRESHNESS_POLICY",
  "COUNTERFACTUAL_NOT_COMPARISON_READY",
  "SELECTED_ALTERNATIVE_UNSUPPORTED",
  "SELECTED_SCENARIO_NOT_COMPARABLE",
  "OUTCOME_BEFORE_DECISION",
  "OUTCOME_IN_FUTURE",
  "OUTCOME_STALE",
  "MATERIAL_ASSUMPTION_NOT_IN_DECISION_MEMORY",
  "MATERIAL_ASSUMPTION_NOT_ASSESSED",
  "ASSUMPTION_ASSESSMENT_DUPLICATED",
  "ASSUMPTION_ASSESSMENT_WITHOUT_EVIDENCE"
]);

const WAIT_REASONS = new Set<CounterfactualOutcomeIntegrityReasonV1>([
  "DECISION_NOT_EXECUTED",
  "OUTCOME_NOT_OBSERVED",
  "OUTCOME_NOT_DECISION_GRADE"
]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function timestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  const millis = Date.parse(normalized);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

function uniqueSorted(values: readonly string[] | undefined): readonly string[] {
  if (!Array.isArray(values)) return Object.freeze([]);
  return Object.freeze(
    [...new Set(values.map((value) => text(value)).filter((value): value is string => value !== null))]
      .slice(0, MAX_REFS)
      .sort((a, b) => a.localeCompare(b))
  );
}

function stableId(values: readonly string[]): string {
  return `counterfactual-outcome-integrity:${createHash("sha256")
    .update(values.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function counterfactualAuthorityIsSafe(review: CounterfactualReviewV1 | undefined): boolean {
  const authority = review?.actionAuthority;
  return Boolean(
    authority
      && authority.analysisOnly === true
      && authority.scenarioSelectionAuthorized === false
      && authority.allocationMutationAuthorized === false
      && authority.experimentLaunchAuthorized === false
      && authority.externalActionAuthorized === false
      && authority.spendAuthorized === false
      && authority.pricingChangeAuthorized === false
      && authority.contractAuthorized === false
      && authority.outreachAuthorized === false
      && authority.publishAuthorized === false
      && authority.approvalBypassAuthorized === false
      && authority.causalAttributionAuthorized === false
  );
}

function decisionAuthorityIsSafe(record: DecisionMemoryRecordV1 | undefined): boolean {
  const authority = record?.actionAuthority;
  return Boolean(
    authority
      && authority.analysisOnly === true
      && authority.persistenceAuthorized === false
      && authority.externalActionAuthorized === false
      && authority.pricingChangeAuthorized === false
      && authority.negotiationAuthorized === false
      && authority.spendAuthorized === false
      && authority.publishAuthorized === false
  );
}

function selectedScenarioEvidence(scenario: CounterfactualScenarioViewV1 | null): readonly string[] {
  if (!scenario) return Object.freeze([]);
  return uniqueSorted([
    ...scenario.dimensions.flatMap((dimension) => dimension.evidenceRefs),
    ...scenario.assumptions.flatMap((assumption) => assumption.evidenceRefs),
    ...scenario.resourceDemands.flatMap((resource) => resource.evidenceRefs)
  ]);
}

function decisionOutcomeEvidence(record: DecisionMemoryRecordV1): readonly string[] {
  const observation = record.outcomeObservation;
  return uniqueSorted([
    ...record.sourceRefs,
    ...record.context.evidenceRefs,
    ...record.rationale.evidenceRefs,
    ...record.actionEvidenceRefs,
    ...record.alternatives.flatMap((alternative) => alternative.description.evidenceRefs),
    ...record.assumptions.flatMap((assumption) => assumption.statement.evidenceRefs),
    ...(observation
      ? [
          ...observation.assessment.evidenceRefs,
          ...observation.attributionEvidenceRefs,
          ...observation.sourceRefs,
          ...observation.outcomes.flatMap((outcome) => [
            ...outcome.description.evidenceRefs,
            ...outcome.observedRange.evidenceRefs
          ]),
          ...observation.assumptionAssessments.flatMap((assessment) => assessment.evidenceRefs)
        ]
      : [])
  ]);
}

function stateFor(reasons: ReadonlySet<CounterfactualOutcomeIntegrityReasonV1>): CounterfactualOutcomeIntegrityStateV1 {
  if ([...reasons].some((reason) => BLOCKING_REASONS.has(reason))) return "BLOCKED";
  if ([...reasons].some((reason) => VERIFY_REASONS.has(reason))) return "VERIFY_SOURCE";
  if ([...reasons].some((reason) => WAIT_REASONS.has(reason))) return "WAIT_FOR_OUTCOME";
  return "READY_FOR_GOVERNED_LEARNING_REVIEW";
}

export function reviewCounterfactualOutcomeIntegrityV1(
  input: CounterfactualOutcomeIntegrityReviewInputV1
): CounterfactualOutcomeIntegrityReviewV1 {
  const review = input?.counterfactualReview;
  const record = input?.decisionRecord;
  const reasons = new Set<CounterfactualOutcomeIntegrityReasonV1>();

  if (!review || review.contractVersion !== "CounterfactualReviewV1") {
    reasons.add("INVALID_COUNTERFACTUAL_CONTRACT");
  }
  if (!record || record.contractVersion !== "DecisionMemoryV1") {
    reasons.add("INVALID_DECISION_MEMORY_CONTRACT");
  }

  const reviewedAt = timestamp(input?.reviewedAt);
  if (!reviewedAt) reasons.add("INVALID_REVIEW_TIME");

  const maximumOutcomeAgeMs = input?.maximumOutcomeAgeMs;
  if (
    !Number.isFinite(maximumOutcomeAgeMs)
      || maximumOutcomeAgeMs <= 0
      || maximumOutcomeAgeMs > MAX_OUTCOME_AGE_MS
  ) {
    reasons.add("INVALID_FRESHNESS_POLICY");
  }

  const decisionId = text(record?.decisionId) ?? "unknown-decision";
  const reviewDecisionId = text(review?.decisionId) ?? "unknown-counterfactual-decision";
  if (decisionId !== reviewDecisionId) reasons.add("DECISION_ID_MISMATCH");

  if (review && !counterfactualAuthorityIsSafe(review)) {
    reasons.add("COUNTERFACTUAL_AUTHORITY_WIDENED");
  }
  if (record && !decisionAuthorityIsSafe(record)) {
    reasons.add("DECISION_AUTHORITY_WIDENED");
  }
  if (record && record.integrityFlags.length > 0) {
    reasons.add("DECISION_INTEGRITY_FLAGS");
  }
  if (review?.status !== "COMPARISON_READY") {
    reasons.add("COUNTERFACTUAL_NOT_COMPARISON_READY");
  }

  const decidedAt = timestamp(record?.decidedAt);
  const counterfactualEvaluatedAt = timestamp(review?.evaluatedAt);
  const reviewedAtMs = reviewedAt ? Date.parse(reviewedAt) : null;
  const decidedAtMs = decidedAt ? Date.parse(decidedAt) : null;
  const counterfactualAtMs = counterfactualEvaluatedAt ? Date.parse(counterfactualEvaluatedAt) : null;

  if (decidedAtMs != null && reviewedAtMs != null && decidedAtMs > reviewedAtMs) {
    reasons.add("DECISION_IN_FUTURE");
  }
  if (counterfactualAtMs != null && decidedAtMs != null && counterfactualAtMs > decidedAtMs) {
    reasons.add("COUNTERFACTUAL_AFTER_DECISION");
  }

  const selectedAlternativeId = text(record?.selectedAlternativeId) ?? "unknown-alternative";
  const selectedAlternatives = record?.alternatives.filter(
    (alternative) => alternative.alternativeId === selectedAlternativeId
  ) ?? [];
  const selectedAlternative = selectedAlternatives.length === 1 ? selectedAlternatives[0] : null;
  if (selectedAlternatives.length !== 1) reasons.add("SELECTED_ALTERNATIVE_MISSING");
  if (
    selectedAlternative
      && (selectedAlternative.description.value == null
        || selectedAlternative.description.evidenceRefs.length === 0)
  ) {
    reasons.add("SELECTED_ALTERNATIVE_UNSUPPORTED");
  }

  const matchingScenarios = review?.scenarios.filter(
    (scenario) => scenario.scenarioId === selectedAlternativeId
  ) ?? [];
  const selectedScenario = matchingScenarios.length === 1 ? matchingScenarios[0] : null;
  if (matchingScenarios.length === 0) reasons.add("SELECTED_SCENARIO_MISSING");
  if (matchingScenarios.length > 1) reasons.add("SELECTED_SCENARIO_DUPLICATED");
  if (selectedScenario && selectedScenario.disposition !== "COMPARABLE") {
    reasons.add("SELECTED_SCENARIO_NOT_COMPARABLE");
  }

  if (record && record.actionState !== "TAKEN" && record.actionState !== "REVERSED") {
    reasons.add("DECISION_NOT_EXECUTED");
  }

  const observation = record?.outcomeObservation ?? null;
  let outcomeAgeMs: number | null = null;
  let outcomeAssessment: DecisionOutcomeAssessmentV1 | null = null;
  if (!observation) {
    reasons.add("OUTCOME_NOT_OBSERVED");
  } else {
    const observedAt = timestamp(observation.observedAt);
    const observedAtMs = observedAt ? Date.parse(observedAt) : null;
    if (observedAtMs != null && decidedAtMs != null && observedAtMs < decidedAtMs) {
      reasons.add("OUTCOME_BEFORE_DECISION");
    }
    if (observedAtMs != null && reviewedAtMs != null && observedAtMs > reviewedAtMs) {
      reasons.add("OUTCOME_IN_FUTURE");
    }
    if (
      observedAtMs != null
        && reviewedAtMs != null
        && Number.isFinite(maximumOutcomeAgeMs)
        && maximumOutcomeAgeMs > 0
    ) {
      outcomeAgeMs = reviewedAtMs - observedAtMs;
      if (outcomeAgeMs > maximumOutcomeAgeMs) reasons.add("OUTCOME_STALE");
    }

    if (
      observation.assessment.state === "KNOWN"
        && observation.assessment.value != null
        && observation.assessment.value !== "UNKNOWN"
        && observation.assessment.value !== "INCONCLUSIVE"
        && observation.assessment.evidenceRefs.length > 0
    ) {
      outcomeAssessment = observation.assessment.value;
    } else {
      reasons.add("OUTCOME_NOT_DECISION_GRADE");
    }
  }

  const decisionAssumptions = new Map(
    (record?.assumptions ?? []).map((assumption) => [assumption.assumptionId, assumption] as const)
  );
  const assessmentCounts = new Map<string, number>();
  for (const assessment of observation?.assumptionAssessments ?? []) {
    assessmentCounts.set(assessment.assumptionId, (assessmentCounts.get(assessment.assumptionId) ?? 0) + 1);
    if (assessment.assessment !== "UNRESOLVED" && assessment.evidenceRefs.length === 0) {
      reasons.add("ASSUMPTION_ASSESSMENT_WITHOUT_EVIDENCE");
    }
  }
  if ([...assessmentCounts.values()].some((count) => count > 1)) {
    reasons.add("ASSUMPTION_ASSESSMENT_DUPLICATED");
  }

  const assumptionSignals: CounterfactualAssumptionLearningSignalV1[] = [];
  for (const assumption of selectedScenario?.assumptions ?? []) {
    const decisionAssumption = decisionAssumptions.get(assumption.assumptionId) ?? null;
    const assessments = (observation?.assumptionAssessments ?? []).filter(
      (assessment) => assessment.assumptionId === assumption.assumptionId
    );
    const assessment = assessments.length === 1 ? assessments[0] : null;

    if (assumption.material && !decisionAssumption) {
      reasons.add("MATERIAL_ASSUMPTION_NOT_IN_DECISION_MEMORY");
    }
    if (assumption.material && (!assessment || assessment.assessment === "UNRESOLVED")) {
      reasons.add("MATERIAL_ASSUMPTION_NOT_ASSESSED");
    }

    assumptionSignals.push({
      assumptionId: assumption.assumptionId,
      scenarioStatement: assumption.statement,
      material: assumption.material,
      scenarioEvidenceRefs: uniqueSorted(assumption.evidenceRefs),
      decisionStatement: decisionAssumption?.statement.value ?? null,
      decisionStatementState: decisionAssumption?.statement.state ?? null,
      decisionEvidenceRefs: uniqueSorted(decisionAssumption?.statement.evidenceRefs),
      outcomeAssessment: assessment?.assessment ?? "NOT_ASSESSED",
      outcomeEvidenceRefs: uniqueSorted(assessment?.evidenceRefs)
    });
  }

  const state = stateFor(reasons);
  if (state === "READY_FOR_GOVERNED_LEARNING_REVIEW") {
    reasons.add("READY_FOR_GOVERNED_LEARNING_REVIEW");
  }

  const reasonCodes = Object.freeze(
    [...reasons].sort((a, b) => a.localeCompare(b))
  ) as readonly CounterfactualOutcomeIntegrityReasonV1[];

  const unselectedScenarios = Object.freeze(
    (review?.scenarios ?? [])
      .filter((scenario) => scenario.scenarioId !== selectedAlternativeId)
      .map((scenario) => ({
        scenarioId: scenario.scenarioId,
        scenarioClass: scenario.scenarioClass,
        label: scenario.label,
        outcomeStatus: "UNOBSERVED_COUNTERFACTUAL" as const
      }))
      .sort((a, b) => a.scenarioId.localeCompare(b.scenarioId))
  );

  const evidenceRefs = uniqueSorted([
    ...selectedScenarioEvidence(selectedScenario),
    ...decisionOutcomeEvidence(record),
    ...(selectedAlternative?.description.evidenceRefs ?? [])
  ]);
  const sourceRefs = uniqueSorted(record?.sourceRefs);

  const nextInternalStep = state === "READY_FOR_GOVERNED_LEARNING_REVIEW"
    ? "REVIEW_SELECTED_SCENARIO_ASSUMPTION_RESULTS"
    : state === "WAIT_FOR_OUTCOME"
      ? "COLLECT_OR_COMPLETE_OUTCOME_EVIDENCE"
      : state === "VERIFY_SOURCE"
        ? "VERIFY_COUNTERFACTUAL_DECISION_LINEAGE"
        : null;

  const generatedReviewedAt = reviewedAt ?? input?.reviewedAt ?? "INVALID";
  const selectedScenarioId = selectedScenario?.scenarioId ?? null;
  const bindingBasis = selectedScenario
    ? "EXACT_SELECTED_ALTERNATIVE_TO_SCENARIO_ID" as const
    : null;

  return freezeDeep({
    contractVersion: COUNTERFACTUAL_OUTCOME_INTEGRITY_REVIEW_VERSION_V1,
    policyVersion: COUNTERFACTUAL_OUTCOME_INTEGRITY_REVIEW_POLICY_VERSION_V1,
    reviewId: stableId([
      decisionId,
      text(record?.recordId) ?? "unknown-record",
      text(review?.reviewId) ?? "unknown-review",
      selectedAlternativeId,
      generatedReviewedAt,
      state,
      ...reasonCodes
    ]),
    reviewedAt: generatedReviewedAt,
    state,
    reasonCodes,
    decisionId,
    decisionRecordId: text(record?.recordId) ?? "unknown-record",
    sourceCounterfactualReviewId: text(review?.reviewId) ?? "unknown-review",
    counterfactualEvaluatedAt,
    decidedAt,
    selectedAlternativeId,
    selectedScenarioId,
    selectedScenarioClass: selectedScenario?.scenarioClass ?? null,
    selectedScenarioLabel: selectedScenario?.label ?? null,
    bindingBasis,
    semanticEquivalence: "NOT_ESTABLISHED",
    assumptionSignals: Object.freeze(
      assumptionSignals.sort((a, b) => a.assumptionId.localeCompare(b.assumptionId))
    ),
    unselectedScenarios,
    outcomeObservationId: observation?.observationId ?? null,
    outcomeAssessment,
    attributionClass: observation?.attributionClass ?? "UNKNOWN",
    outcomeAgeMs,
    evidenceRefs,
    sourceRefs,
    nextInternalStep,
    counterfactualWinner: null,
    unselectedScenarioOutcomeInference: "PROHIBITED",
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
