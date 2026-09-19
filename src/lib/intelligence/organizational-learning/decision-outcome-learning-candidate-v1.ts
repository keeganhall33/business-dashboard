import { createHash } from "node:crypto";

import type {
  AssumptionOutcomeAssessmentV1,
  DecisionAttributionClassV1,
  DecisionMemoryRecordV1,
  DecisionOutcomeConfounderV1
} from "./decision-memory-v1";
import {
  createValidatedLessonCandidateV1,
  type LearningObjectV1,
  type LearningScope
} from "./learning-object-v1";

export const DECISION_OUTCOME_LEARNING_CANDIDATE_VERSION_V1 =
  "DecisionOutcomeLearningCandidateV1" as const;
export const DECISION_OUTCOME_LEARNING_CANDIDATE_POLICY_VERSION_V1 =
  "decision_outcome_learning_candidate_v1.1.0" as const;

export type DecisionOutcomeLearningCandidateStateV1 =
  | "READY_FOR_REVIEW"
  | "WAIT_FOR_OUTCOME"
  | "WAIT_FOR_MEASUREMENT"
  | "NO_REUSABLE_LESSON"
  | "VERIFY_RECORD";

export type DecisionOutcomeLearningCandidateReasonV1 =
  | "READY_GOVERNED_CANDIDATE"
  | "OUTCOME_NOT_OBSERVED"
  | "LESSON_CANDIDATE_MISSING"
  | "OUTCOME_NOT_DECISION_GRADE"
  | "OUTCOME_INCONCLUSIVE"
  | "DECISION_INTEGRITY_FLAGS"
  | "ACTION_NOT_OBSERVED"
  | "ACTION_EVIDENCE_MISSING"
  | "INVALID_CHRONOLOGY"
  | "MEASUREMENT_PLAN_MISSING"
  | "MEASUREMENT_WINDOW_UNESTABLISHED"
  | "INVALID_MEASUREMENT_WINDOW"
  | "MEASUREMENT_WINDOW_OPEN"
  | "MEASUREMENT_OUTCOME_MISSING"
  | "MEASUREMENT_OUTCOME_UNBOUND"
  | "MEASUREMENT_METRIC_MISMATCH"
  | "MEASUREMENT_UNIT_MISMATCH"
  | "ATTRIBUTION_EVIDENCE_MISSING"
  | "CONFIDENCE_NOT_EVIDENCED"
  | "EVIDENCE_LINEAGE_MISSING"
  | "EVIDENCE_LINEAGE_CONFLICT"
  | "INVALID_CONFIDENCE";

export type DecisionOutcomeLearningEvidenceLineageV1 = Readonly<{
  evidenceId: string;
  sourceLineageId: string;
  observedAt: string;
}>;

export type DecisionOutcomeLearningConfidenceV1 = Readonly<{
  value: number | null;
  evidenceRefs: readonly string[];
}>;

export type DecisionOutcomeLearningCandidateInputV1 = Readonly<{
  record: DecisionMemoryRecordV1;
  generatedAt: string;
  title: string;
  scope: LearningScope;
  confidence: DecisionOutcomeLearningConfidenceV1;
  evidenceLineage: readonly DecisionOutcomeLearningEvidenceLineageV1[];
}>;

export type DecisionOutcomeLearningCandidateV1 = Readonly<{
  contractVersion: typeof DECISION_OUTCOME_LEARNING_CANDIDATE_VERSION_V1;
  policyVersion: typeof DECISION_OUTCOME_LEARNING_CANDIDATE_POLICY_VERSION_V1;
  state: DecisionOutcomeLearningCandidateStateV1;
  reasonCodes: readonly DecisionOutcomeLearningCandidateReasonV1[];
  generatedAt: string;
  decisionId: string;
  decisionClass: DecisionMemoryRecordV1["decisionClass"];
  outcomeObservationId: string | null;
  attributionClass: DecisionAttributionClassV1 | null;
  causalInterpretation: "NOT_ESTABLISHED";
  assumptionAssessments: readonly AssumptionOutcomeAssessmentV1[];
  confounders: readonly DecisionOutcomeConfounderV1[];
  learningCandidate: Readonly<LearningObjectV1> | null;
  limitations: readonly string[];
  authority: Readonly<{
    learningPromotionAllowed: false;
    policyPromotionAllowed: false;
    capabilityPromotionAllowed: false;
    pricingChangeAllowed: false;
    negotiationActionAllowed: false;
    campaignExecutionAllowed: false;
    externalActionAllowed: false;
    persistenceAllowed: false;
    approvalBypassAllowed: false;
  }>;
}>;

const AUTHORITY = Object.freeze({
  learningPromotionAllowed: false,
  policyPromotionAllowed: false,
  capabilityPromotionAllowed: false,
  pricingChangeAllowed: false,
  negotiationActionAllowed: false,
  campaignExecutionAllowed: false,
  externalActionAllowed: false,
  persistenceAllowed: false,
  approvalBypassAllowed: false
} as const);

const LIMITATIONS = Object.freeze([
  "A generated learning object is an INFERRED CANDIDATE for governed review, not company truth.",
  "Observed outcomes and attribution classes are preserved as evidence; this compiler never upgrades them into causal truth.",
  "A lesson cannot enter review until every predeclared expected outcome is observed after its declared evaluation window; early observations remain preliminary evidence only.",
  "Confidence must be supplied with explicit evidence and is never inferred from a decision score, attribution class, or outcome.",
  "This compiler grants no persistence, promotion, pricing, negotiation, campaign, external-action, or approval authority."
] as const);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function canonicalTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) return null;
  const normalized = new Date(millis).toISOString();
  return normalized === value ? value : null;
}

function stableId(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

function baseResult(
  input: DecisionOutcomeLearningCandidateInputV1,
  generatedAt: string,
  state: DecisionOutcomeLearningCandidateStateV1,
  reasons: readonly DecisionOutcomeLearningCandidateReasonV1[],
  learningCandidate: Readonly<LearningObjectV1> | null
): DecisionOutcomeLearningCandidateV1 {
  const observation = input.record.outcomeObservation;
  return deepFreeze({
    contractVersion: DECISION_OUTCOME_LEARNING_CANDIDATE_VERSION_V1,
    policyVersion: DECISION_OUTCOME_LEARNING_CANDIDATE_POLICY_VERSION_V1,
    state,
    reasonCodes: uniqueSorted(reasons) as DecisionOutcomeLearningCandidateReasonV1[],
    generatedAt,
    decisionId: input.record.decisionId,
    decisionClass: input.record.decisionClass,
    outcomeObservationId: observation?.observationId ?? null,
    attributionClass: observation?.attributionClass ?? null,
    causalInterpretation: "NOT_ESTABLISHED",
    assumptionAssessments: observation ? [...observation.assumptionAssessments] : [],
    confounders: observation ? [...observation.confounders] : [],
    learningCandidate,
    limitations: [...LIMITATIONS],
    authority: AUTHORITY
  });
}

function requiredEvidenceRefs(record: DecisionMemoryRecordV1, confidenceRefs: readonly string[]): string[] {
  const observation = record.outcomeObservation;
  if (!observation?.lessonCandidate) return [];
  return uniqueSorted([
    ...observation.lessonCandidate.evidenceRefs,
    ...observation.assessment.evidenceRefs,
    ...observation.attributionEvidenceRefs,
    ...record.actionEvidenceRefs,
    ...confidenceRefs,
    ...observation.assumptionAssessments.flatMap((assessment) => assessment.evidenceRefs)
  ]);
}

function validatedLineageMap(
  entries: readonly DecisionOutcomeLearningEvidenceLineageV1[],
  generatedAtMs: number
): { map: Map<string, DecisionOutcomeLearningEvidenceLineageV1>; conflict: boolean } {
  const map = new Map<string, DecisionOutcomeLearningEvidenceLineageV1>();
  let conflict = false;
  for (const entry of entries) {
    if (!entry || !entry.evidenceId?.trim() || !entry.sourceLineageId?.trim()) continue;
    const observedAt = canonicalTimestamp(entry.observedAt);
    if (!observedAt || Date.parse(observedAt) > generatedAtMs) continue;
    const normalized = {
      evidenceId: entry.evidenceId.trim(),
      sourceLineageId: entry.sourceLineageId.trim(),
      observedAt
    };
    const existing = map.get(normalized.evidenceId);
    if (
      existing &&
      (existing.sourceLineageId !== normalized.sourceLineageId || existing.observedAt !== normalized.observedAt)
    ) {
      conflict = true;
      continue;
    }
    map.set(normalized.evidenceId, normalized);
  }
  return { map, conflict };
}

type MeasurementGateV1 = Readonly<{
  waitReasons: readonly DecisionOutcomeLearningCandidateReasonV1[];
  verifyReasons: readonly DecisionOutcomeLearningCandidateReasonV1[];
}>;

function measurementGate(
  record: DecisionMemoryRecordV1,
  observedAtMs: number,
  generatedAtMs: number
): MeasurementGateV1 {
  const waitReasons: DecisionOutcomeLearningCandidateReasonV1[] = [];
  const verifyReasons: DecisionOutcomeLearningCandidateReasonV1[] = [];
  const expected = record.expectedOutcomes;
  const observed = record.outcomeObservation?.outcomes ?? [];

  if (expected.length === 0) {
    waitReasons.push("MEASUREMENT_PLAN_MISSING");
    return { waitReasons, verifyReasons };
  }

  const expectedById = new Map(expected.map((item) => [item.outcomeId, item] as const));
  const observedById = new Map(observed.map((item) => [item.outcomeId, item] as const));

  if (expectedById.size !== expected.length || observedById.size !== observed.length) {
    verifyReasons.push("MEASUREMENT_OUTCOME_UNBOUND");
  }

  for (const observedItem of observed) {
    if (!expectedById.has(observedItem.outcomeId)) verifyReasons.push("MEASUREMENT_OUTCOME_UNBOUND");
  }

  for (const expectedItem of expected) {
    const observedItem = observedById.get(expectedItem.outcomeId);
    if (!observedItem) {
      waitReasons.push("MEASUREMENT_OUTCOME_MISSING");
    } else {
      if (observedItem.metricRef !== expectedItem.metricRef) verifyReasons.push("MEASUREMENT_METRIC_MISMATCH");
      const expectedUnit = expectedItem.expectedRange.value?.unit ?? null;
      const observedUnit = observedItem.observedRange.value?.unit ?? null;
      if (expectedUnit && observedUnit && expectedUnit !== observedUnit) {
        verifyReasons.push("MEASUREMENT_UNIT_MISMATCH");
      }
    }

    if (expectedItem.evaluationWindowEndsAt == null) {
      waitReasons.push("MEASUREMENT_WINDOW_UNESTABLISHED");
      continue;
    }
    const windowEndsAt = canonicalTimestamp(expectedItem.evaluationWindowEndsAt);
    if (!windowEndsAt) {
      verifyReasons.push("INVALID_MEASUREMENT_WINDOW");
      continue;
    }
    const windowEndsAtMs = Date.parse(windowEndsAt);
    if (windowEndsAtMs > generatedAtMs || windowEndsAtMs > observedAtMs) {
      waitReasons.push("MEASUREMENT_WINDOW_OPEN");
    }
  }

  return {
    waitReasons: uniqueSorted(waitReasons) as DecisionOutcomeLearningCandidateReasonV1[],
    verifyReasons: uniqueSorted(verifyReasons) as DecisionOutcomeLearningCandidateReasonV1[]
  };
}

/**
 * Bridges one canonical decision/outcome observation into the organizational-
 * learning review lane without turning a single result into company truth.
 *
 * The caller must supply evidence-bound candidate confidence and explicit
 * evidence lineage. The compiler never derives either from a score, outcome,
 * attribution label, or prose. It also blocks learning until every declared
 * measurement window has matured and its exact outcome binding is observed.
 * Output is always an INFERRED CANDIDATE and has no promotion or action authority.
 */
export function compileDecisionOutcomeLearningCandidateV1(
  input: DecisionOutcomeLearningCandidateInputV1
): DecisionOutcomeLearningCandidateV1 {
  if (!input?.record || input.record.contractVersion !== "DecisionMemoryV1") {
    throw new Error("DECISION_OUTCOME_LEARNING_INVALID_RECORD");
  }

  const generatedAt = canonicalTimestamp(input.generatedAt);
  if (!generatedAt) throw new Error("DECISION_OUTCOME_LEARNING_INVALID_GENERATED_AT");
  const generatedAtMs = Date.parse(generatedAt);

  if (input.record.integrityFlags.length > 0) {
    return baseResult(input, generatedAt, "VERIFY_RECORD", ["DECISION_INTEGRITY_FLAGS"], null);
  }

  const observation = input.record.outcomeObservation;
  if (!observation) {
    return baseResult(input, generatedAt, "WAIT_FOR_OUTCOME", ["OUTCOME_NOT_OBSERVED"], null);
  }

  if (!observation.lessonCandidate) {
    return baseResult(input, generatedAt, "NO_REUSABLE_LESSON", ["LESSON_CANDIDATE_MISSING"], null);
  }

  if (
    observation.assessment.state !== "KNOWN" ||
    observation.assessment.value == null ||
    observation.assessment.value === "UNKNOWN"
  ) {
    return baseResult(input, generatedAt, "NO_REUSABLE_LESSON", ["OUTCOME_NOT_DECISION_GRADE"], null);
  }
  if (observation.assessment.value === "INCONCLUSIVE") {
    return baseResult(input, generatedAt, "NO_REUSABLE_LESSON", ["OUTCOME_INCONCLUSIVE"], null);
  }

  const reasons: DecisionOutcomeLearningCandidateReasonV1[] = [];
  if (input.record.actionState !== "TAKEN" && input.record.actionState !== "REVERSED") {
    reasons.push("ACTION_NOT_OBSERVED");
  }
  if (input.record.actionEvidenceRefs.length === 0) reasons.push("ACTION_EVIDENCE_MISSING");

  const decidedAt = canonicalTimestamp(input.record.decidedAt);
  const observedAt = canonicalTimestamp(observation.observedAt);
  if (
    !decidedAt ||
    !observedAt ||
    Date.parse(decidedAt) > Date.parse(observedAt) ||
    Date.parse(observedAt) > generatedAtMs
  ) {
    reasons.push("INVALID_CHRONOLOGY");
  }

  if (observedAt) {
    const maturity = measurementGate(input.record, Date.parse(observedAt), generatedAtMs);
    if (maturity.verifyReasons.length > 0) {
      return baseResult(input, generatedAt, "VERIFY_RECORD", [...reasons, ...maturity.verifyReasons], null);
    }
    if (maturity.waitReasons.length > 0) {
      return baseResult(input, generatedAt, "WAIT_FOR_MEASUREMENT", [...reasons, ...maturity.waitReasons], null);
    }
  }

  if (observation.attributionClass !== "UNKNOWN" && observation.attributionEvidenceRefs.length === 0) {
    reasons.push("ATTRIBUTION_EVIDENCE_MISSING");
  }

  const confidenceValue = input.confidence?.value;
  const confidenceRefs = uniqueSorted(input.confidence?.evidenceRefs ?? []);
  if (confidenceValue == null || confidenceRefs.length === 0) {
    reasons.push("CONFIDENCE_NOT_EVIDENCED");
  } else if (!Number.isFinite(confidenceValue) || confidenceValue < 0 || confidenceValue > 1) {
    reasons.push("INVALID_CONFIDENCE");
  }

  const lineage = validatedLineageMap(input.evidenceLineage ?? [], generatedAtMs);
  if (lineage.conflict) reasons.push("EVIDENCE_LINEAGE_CONFLICT");

  const requiredRefs = requiredEvidenceRefs(input.record, confidenceRefs);
  if (requiredRefs.some((ref) => !lineage.map.has(ref))) reasons.push("EVIDENCE_LINEAGE_MISSING");

  if (reasons.length > 0 || confidenceValue == null || !Number.isFinite(confidenceValue)) {
    return baseResult(input, generatedAt, "VERIFY_RECORD", reasons, null);
  }

  const evidence = requiredRefs.map((evidenceId) => {
    const entry = lineage.map.get(evidenceId)!;
    return {
      evidence_id: evidenceId,
      source_lineage_id: entry.sourceLineageId,
      observed_at: entry.observedAt
    };
  });

  const learningId = `decision-outcome-learning:${stableId({
    decisionId: input.record.decisionId,
    observationId: observation.observationId,
    statement: observation.lessonCandidate.statement,
    scope: input.scope,
    evidenceRefs: requiredRefs
  })}`;

  const candidate = createValidatedLessonCandidateV1({
    learning_id: learningId,
    truth_state: "INFERRED",
    scope: input.scope,
    title: input.title,
    content: observation.lessonCandidate.statement,
    confidence: confidenceValue,
    observed_at: generatedAt,
    evidence
  });

  return baseResult(input, generatedAt, "READY_FOR_REVIEW", ["READY_GOVERNED_CANDIDATE"], candidate);
}
