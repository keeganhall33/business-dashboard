import { createHash } from "node:crypto";

import type {
  DecisionAttributionClassV1,
  DecisionMemoryClassV1,
  DecisionMemoryRecordV1
} from "./decision-memory-v1";
import {
  validateLearningObjectV1,
  type LearningObjectV1
} from "./learning-object-v1";
import type {
  RecurringLessonDomainV1,
  RecurringLessonObservationV1
} from "./recurring-decision-lessons-v1";

export const DECISION_MEMORY_RECURRING_LEARNING_POLICY_VERSION_V1 =
  "decision_memory_recurring_learning_v1.0.0" as const;

export type DecisionMemoryRecurringLearningStateV1 =
  | "READY"
  | "WAIT_FOR_OUTCOME"
  | "NOT_APPLICABLE"
  | "VERIFY_RECORD";

export type DecisionMemoryRecurringLearningReasonV1 =
  | "READY_FOR_RECURRING_REVIEW"
  | "UNSUPPORTED_DECISION_CLASS"
  | "OUTCOME_NOT_OBSERVED"
  | "LESSON_CANDIDATE_MISSING"
  | "DECISION_INTEGRITY_FLAGS"
  | "ACTION_NOT_OBSERVED"
  | "ACTION_EVIDENCE_MISSING"
  | "INVALID_CHRONOLOGY"
  | "OUTCOME_ASSESSMENT_UNSUPPORTED"
  | "OUTCOME_INCONCLUSIVE"
  | "LEARNING_OBJECT_INVALID"
  | "LEARNING_OBJECT_NOT_REVIEWED"
  | "LEARNING_OBJECT_NOT_KNOWN"
  | "LESSON_STATEMENT_MISMATCH"
  | "LESSON_EVIDENCE_GAP"
  | "OUTCOME_EVIDENCE_GAP"
  | "ACTION_EVIDENCE_GAP"
  | "LESSON_LINEAGE_NOT_PROVEN";

export type DecisionMemoryRecurringLearningHandoffV1 = {
  contractVersion: "DecisionMemoryRecurringLearningHandoffV1";
  policyVersion: typeof DECISION_MEMORY_RECURRING_LEARNING_POLICY_VERSION_V1;
  state: DecisionMemoryRecurringLearningStateV1;
  reasonCodes: readonly DecisionMemoryRecurringLearningReasonV1[];
  generatedAt: string;
  decisionId: string;
  decisionClass: DecisionMemoryClassV1;
  domain: RecurringLessonDomainV1 | null;
  outcomeObservationId: string | null;
  learningId: string | null;
  attributionClass: DecisionAttributionClassV1 | null;
  causalInterpretation: "NOT_ESTABLISHED";
  observations: readonly RecurringLessonObservationV1[];
  limitations: readonly string[];
  actionAuthority: {
    analysisOnly: true;
    persistenceAuthorized: false;
    policyPromotionAuthorized: false;
    capabilityPromotionAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  };
};

export class DecisionMemoryRecurringLearningError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DecisionMemoryRecurringLearningError";
  }
}

const DECISION_DOMAIN_MAP: Readonly<Partial<Record<DecisionMemoryClassV1, RecurringLessonDomainV1>>> =
  Object.freeze({
    PRICING: "PRICING",
    NEGOTIATION: "NEGOTIATION",
    CAMPAIGN: "CAMPAIGN",
    STRATEGY: "STRATEGY",
    RELATIONSHIP: "RELATIONSHIP",
    REVENUE: "REVENUE",
    OPERATIONS: "OPERATIONS"
  });

function authority(): DecisionMemoryRecurringLearningHandoffV1["actionAuthority"] {
  return {
    analysisOnly: true,
    persistenceAuthorized: false,
    policyPromotionAuthorized: false,
    capabilityPromotionAuthorized: false,
    pricingChangeAuthorized: false,
    negotiationActionAuthorized: false,
    externalActionAuthorized: false,
    approvalBypassAuthorized: false
  };
}

function canonicalTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DecisionMemoryRecurringLearningError("INVALID_TIMESTAMP", `${label} is required`);
  }
  const normalized = value.trim();
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== normalized) {
    throw new DecisionMemoryRecurringLearningError(
      "INVALID_TIMESTAMP",
      `${label} must be a canonical ISO timestamp`
    );
  }
  return normalized;
}

function normalizedStatement(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function stableId(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values.map((value) => value.trim() as T).filter((value) => value.length > 0))]
    .sort((a, b) => a.localeCompare(b));
}

function limitations(): readonly string[] {
  return Object.freeze([
    "This handoff proves lineage from one canonical decision/outcome into an already-reviewed lesson object; it does not approve or persist a lesson.",
    "Recurring evidence is not causal evidence. Attribution class is preserved, while causal interpretation remains NOT_ESTABLISHED.",
    "A recurring review candidate cannot directly change pricing, negotiate, publish, spend, send, create policy, or promote a reusable capability.",
    "No confidence score, monetary value, or outcome is synthesized by this adapter."
  ]);
}

function result(args: {
  state: DecisionMemoryRecurringLearningStateV1;
  reasons: readonly DecisionMemoryRecurringLearningReasonV1[];
  generatedAt: string;
  record: DecisionMemoryRecordV1;
  domain: RecurringLessonDomainV1 | null;
  learningId: string | null;
  observations?: readonly RecurringLessonObservationV1[];
}): DecisionMemoryRecurringLearningHandoffV1 {
  const observations = (args.observations ?? []).map((observation) => Object.freeze({ ...observation }));
  return Object.freeze({
    contractVersion: "DecisionMemoryRecurringLearningHandoffV1" as const,
    policyVersion: DECISION_MEMORY_RECURRING_LEARNING_POLICY_VERSION_V1,
    state: args.state,
    reasonCodes: Object.freeze(uniqueSorted(args.reasons)),
    generatedAt: args.generatedAt,
    decisionId: args.record.decisionId,
    decisionClass: args.record.decisionClass,
    domain: args.domain,
    outcomeObservationId: args.record.outcomeObservation?.observationId ?? null,
    learningId: args.learningId,
    attributionClass: args.record.outcomeObservation?.attributionClass ?? null,
    causalInterpretation: "NOT_ESTABLISHED" as const,
    observations: Object.freeze(observations),
    limitations: limitations(),
    actionAuthority: Object.freeze(authority())
  });
}

function chronologyIsValid(
  record: DecisionMemoryRecordV1,
  learning: Readonly<LearningObjectV1>,
  generatedAt: string
): boolean {
  const generatedMs = Date.parse(generatedAt);
  const decidedMs = Date.parse(record.decidedAt);
  const observation = record.outcomeObservation;
  if (!Number.isFinite(decidedMs) || decidedMs > generatedMs || !observation) return false;

  const observedMs = Date.parse(observation.observedAt);
  const learningCreatedMs = Date.parse(learning.created_at);
  const learningUpdatedMs = Date.parse(learning.updated_at);
  const reviewedMs = learning.approval ? Date.parse(learning.approval.reviewed_at) : Number.NaN;

  if (
    !Number.isFinite(observedMs) ||
    observedMs < decidedMs ||
    observedMs > generatedMs ||
    !Number.isFinite(learningCreatedMs) ||
    !Number.isFinite(learningUpdatedMs) ||
    learningCreatedMs > learningUpdatedMs ||
    learningUpdatedMs > generatedMs ||
    !Number.isFinite(reviewedMs) ||
    reviewedMs < learningCreatedMs ||
    reviewedMs > generatedMs
  ) {
    return false;
  }

  return learning.evidence.every((evidence) => {
    const observedAt = Date.parse(evidence.observed_at);
    return Number.isFinite(observedAt) && observedAt <= generatedMs;
  });
}

function missingEvidence(requiredRefs: readonly string[], learning: Readonly<LearningObjectV1>): string[] {
  const available = new Set(learning.evidence.map((item) => item.evidence_id));
  return uniqueSorted(requiredRefs.filter((ref) => !available.has(ref)));
}

export function compileDecisionMemoryRecurringLearningHandoffV1(args: {
  record: DecisionMemoryRecordV1;
  learningObject: LearningObjectV1;
  generatedAt: string;
}): DecisionMemoryRecurringLearningHandoffV1 {
  if (!args.record || args.record.contractVersion !== "DecisionMemoryV1") {
    throw new DecisionMemoryRecurringLearningError("INVALID_RECORD", "record must be DecisionMemoryV1");
  }

  const generatedAt = canonicalTimestamp(args.generatedAt, "generatedAt");
  const domain = DECISION_DOMAIN_MAP[args.record.decisionClass] ?? null;
  if (!domain) {
    return result({
      state: "NOT_APPLICABLE",
      reasons: ["UNSUPPORTED_DECISION_CLASS"],
      generatedAt,
      record: args.record,
      domain: null,
      learningId: null
    });
  }

  if (args.record.integrityFlags.length > 0) {
    return result({
      state: "VERIFY_RECORD",
      reasons: ["DECISION_INTEGRITY_FLAGS"],
      generatedAt,
      record: args.record,
      domain,
      learningId: null
    });
  }

  const observation = args.record.outcomeObservation;
  if (!observation) {
    return result({
      state: "WAIT_FOR_OUTCOME",
      reasons: ["OUTCOME_NOT_OBSERVED"],
      generatedAt,
      record: args.record,
      domain,
      learningId: null
    });
  }

  if (!observation.lessonCandidate) {
    return result({
      state: "NOT_APPLICABLE",
      reasons: ["LESSON_CANDIDATE_MISSING"],
      generatedAt,
      record: args.record,
      domain,
      learningId: null
    });
  }

  let learning: Readonly<LearningObjectV1>;
  try {
    learning = validateLearningObjectV1(args.learningObject);
  } catch {
    return result({
      state: "VERIFY_RECORD",
      reasons: ["LEARNING_OBJECT_INVALID"],
      generatedAt,
      record: args.record,
      domain,
      learningId:
        args.learningObject && typeof args.learningObject.learning_id === "string"
          ? args.learningObject.learning_id
          : null
    });
  }

  const reasons: DecisionMemoryRecurringLearningReasonV1[] = [];
  const actionObserved = args.record.actionState === "TAKEN" || args.record.actionState === "REVERSED";
  if (!actionObserved) reasons.push("ACTION_NOT_OBSERVED");
  if (args.record.actionEvidenceRefs.length === 0) reasons.push("ACTION_EVIDENCE_MISSING");
  if (!chronologyIsValid(args.record, learning, generatedAt)) reasons.push("INVALID_CHRONOLOGY");

  if (
    learning.kind !== "VALIDATED_LESSON" ||
    !["APPROVED", "CANONICAL"].includes(learning.lifecycle_state) ||
    learning.approval == null
  ) {
    reasons.push("LEARNING_OBJECT_NOT_REVIEWED");
  }
  if (learning.truth_state !== "KNOWN") reasons.push("LEARNING_OBJECT_NOT_KNOWN");

  if (
    observation.assessment.state !== "KNOWN" ||
    observation.assessment.value == null ||
    observation.assessment.evidenceRefs.length === 0 ||
    observation.assessment.value === "UNKNOWN"
  ) {
    reasons.push("OUTCOME_ASSESSMENT_UNSUPPORTED");
  }
  if (observation.assessment.value === "INCONCLUSIVE") reasons.push("OUTCOME_INCONCLUSIVE");

  if (
    normalizedStatement(learning.content) !==
    normalizedStatement(observation.lessonCandidate.statement)
  ) {
    reasons.push("LESSON_STATEMENT_MISMATCH");
  }

  if (missingEvidence(observation.lessonCandidate.evidenceRefs, learning).length > 0) {
    reasons.push("LESSON_EVIDENCE_GAP");
  }
  if (missingEvidence(observation.assessment.evidenceRefs, learning).length > 0) {
    reasons.push("OUTCOME_EVIDENCE_GAP");
  }
  if (
    args.record.actionEvidenceRefs.length > 0 &&
    missingEvidence(args.record.actionEvidenceRefs, learning).length > 0
  ) {
    reasons.push("ACTION_EVIDENCE_GAP");
  }

  const lessonEvidenceIds = new Set(observation.lessonCandidate.evidenceRefs);
  const lessonLineages = uniqueSorted(
    learning.evidence
      .filter((item) => lessonEvidenceIds.has(item.evidence_id))
      .map((item) => item.source_lineage_id)
  );
  if (lessonLineages.length === 0) reasons.push("LESSON_LINEAGE_NOT_PROVEN");

  if (reasons.length > 0) {
    return result({
      state: "VERIFY_RECORD",
      reasons,
      generatedAt,
      record: args.record,
      domain,
      learningId: learning.learning_id
    });
  }

  const observations: RecurringLessonObservationV1[] = lessonLineages.map((independenceKey) => ({
    observation_id: `decision-memory-learning:${stableId({
      recordId: args.record.recordId,
      outcomeObservationId: observation.observationId,
      learningId: learning.learning_id,
      independenceKey
    })}`,
    decision_ref: args.record.decisionId,
    outcome_ref: observation.observationId,
    independence_key: independenceKey,
    observed_at: observation.observedAt,
    learning_object: learning as LearningObjectV1
  }));

  return result({
    state: "READY",
    reasons: ["READY_FOR_RECURRING_REVIEW"],
    generatedAt,
    record: args.record,
    domain,
    learningId: learning.learning_id,
    observations
  });
}
