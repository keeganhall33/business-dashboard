import {
  validateLearningObjectV1,
  type LearningObjectV1
} from "./learning-object-v1";

export const RECURRING_DECISION_LESSONS_VERSION = "RECURRING_DECISION_LESSONS_V1" as const;
export const MAX_RECURRING_LESSON_OBSERVATIONS = 100;
export const DEFAULT_RECURRING_LESSON_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

export const recurringLessonDomains = [
  "PRICING",
  "NEGOTIATION",
  "CAMPAIGN",
  "STRATEGY",
  "RELATIONSHIP",
  "REVENUE",
  "OPERATIONS"
] as const;

export type RecurringLessonDomainV1 = (typeof recurringLessonDomains)[number];
export type RecurringLessonReviewStateV1 =
  | "REVIEW_CANDIDATE"
  | "INSUFFICIENT_INDEPENDENT_EVIDENCE"
  | "NEEDS_VERIFICATION"
  | "CONFLICTED"
  | "INVALID_INPUT";

export interface RecurringLessonObservationV1 {
  observation_id: string;
  decision_ref: string;
  outcome_ref: string;
  independence_key: string;
  observed_at: string;
  learning_object: LearningObjectV1;
}

export interface RecurringDecisionLessonInputV1 {
  domain: RecurringLessonDomainV1;
  pattern_key: string;
  evaluated_at: string;
  max_age_ms?: number;
  observations: readonly RecurringLessonObservationV1[];
}

export interface RecurringDecisionLessonReviewV1 {
  version: typeof RECURRING_DECISION_LESSONS_VERSION;
  state: RecurringLessonReviewStateV1;
  reason_code:
    | "REPEATED_APPROVED_LESSON"
    | "TOO_FEW_INDEPENDENT_OBSERVATIONS"
    | "UNSAFE_SOURCE_LESSON"
    | "MATERIAL_STATEMENT_CONFLICT"
    | "MALFORMED_OR_UNBOUNDED_INPUT";
  domain: RecurringLessonDomainV1 | null;
  pattern_key: string | null;
  lesson_title: string | null;
  lesson_content: string | null;
  source_learning_ids: readonly string[];
  decision_refs: readonly string[];
  outcome_refs: readonly string[];
  evidence_refs: readonly string[];
  source_lineage_ids: readonly string[];
  duplicate_observation_ids: readonly string[];
  verification_reasons: readonly string[];
  causal_interpretation: "NOT_ESTABLISHED";
  review_required: true;
  policy_promotion_allowed: false;
  pricing_change_allowed: false;
  negotiation_action_allowed: false;
  external_action_allowed: false;
  persistence_authority: false;
}

function validText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}

function normalizeStatement(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function invalidResult(): RecurringDecisionLessonReviewV1 {
  return Object.freeze({
    version: RECURRING_DECISION_LESSONS_VERSION,
    state: "INVALID_INPUT",
    reason_code: "MALFORMED_OR_UNBOUNDED_INPUT",
    domain: null,
    pattern_key: null,
    lesson_title: null,
    lesson_content: null,
    source_learning_ids: Object.freeze([]),
    decision_refs: Object.freeze([]),
    outcome_refs: Object.freeze([]),
    evidence_refs: Object.freeze([]),
    source_lineage_ids: Object.freeze([]),
    duplicate_observation_ids: Object.freeze([]),
    verification_reasons: Object.freeze(["INVALID_INPUT"]),
    causal_interpretation: "NOT_ESTABLISHED",
    review_required: true,
    policy_promotion_allowed: false,
    pricing_change_allowed: false,
    negotiation_action_allowed: false,
    external_action_allowed: false,
    persistence_authority: false
  });
}

function result(
  input: RecurringDecisionLessonInputV1,
  state: Exclude<RecurringLessonReviewStateV1, "INVALID_INPUT">,
  reasonCode: Exclude<RecurringDecisionLessonReviewV1["reason_code"], "MALFORMED_OR_UNBOUNDED_INPUT">,
  observations: readonly RecurringLessonObservationV1[],
  duplicateObservationIds: readonly string[],
  verificationReasons: readonly string[]
): RecurringDecisionLessonReviewV1 {
  const learningIds = uniqueSorted(observations.map((item) => item.learning_object.learning_id));
  const decisionRefs = uniqueSorted(observations.map((item) => item.decision_ref));
  const outcomeRefs = uniqueSorted(observations.map((item) => item.outcome_ref));
  const evidenceRefs = uniqueSorted(
    observations.flatMap((item) => item.learning_object.evidence.map((evidence) => evidence.evidence_id))
  );
  const sourceLineageIds = uniqueSorted(
    observations.flatMap((item) => item.learning_object.evidence.map((evidence) => evidence.source_lineage_id))
  );
  const titles = uniqueSorted(observations.map((item) => normalizeStatement(item.learning_object.title)));
  const contents = uniqueSorted(observations.map((item) => normalizeStatement(item.learning_object.content)));

  return Object.freeze({
    version: RECURRING_DECISION_LESSONS_VERSION,
    state,
    reason_code: reasonCode,
    domain: input.domain,
    pattern_key: input.pattern_key.trim(),
    lesson_title: titles.length === 1 ? titles[0] : null,
    lesson_content: contents.length === 1 ? contents[0] : null,
    source_learning_ids: learningIds,
    decision_refs: decisionRefs,
    outcome_refs: outcomeRefs,
    evidence_refs: evidenceRefs,
    source_lineage_ids: sourceLineageIds,
    duplicate_observation_ids: uniqueSorted(duplicateObservationIds),
    verification_reasons: uniqueSorted(verificationReasons),
    causal_interpretation: "NOT_ESTABLISHED",
    review_required: true,
    policy_promotion_allowed: false,
    pricing_change_allowed: false,
    negotiation_action_allowed: false,
    external_action_allowed: false,
    persistence_authority: false
  });
}

function validateObservation(
  observation: RecurringLessonObservationV1,
  evaluatedAt: number,
  maxAgeMs: number
): { observation: RecurringLessonObservationV1; verificationReasons: string[] } | null {
  if (
    !observation ||
    !validText(observation.observation_id) ||
    !validText(observation.decision_ref) ||
    !validText(observation.outcome_ref) ||
    !validText(observation.independence_key) ||
    !validText(observation.observed_at)
  ) {
    return null;
  }

  const observedAt = Date.parse(observation.observed_at);
  if (!Number.isFinite(observedAt) || observedAt > evaluatedAt) return null;

  let learning: Readonly<LearningObjectV1>;
  try {
    learning = validateLearningObjectV1(observation.learning_object);
  } catch {
    return null;
  }

  if (Date.parse(learning.updated_at) > evaluatedAt) return null;
  if (learning.evidence.some((evidence) => Date.parse(evidence.observed_at) > evaluatedAt)) return null;

  const verificationReasons: string[] = [];
  if (learning.kind !== "VALIDATED_LESSON") verificationReasons.push("SOURCE_NOT_VALIDATED_LESSON");
  if (learning.lifecycle_state !== "APPROVED" && learning.lifecycle_state !== "CANONICAL") {
    verificationReasons.push("SOURCE_LESSON_NOT_APPROVED");
  }
  if (learning.truth_state !== "KNOWN") verificationReasons.push(`SOURCE_TRUTH_${learning.truth_state}`);
  if (evaluatedAt - observedAt > maxAgeMs) verificationReasons.push("OBSERVATION_STALE");
  if (evaluatedAt - Date.parse(learning.updated_at) > maxAgeMs) verificationReasons.push("SOURCE_LESSON_STALE");
  if (learning.evidence.length === 0) verificationReasons.push("SOURCE_EVIDENCE_MISSING");
  if (!learning.evidence.some((evidence) => evidence.source_lineage_id === observation.independence_key)) {
    verificationReasons.push("INDEPENDENCE_KEY_NOT_EVIDENCED");
  }

  return {
    observation: {
      ...observation,
      observation_id: observation.observation_id.trim(),
      decision_ref: observation.decision_ref.trim(),
      outcome_ref: observation.outcome_ref.trim(),
      independence_key: observation.independence_key.trim(),
      learning_object: learning as LearningObjectV1
    },
    verificationReasons
  };
}

export function evaluateRecurringDecisionLessonV1(
  input: RecurringDecisionLessonInputV1
): RecurringDecisionLessonReviewV1 {
  const evaluatedAt = Date.parse(input?.evaluated_at);
  const maxAgeMs = input?.max_age_ms ?? DEFAULT_RECURRING_LESSON_MAX_AGE_MS;

  if (
    !input ||
    !recurringLessonDomains.includes(input.domain) ||
    !validText(input.pattern_key) ||
    !Number.isFinite(evaluatedAt) ||
    !Number.isFinite(maxAgeMs) ||
    maxAgeMs < 0 ||
    !Array.isArray(input.observations) ||
    input.observations.length === 0 ||
    input.observations.length > MAX_RECURRING_LESSON_OBSERVATIONS
  ) {
    return invalidResult();
  }

  const ids = input.observations.map((item) => item?.observation_id);
  if (ids.some((id) => !validText(id)) || new Set(ids).size !== ids.length) return invalidResult();

  const validated = input.observations.map((item) => validateObservation(item, evaluatedAt, maxAgeMs));
  if (validated.some((item) => item === null)) return invalidResult();

  const checked = validated as Array<{
    observation: RecurringLessonObservationV1;
    verificationReasons: string[];
  }>;
  const allVerificationReasons = checked.flatMap((item) => item.verificationReasons);
  const observations = checked.map((item) => item.observation);

  const dedupeKey = (item: RecurringLessonObservationV1) =>
    [
      item.decision_ref,
      item.outcome_ref,
      item.independence_key,
      item.learning_object.learning_id,
      normalizeStatement(item.learning_object.content)
    ].join("|");

  const uniqueBySource = new Map<string, RecurringLessonObservationV1>();
  const duplicateObservationIds: string[] = [];
  for (const observation of [...observations].sort((a, b) => a.observation_id.localeCompare(b.observation_id))) {
    const key = dedupeKey(observation);
    if (uniqueBySource.has(key)) duplicateObservationIds.push(observation.observation_id);
    else uniqueBySource.set(key, observation);
  }
  const uniqueObservations = [...uniqueBySource.values()];

  const titles = new Set(uniqueObservations.map((item) => normalizeStatement(item.learning_object.title)));
  const contents = new Set(uniqueObservations.map((item) => normalizeStatement(item.learning_object.content)));
  if (titles.size > 1 || contents.size > 1) {
    return result(
      input,
      "CONFLICTED",
      "MATERIAL_STATEMENT_CONFLICT",
      uniqueObservations,
      duplicateObservationIds,
      [...allVerificationReasons, "LESSON_STATEMENTS_DISAGREE"]
    );
  }

  if (allVerificationReasons.length > 0) {
    return result(
      input,
      "NEEDS_VERIFICATION",
      "UNSAFE_SOURCE_LESSON",
      uniqueObservations,
      duplicateObservationIds,
      allVerificationReasons
    );
  }

  const independentKeys = new Set(uniqueObservations.map((item) => item.independence_key));
  const decisionRefs = new Set(uniqueObservations.map((item) => item.decision_ref));
  const outcomeRefs = new Set(uniqueObservations.map((item) => item.outcome_ref));

  if (independentKeys.size < 2 || decisionRefs.size < 2 || outcomeRefs.size < 2) {
    return result(
      input,
      "INSUFFICIENT_INDEPENDENT_EVIDENCE",
      "TOO_FEW_INDEPENDENT_OBSERVATIONS",
      uniqueObservations,
      duplicateObservationIds,
      [
        ...(independentKeys.size < 2 ? ["INSUFFICIENT_SOURCE_INDEPENDENCE"] : []),
        ...(decisionRefs.size < 2 ? ["INSUFFICIENT_DISTINCT_DECISIONS"] : []),
        ...(outcomeRefs.size < 2 ? ["INSUFFICIENT_DISTINCT_OUTCOMES"] : [])
      ]
    );
  }

  return result(
    input,
    "REVIEW_CANDIDATE",
    "REPEATED_APPROVED_LESSON",
    uniqueObservations,
    duplicateObservationIds,
    []
  );
}
