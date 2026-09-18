import { createHash } from "node:crypto";

export const DECISION_MEMORY_POLICY_VERSION_V1 = "decision_memory_v1.0.0" as const;

export type DecisionMemoryTruthStateV1 =
  | "KNOWN"
  | "INFERRED"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED";

export type DecisionMemoryClassV1 =
  | "STRATEGY"
  | "ALLOCATION"
  | "PRICING"
  | "NEGOTIATION"
  | "CAMPAIGN"
  | "EXPERIMENT"
  | "RELATIONSHIP"
  | "REVENUE"
  | "OPERATIONS"
  | "OTHER";

export type DecisionActionStateV1 =
  | "PLANNED"
  | "TAKEN"
  | "DEFERRED"
  | "REJECTED"
  | "REVERSED";

export type DecisionConfidenceLevelV1 = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type DecisionAttributionClassV1 = "CAUSAL" | "CONTRIBUTORY" | "CORRELATIONAL" | "UNKNOWN";
export type DecisionOutcomeAssessmentV1 =
  | "POSITIVE"
  | "NEUTRAL"
  | "NEGATIVE"
  | "INCONCLUSIVE"
  | "UNKNOWN";
export type AssumptionOutcomeV1 = "SUPPORTED" | "REFUTED" | "UNRESOLVED";

export type EvidenceBoundDecisionValueV1<T> = {
  state: DecisionMemoryTruthStateV1;
  value: T | null;
  evidenceRefs: readonly string[];
};

export type DecisionAlternativeV1 = {
  alternativeId: string;
  label: string;
  description: EvidenceBoundDecisionValueV1<string>;
};

export type DecisionAssumptionV1 = {
  assumptionId: string;
  statement: EvidenceBoundDecisionValueV1<string>;
  material: boolean;
  revisitTrigger: string | null;
};

export type DecisionExpectedRangeV1 = {
  min: number;
  max: number;
  unit: string;
};

export type DecisionExpectedOutcomeV1 = {
  outcomeId: string;
  metricRef: string | null;
  description: EvidenceBoundDecisionValueV1<string>;
  expectedRange: EvidenceBoundDecisionValueV1<DecisionExpectedRangeV1>;
  evaluationWindowEndsAt: string | null;
};

export type DecisionApprovalV1 = {
  authorityClass: string;
  approvalState: "NOT_REQUIRED" | "REQUIRED" | "APPROVED" | "REJECTED" | "UNKNOWN";
  approvedByRef: string | null;
  approvedAt: string | null;
  evidenceRefs: readonly string[];
};

export type DecisionMemoryInputV1 = {
  decisionId: string;
  decisionClass: DecisionMemoryClassV1;
  decidedAt: string;
  actorRef: string;
  context: EvidenceBoundDecisionValueV1<string>;
  selectedAlternativeId: string;
  alternatives: readonly DecisionAlternativeV1[];
  rationale: EvidenceBoundDecisionValueV1<string>;
  assumptions: readonly DecisionAssumptionV1[];
  confidence: EvidenceBoundDecisionValueV1<DecisionConfidenceLevelV1>;
  expectedOutcomes: readonly DecisionExpectedOutcomeV1[];
  successCriteria: readonly EvidenceBoundDecisionValueV1<string>[];
  failureCriteria: readonly EvidenceBoundDecisionValueV1<string>[];
  revisitTriggers: readonly string[];
  validUntil: string | null;
  approval: DecisionApprovalV1;
  actionState: DecisionActionStateV1;
  actionEvidenceRefs: readonly string[];
  supersedesDecisionId: string | null;
  sourceRefs: readonly string[];
};

export type DecisionMemoryIntegrityFlagV1 =
  | "CONTEXT_UNSUPPORTED"
  | "RATIONALE_UNSUPPORTED"
  | "CONFIDENCE_UNSUPPORTED"
  | "SELECTED_ALTERNATIVE_MISSING"
  | "MATERIAL_ASSUMPTION_UNRESOLVED"
  | "EXPECTED_OUTCOME_UNSUPPORTED"
  | "APPROVAL_EVIDENCE_MISSING";

export type DecisionMemoryRecordV1 = {
  contractVersion: "DecisionMemoryV1";
  policyVersion: typeof DECISION_MEMORY_POLICY_VERSION_V1;
  recordId: string;
  decisionId: string;
  decisionClass: DecisionMemoryClassV1;
  decidedAt: string;
  actorRef: string;
  context: EvidenceBoundDecisionValueV1<string>;
  selectedAlternativeId: string;
  alternatives: readonly DecisionAlternativeV1[];
  rationale: EvidenceBoundDecisionValueV1<string>;
  assumptions: readonly DecisionAssumptionV1[];
  confidence: EvidenceBoundDecisionValueV1<DecisionConfidenceLevelV1>;
  expectedOutcomes: readonly DecisionExpectedOutcomeV1[];
  successCriteria: readonly EvidenceBoundDecisionValueV1<string>[];
  failureCriteria: readonly EvidenceBoundDecisionValueV1<string>[];
  revisitTriggers: readonly string[];
  validUntil: string | null;
  approval: DecisionApprovalV1;
  actionState: DecisionActionStateV1;
  actionEvidenceRefs: readonly string[];
  supersedesDecisionId: string | null;
  sourceRefs: readonly string[];
  integrityFlags: readonly DecisionMemoryIntegrityFlagV1[];
  outcomeObservation: DecisionOutcomeObservationV1 | null;
  priorRecordId: string | null;
  actionAuthority: {
    analysisOnly: true;
    persistenceAuthorized: false;
    externalActionAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationAuthorized: false;
    spendAuthorized: false;
    publishAuthorized: false;
  };
};

export type ObservedDecisionOutcomeV1 = {
  outcomeId: string;
  metricRef: string | null;
  description: EvidenceBoundDecisionValueV1<string>;
  observedRange: EvidenceBoundDecisionValueV1<DecisionExpectedRangeV1>;
};

export type DecisionOutcomeConfounderV1 = {
  confounderId: string;
  description: string;
  evidenceRefs: readonly string[];
};

export type AssumptionOutcomeAssessmentV1 = {
  assumptionId: string;
  assessment: AssumptionOutcomeV1;
  evidenceRefs: readonly string[];
};

export type DecisionLessonCandidateV1 = {
  statement: string;
  evidenceRefs: readonly string[];
  reviewState: "GOVERNED_REVIEW_REQUIRED";
  policyPromotionAuthorized: false;
  pricingRulePromotionAuthorized: false;
  negotiationRulePromotionAuthorized: false;
  capabilityPromotionAuthorized: false;
};

export type DecisionOutcomeObservationV1 = {
  observationId: string;
  observedAt: string;
  outcomes: readonly ObservedDecisionOutcomeV1[];
  assessment: EvidenceBoundDecisionValueV1<DecisionOutcomeAssessmentV1>;
  attributionClass: DecisionAttributionClassV1;
  attributionEvidenceRefs: readonly string[];
  confounders: readonly DecisionOutcomeConfounderV1[];
  assumptionAssessments: readonly AssumptionOutcomeAssessmentV1[];
  lessonCandidate: DecisionLessonCandidateV1 | null;
  sourceRefs: readonly string[];
};

export type DecisionOutcomeObservationInputV1 = {
  observedAt: string;
  outcomes: readonly ObservedDecisionOutcomeV1[];
  assessment: EvidenceBoundDecisionValueV1<DecisionOutcomeAssessmentV1>;
  attributionClass: DecisionAttributionClassV1;
  attributionEvidenceRefs: readonly string[];
  confounders: readonly DecisionOutcomeConfounderV1[];
  assumptionAssessments: readonly AssumptionOutcomeAssessmentV1[];
  lessonCandidate: {
    statement: string;
    evidenceRefs: readonly string[];
  } | null;
  sourceRefs: readonly string[];
};

export class DecisionMemoryError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DecisionMemoryError";
  }
}

const MAX_ITEMS = 100;
const MAX_REFS = 100;
const MAX_TEXT = 1_000;
const SUPPORTED_VALUE_STATES = new Set<DecisionMemoryTruthStateV1>(["KNOWN", "INFERRED"]);

function required(value: unknown, label: string, max = MAX_TEXT): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DecisionMemoryError("REQUIRED_FIELD", `${label} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > max) {
    throw new DecisionMemoryError("BOUNDS_EXCEEDED", `${label} exceeds ${max} characters`);
  }
  return normalized;
}

function optional(value: unknown, label: string, max = MAX_TEXT): string | null {
  if (value == null) return null;
  return required(value, label, max);
}

function timestamp(value: unknown, label: string): string {
  const normalized = required(value, label, 128);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new DecisionMemoryError("INVALID_TIMESTAMP", `${label} must be a valid ISO timestamp`);
  }
  return normalized;
}

function optionalTimestamp(value: unknown, label: string): string | null {
  if (value == null) return null;
  return timestamp(value, label);
}

function refs(values: readonly string[], label: string): string[] {
  if (!Array.isArray(values) || values.length > MAX_REFS) {
    throw new DecisionMemoryError("BOUNDS_EXCEEDED", `${label} exceeds supported bounds`);
  }
  return [...new Set(values.map((value) => required(value, label, 256)))].sort((a, b) => a.localeCompare(b));
}

function boundedArray<T>(values: readonly T[], label: string): readonly T[] {
  if (!Array.isArray(values) || values.length > MAX_ITEMS) {
    throw new DecisionMemoryError("BOUNDS_EXCEEDED", `${label} exceeds supported bounds`);
  }
  return values;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
  );
}

function stableId(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")
    .slice(0, 24);
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function normalizeBoundValue<T>(
  bound: EvidenceBoundDecisionValueV1<T>,
  label: string,
  normalizeValue: (value: T, label: string) => T
): EvidenceBoundDecisionValueV1<T> {
  if (!bound || typeof bound !== "object" || Array.isArray(bound)) {
    throw new DecisionMemoryError("INVALID_BOUND_VALUE", `${label} must be an object`);
  }
  const evidenceRefs = refs(bound.evidenceRefs, `${label}.evidenceRefs`);
  if (SUPPORTED_VALUE_STATES.has(bound.state) && bound.value != null && evidenceRefs.length > 0) {
    return {
      state: bound.state,
      value: normalizeValue(bound.value, `${label}.value`),
      evidenceRefs
    };
  }
  return {
    state: bound.state,
    value: null,
    evidenceRefs
  };
}

function normalizeTextBound(
  bound: EvidenceBoundDecisionValueV1<string>,
  label: string
): EvidenceBoundDecisionValueV1<string> {
  return normalizeBoundValue(bound, label, (value, valueLabel) => required(value, valueLabel));
}

function normalizeConfidence(
  bound: EvidenceBoundDecisionValueV1<DecisionConfidenceLevelV1>
): EvidenceBoundDecisionValueV1<DecisionConfidenceLevelV1> {
  const normalized = normalizeBoundValue(bound, "confidence", (value) => value);
  if (normalized.value === "UNKNOWN") {
    return { state: "UNKNOWN", value: "UNKNOWN", evidenceRefs: normalized.evidenceRefs };
  }
  return normalized;
}

function normalizeRange(
  bound: EvidenceBoundDecisionValueV1<DecisionExpectedRangeV1>,
  label: string
): EvidenceBoundDecisionValueV1<DecisionExpectedRangeV1> {
  return normalizeBoundValue(bound, label, (value, valueLabel) => {
    if (!Number.isFinite(value.min) || !Number.isFinite(value.max) || value.max < value.min) {
      throw new DecisionMemoryError("INVALID_RANGE", `${valueLabel} range is invalid`);
    }
    return {
      min: value.min,
      max: value.max,
      unit: required(value.unit, `${valueLabel}.unit`, 64)
    };
  });
}

function normalizeAlternative(alternative: DecisionAlternativeV1): DecisionAlternativeV1 {
  return {
    alternativeId: required(alternative.alternativeId, "alternative.alternativeId", 256),
    label: required(alternative.label, "alternative.label", 256),
    description: normalizeTextBound(alternative.description, "alternative.description")
  };
}

function normalizeAssumption(assumption: DecisionAssumptionV1): DecisionAssumptionV1 {
  return {
    assumptionId: required(assumption.assumptionId, "assumption.assumptionId", 256),
    statement: normalizeTextBound(assumption.statement, "assumption.statement"),
    material: assumption.material === true,
    revisitTrigger: optional(assumption.revisitTrigger, "assumption.revisitTrigger")
  };
}

function normalizeExpectedOutcome(outcome: DecisionExpectedOutcomeV1): DecisionExpectedOutcomeV1 {
  return {
    outcomeId: required(outcome.outcomeId, "expectedOutcome.outcomeId", 256),
    metricRef: optional(outcome.metricRef, "expectedOutcome.metricRef", 256),
    description: normalizeTextBound(outcome.description, "expectedOutcome.description"),
    expectedRange: normalizeRange(outcome.expectedRange, "expectedOutcome.expectedRange"),
    evaluationWindowEndsAt: optionalTimestamp(
      outcome.evaluationWindowEndsAt,
      "expectedOutcome.evaluationWindowEndsAt"
    )
  };
}

function normalizeApproval(approval: DecisionApprovalV1): DecisionApprovalV1 {
  const evidenceRefs = refs(approval.evidenceRefs, "approval.evidenceRefs");
  return {
    authorityClass: required(approval.authorityClass, "approval.authorityClass", 128),
    approvalState: approval.approvalState,
    approvedByRef: optional(approval.approvedByRef, "approval.approvedByRef", 256),
    approvedAt: optionalTimestamp(approval.approvedAt, "approval.approvedAt"),
    evidenceRefs
  };
}

function normalizeCriteria(
  values: readonly EvidenceBoundDecisionValueV1<string>[],
  label: string
): EvidenceBoundDecisionValueV1<string>[] {
  return boundedArray(values, label).map((value, index) =>
    normalizeTextBound(value, `${label}[${index}]`)
  );
}

function integrityFlags(args: {
  context: EvidenceBoundDecisionValueV1<string>;
  rationale: EvidenceBoundDecisionValueV1<string>;
  confidence: EvidenceBoundDecisionValueV1<DecisionConfidenceLevelV1>;
  selectedAlternativeId: string;
  alternatives: readonly DecisionAlternativeV1[];
  assumptions: readonly DecisionAssumptionV1[];
  expectedOutcomes: readonly DecisionExpectedOutcomeV1[];
  approval: DecisionApprovalV1;
}): DecisionMemoryIntegrityFlagV1[] {
  const flags = new Set<DecisionMemoryIntegrityFlagV1>();
  if (args.context.value == null) flags.add("CONTEXT_UNSUPPORTED");
  if (args.rationale.value == null) flags.add("RATIONALE_UNSUPPORTED");
  if (args.confidence.value == null || args.confidence.value === "UNKNOWN") {
    flags.add("CONFIDENCE_UNSUPPORTED");
  }
  if (!args.alternatives.some((alternative) => alternative.alternativeId === args.selectedAlternativeId)) {
    flags.add("SELECTED_ALTERNATIVE_MISSING");
  }
  if (args.assumptions.some((assumption) => assumption.material && assumption.statement.value == null)) {
    flags.add("MATERIAL_ASSUMPTION_UNRESOLVED");
  }
  if (
    args.expectedOutcomes.some(
      (outcome) => outcome.description.value == null && outcome.expectedRange.value == null
    )
  ) {
    flags.add("EXPECTED_OUTCOME_UNSUPPORTED");
  }
  if (
    ["APPROVED", "REJECTED"].includes(args.approval.approvalState) &&
    args.approval.evidenceRefs.length === 0
  ) {
    flags.add("APPROVAL_EVIDENCE_MISSING");
  }
  return [...flags].sort((a, b) => a.localeCompare(b));
}

function actionAuthority(): DecisionMemoryRecordV1["actionAuthority"] {
  return {
    analysisOnly: true,
    persistenceAuthorized: false,
    externalActionAuthorized: false,
    pricingChangeAuthorized: false,
    negotiationAuthorized: false,
    spendAuthorized: false,
    publishAuthorized: false
  };
}

export function compileDecisionMemoryV1(input: DecisionMemoryInputV1): DecisionMemoryRecordV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DecisionMemoryError("INVALID_INPUT", "input must be an object");
  }

  const decisionId = required(input.decisionId, "decisionId", 256);
  const decidedAt = timestamp(input.decidedAt, "decidedAt");
  const actorRef = required(input.actorRef, "actorRef", 256);
  const context = normalizeTextBound(input.context, "context");
  const selectedAlternativeId = required(input.selectedAlternativeId, "selectedAlternativeId", 256);
  const alternatives = boundedArray(input.alternatives, "alternatives")
    .map(normalizeAlternative)
    .sort((a, b) => a.alternativeId.localeCompare(b.alternativeId));
  if (new Set(alternatives.map((alternative) => alternative.alternativeId)).size !== alternatives.length) {
    throw new DecisionMemoryError("DUPLICATE_ALTERNATIVE", "alternative ids must be unique");
  }
  const rationale = normalizeTextBound(input.rationale, "rationale");
  const assumptions = boundedArray(input.assumptions, "assumptions")
    .map(normalizeAssumption)
    .sort((a, b) => a.assumptionId.localeCompare(b.assumptionId));
  if (new Set(assumptions.map((assumption) => assumption.assumptionId)).size !== assumptions.length) {
    throw new DecisionMemoryError("DUPLICATE_ASSUMPTION", "assumption ids must be unique");
  }
  const confidence = normalizeConfidence(input.confidence);
  const expectedOutcomes = boundedArray(input.expectedOutcomes, "expectedOutcomes")
    .map(normalizeExpectedOutcome)
    .sort((a, b) => a.outcomeId.localeCompare(b.outcomeId));
  if (new Set(expectedOutcomes.map((outcome) => outcome.outcomeId)).size !== expectedOutcomes.length) {
    throw new DecisionMemoryError("DUPLICATE_EXPECTED_OUTCOME", "expected outcome ids must be unique");
  }
  const successCriteria = normalizeCriteria(input.successCriteria, "successCriteria");
  const failureCriteria = normalizeCriteria(input.failureCriteria, "failureCriteria");
  const revisitTriggers = refs(input.revisitTriggers, "revisitTriggers");
  const validUntil = optionalTimestamp(input.validUntil, "validUntil");
  const approval = normalizeApproval(input.approval);
  const actionEvidenceRefs = refs(input.actionEvidenceRefs, "actionEvidenceRefs");
  const supersedesDecisionId = optional(input.supersedesDecisionId, "supersedesDecisionId", 256);
  const sourceRefs = refs(input.sourceRefs, "sourceRefs");

  const flags = integrityFlags({
    context,
    rationale,
    confidence,
    selectedAlternativeId,
    alternatives,
    assumptions,
    expectedOutcomes,
    approval
  });

  const normalized = {
    decisionId,
    decisionClass: input.decisionClass,
    decidedAt,
    actorRef,
    context,
    selectedAlternativeId,
    alternatives,
    rationale,
    assumptions,
    confidence,
    expectedOutcomes,
    successCriteria,
    failureCriteria,
    revisitTriggers,
    validUntil,
    approval,
    actionState: input.actionState,
    actionEvidenceRefs,
    supersedesDecisionId,
    sourceRefs,
    integrityFlags: flags
  };

  const record: DecisionMemoryRecordV1 = {
    contractVersion: "DecisionMemoryV1",
    policyVersion: DECISION_MEMORY_POLICY_VERSION_V1,
    recordId: stableId(normalized),
    ...normalized,
    outcomeObservation: null,
    priorRecordId: null,
    actionAuthority: actionAuthority()
  };

  return freeze(record);
}

function normalizeObservedOutcome(outcome: ObservedDecisionOutcomeV1): ObservedDecisionOutcomeV1 {
  return {
    outcomeId: required(outcome.outcomeId, "observedOutcome.outcomeId", 256),
    metricRef: optional(outcome.metricRef, "observedOutcome.metricRef", 256),
    description: normalizeTextBound(outcome.description, "observedOutcome.description"),
    observedRange: normalizeRange(outcome.observedRange, "observedOutcome.observedRange")
  };
}

function normalizeConfounder(confounder: DecisionOutcomeConfounderV1): DecisionOutcomeConfounderV1 {
  return {
    confounderId: required(confounder.confounderId, "confounder.confounderId", 256),
    description: required(confounder.description, "confounder.description"),
    evidenceRefs: refs(confounder.evidenceRefs, "confounder.evidenceRefs")
  };
}

function normalizeAssumptionAssessment(
  assessment: AssumptionOutcomeAssessmentV1,
  knownAssumptionIds: ReadonlySet<string>
): AssumptionOutcomeAssessmentV1 {
  const assumptionId = required(assessment.assumptionId, "assumptionAssessment.assumptionId", 256);
  if (!knownAssumptionIds.has(assumptionId)) {
    throw new DecisionMemoryError(
      "UNKNOWN_ASSUMPTION",
      `outcome observation references unknown assumption ${assumptionId}`
    );
  }
  const evidenceRefs = refs(assessment.evidenceRefs, "assumptionAssessment.evidenceRefs");
  return {
    assumptionId,
    assessment: evidenceRefs.length === 0 ? "UNRESOLVED" : assessment.assessment,
    evidenceRefs
  };
}

function normalizeLessonCandidate(
  lesson: DecisionOutcomeObservationInputV1["lessonCandidate"]
): DecisionLessonCandidateV1 | null {
  if (lesson == null) return null;
  const evidenceRefs = refs(lesson.evidenceRefs, "lessonCandidate.evidenceRefs");
  if (evidenceRefs.length === 0) return null;
  return {
    statement: required(lesson.statement, "lessonCandidate.statement"),
    evidenceRefs,
    reviewState: "GOVERNED_REVIEW_REQUIRED",
    policyPromotionAuthorized: false,
    pricingRulePromotionAuthorized: false,
    negotiationRulePromotionAuthorized: false,
    capabilityPromotionAuthorized: false
  };
}

export function attachDecisionOutcomeObservationV1(
  record: DecisionMemoryRecordV1,
  input: DecisionOutcomeObservationInputV1
): DecisionMemoryRecordV1 {
  if (!record || record.contractVersion !== "DecisionMemoryV1") {
    throw new DecisionMemoryError("INVALID_RECORD", "record must be DecisionMemoryV1");
  }
  if (record.outcomeObservation != null) {
    throw new DecisionMemoryError(
      "OUTCOME_ALREADY_ATTACHED",
      "attach a new observation only through an explicit future revision contract"
    );
  }

  const observedAt = timestamp(input.observedAt, "observedAt");
  const outcomes = boundedArray(input.outcomes, "outcomes")
    .map(normalizeObservedOutcome)
    .sort((a, b) => a.outcomeId.localeCompare(b.outcomeId));
  if (new Set(outcomes.map((outcome) => outcome.outcomeId)).size !== outcomes.length) {
    throw new DecisionMemoryError("DUPLICATE_OBSERVED_OUTCOME", "observed outcome ids must be unique");
  }
  const assessment = normalizeBoundValue(
    input.assessment,
    "assessment",
    (value) => value
  );
  const attributionEvidenceRefs = refs(
    input.attributionEvidenceRefs,
    "attributionEvidenceRefs"
  );
  const attributionClass =
    input.attributionClass === "CAUSAL" && attributionEvidenceRefs.length === 0
      ? "UNKNOWN"
      : input.attributionClass;
  const confounders = boundedArray(input.confounders, "confounders")
    .map(normalizeConfounder)
    .sort((a, b) => a.confounderId.localeCompare(b.confounderId));
  const knownAssumptionIds = new Set(record.assumptions.map((assumption) => assumption.assumptionId));
  const assumptionAssessments = boundedArray(
    input.assumptionAssessments,
    "assumptionAssessments"
  )
    .map((item) => normalizeAssumptionAssessment(item, knownAssumptionIds))
    .sort((a, b) => a.assumptionId.localeCompare(b.assumptionId));
  const lessonCandidate = normalizeLessonCandidate(input.lessonCandidate);
  const sourceRefs = refs(input.sourceRefs, "outcome.sourceRefs");

  const observation: DecisionOutcomeObservationV1 = {
    observationId: stableId({
      decisionId: record.decisionId,
      observedAt,
      outcomes,
      assessment,
      attributionClass,
      attributionEvidenceRefs,
      confounders,
      assumptionAssessments,
      lessonCandidate,
      sourceRefs
    }),
    observedAt,
    outcomes,
    assessment,
    attributionClass,
    attributionEvidenceRefs,
    confounders,
    assumptionAssessments,
    lessonCandidate,
    sourceRefs
  };

  const next: DecisionMemoryRecordV1 = {
    ...record,
    recordId: stableId({ priorRecordId: record.recordId, observation }),
    outcomeObservation: observation,
    priorRecordId: record.recordId,
    actionAuthority: actionAuthority()
  };
  return freeze(next);
}
