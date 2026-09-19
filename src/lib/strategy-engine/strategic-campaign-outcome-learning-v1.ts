import type { StrategicCampaignSteeringResultV1 } from "./strategic-campaign-steering-v1";

export const STRATEGIC_CAMPAIGN_OUTCOME_LEARNING_VERSION_V1 =
  "StrategicCampaignOutcomeLearningV1" as const;
export const STRATEGIC_CAMPAIGN_OUTCOME_LEARNING_POLICY_VERSION_V1 =
  "strategic_campaign_outcome_learning_v1.0.0" as const;

const MAX_OBSERVATION_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_REFS = 100;
const ISO_UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export type CampaignOutcomeEvidenceStateV1 =
  | "KNOWN"
  | "UNKNOWN"
  | "PARTIAL"
  | "CONFLICTED";

export type CampaignOutcomeAssessmentV1 =
  | "POSITIVE"
  | "NEGATIVE"
  | "NEUTRAL"
  | "INCONCLUSIVE";

export type CampaignOutcomeAttributionClassV1 =
  | "UNKNOWN"
  | "CORRELATIONAL"
  | "CAUSAL_SUPPORTED";

export type StrategicCampaignOutcomeLearningStatusV1 =
  | "READY_FOR_REVIEW"
  | "NO_ACTION"
  | "WAIT_FOR_EVIDENCE"
  | "VERIFY";

export type StrategicCampaignOutcomeLearningReasonV1 =
  | "POSITIVE_OUTCOME_REVIEW"
  | "NEGATIVE_OUTCOME_REVIEW"
  | "NEUTRAL_OUTCOME_NO_REALLOCATION_SIGNAL"
  | "INCONCLUSIVE_OUTCOME"
  | "SOURCE_STEERING_WAITING"
  | "SOURCE_STEERING_BLOCKED"
  | "SOURCE_AUTHORITY_INVARIANT_FAILED"
  | "PLAN_NOT_KNOWN"
  | "OBSERVATION_NOT_KNOWN"
  | "EVIDENCE_MISSING"
  | "STEERING_EVIDENCE_NOT_SHARED"
  | "MEASUREMENT_IDENTITY_MISMATCH"
  | "CAMPAIGN_MISMATCH"
  | "INVALID_CHRONOLOGY"
  | "EVALUATION_WINDOW_NOT_MATURE"
  | "FUTURE_EVIDENCE"
  | "STALE_EVIDENCE"
  | "ATTRIBUTION_EVIDENCE_MISSING"
  | "CAUSAL_DESIGN_EVIDENCE_MISSING"
  | "UNSAFE_PROVENANCE"
  | "INVALID_INPUT";

export type CampaignOutcomeMeasurementPlanV1 = Readonly<{
  planId: string;
  campaignId: string;
  metricRef: string;
  unit: string;
  evaluationWindow: Readonly<{
    startAt: string;
    endAt: string;
  }>;
  evidenceState: CampaignOutcomeEvidenceStateV1;
  evidenceRefs: readonly string[];
}>;

export type CampaignOutcomeObservationV1 = Readonly<{
  observationId: string;
  campaignId: string;
  planId: string;
  metricRef: string;
  unit: string;
  evaluationWindow: Readonly<{
    startAt: string;
    endAt: string;
  }>;
  observedAt: string;
  evidenceState: CampaignOutcomeEvidenceStateV1;
  assessment: CampaignOutcomeAssessmentV1 | null;
  attributionClass: CampaignOutcomeAttributionClassV1;
  evidenceRefs: readonly string[];
  steeringEvidenceRefs: readonly string[];
  attributionEvidenceRefs: readonly string[];
  causalDesignRef?: string | null;
  confounderEvidenceRefs?: readonly string[];
}>;

export type StrategicCampaignOutcomeLearningInputV1 = Readonly<{
  steering: StrategicCampaignSteeringResultV1;
  measurementPlan: CampaignOutcomeMeasurementPlanV1;
  observation: CampaignOutcomeObservationV1;
  reviewedAt: string;
  maximumObservationAgeMs: number;
}>;

export type StrategicCampaignOutcomeLearningReviewV1 = Readonly<{
  contractVersion: typeof STRATEGIC_CAMPAIGN_OUTCOME_LEARNING_VERSION_V1;
  policyVersion: typeof STRATEGIC_CAMPAIGN_OUTCOME_LEARNING_POLICY_VERSION_V1;
  reviewId: string;
  campaignId: string;
  planId: string;
  observationId: string;
  metricRef: string;
  unit: string;
  reviewedAt: string;
  status: StrategicCampaignOutcomeLearningStatusV1;
  reasonCodes: readonly StrategicCampaignOutcomeLearningReasonV1[];
  assessment: CampaignOutcomeAssessmentV1 | null;
  attributionClass: CampaignOutcomeAttributionClassV1;
  evidenceRefs: readonly string[];
  confounderEvidenceRefs: readonly string[];
  nextInternalStep:
    | "REVIEW_CONTINUATION_WITHOUT_AUTOMATIC_SCALING"
    | "REVIEW_CAMPAIGN_ASSUMPTIONS_AND_ALLOCATION_WITHOUT_MUTATION"
    | "COLLECT_MORE_OUTCOME_EVIDENCE"
    | "VERIFY_CAMPAIGN_OUTCOME_EVIDENCE"
    | null;
  causalInterpretation: "NOT_INFERRED";
  confidence: null;
  monetaryValue: null;
  outcomeValue: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    learningReviewPreparation: boolean;
    campaignMutationAuthorized: false;
    allocationMutationAuthorized: false;
    budgetMutationAuthorized: false;
    experimentMutationAuthorized: false;
    policyPromotionAuthorized: false;
    persistenceAuthorized: false;
    providerWriteAuthorized: false;
    externalExecutionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

const EVIDENCE_STATES = new Set<CampaignOutcomeEvidenceStateV1>([
  "KNOWN",
  "UNKNOWN",
  "PARTIAL",
  "CONFLICTED"
]);
const ASSESSMENTS = new Set<CampaignOutcomeAssessmentV1>([
  "POSITIVE",
  "NEGATIVE",
  "NEUTRAL",
  "INCONCLUSIVE"
]);
const ATTRIBUTION_CLASSES = new Set<CampaignOutcomeAttributionClassV1>([
  "UNKNOWN",
  "CORRELATIONAL",
  "CAUSAL_SUPPORTED"
]);

const AUTHORITY_BASE = Object.freeze({
  analysisOnly: true,
  campaignMutationAuthorized: false,
  allocationMutationAuthorized: false,
  budgetMutationAuthorized: false,
  experimentMutationAuthorized: false,
  policyPromotionAuthorized: false,
  persistenceAuthorized: false,
  providerWriteAuthorized: false,
  externalExecutionAuthorized: false,
  approvalBypassAuthorized: false
} as const);

const LIMITATIONS = Object.freeze([
  "The review preserves the upstream outcome assessment and attribution class; it does not derive a new outcome, causal interpretation, confidence, or monetary value.",
  "A positive observed assessment can only prepare continuation review and never authorizes scaling, spend, publication, pricing, allocation, campaign mutation, or external execution.",
  "A negative observed assessment can only prepare internal reassessment and never proves the campaign caused the result or changes resources automatically.",
  "Missing, partial, conflicted, stale, future-dated, mismatched, unsupported, or unsafe evidence fails closed."
] as const);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function timestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized || !ISO_UTC_TIMESTAMP_RE.test(normalized)) return null;
  const millis = Date.parse(normalized);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

function looksUnsafeReference(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("password=") ||
    normalized.includes("token=") ||
    normalized.includes("api_key=") ||
    normalized.includes("apikey=") ||
    normalized.includes("secret=") ||
    normalized.includes("authorization:") ||
    normalized.includes("bearer ")
  );
}

function normalizeRefs(values: readonly string[] | undefined): {
  refs: readonly string[];
  unsafe: boolean;
} {
  if (!Array.isArray(values)) return { refs: Object.freeze([]), unsafe: false };
  let unsafe = false;
  const refs = values
    .map((value) => text(value))
    .filter((value): value is string => value !== null)
    .filter((value) => {
      if (looksUnsafeReference(value)) {
        unsafe = true;
        return false;
      }
      return true;
    });
  return {
    refs: Object.freeze([...new Set(refs)].slice(0, MAX_REFS).sort((a, b) => a.localeCompare(b))),
    unsafe
  };
}

function sourceAuthorityInvariantHolds(steering: StrategicCampaignSteeringResultV1): boolean {
  return steering.authority.campaignMutation === false
    && steering.authority.budgetMutation === false
    && steering.authority.allocationMutation === false
    && steering.authority.experimentMutation === false
    && steering.authority.persistence === false
    && steering.authority.providerWrite === false
    && steering.authority.externalExecution === false
    && steering.authority.approvalBypass === false;
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function statusFor(
  reasons: ReadonlySet<StrategicCampaignOutcomeLearningReasonV1>,
  assessment: CampaignOutcomeAssessmentV1 | null
): StrategicCampaignOutcomeLearningStatusV1 {
  const verifyReasons = new Set<StrategicCampaignOutcomeLearningReasonV1>([
    "SOURCE_STEERING_BLOCKED",
    "SOURCE_AUTHORITY_INVARIANT_FAILED",
    "PLAN_NOT_KNOWN",
    "EVIDENCE_MISSING",
    "STEERING_EVIDENCE_NOT_SHARED",
    "MEASUREMENT_IDENTITY_MISMATCH",
    "CAMPAIGN_MISMATCH",
    "INVALID_CHRONOLOGY",
    "FUTURE_EVIDENCE",
    "STALE_EVIDENCE",
    "ATTRIBUTION_EVIDENCE_MISSING",
    "CAUSAL_DESIGN_EVIDENCE_MISSING",
    "UNSAFE_PROVENANCE",
    "INVALID_INPUT"
  ]);
  if ([...reasons].some((reason) => verifyReasons.has(reason))) return "VERIFY";
  if (
    reasons.has("SOURCE_STEERING_WAITING")
    || reasons.has("OBSERVATION_NOT_KNOWN")
    || reasons.has("EVALUATION_WINDOW_NOT_MATURE")
    || assessment === "INCONCLUSIVE"
    || assessment === null
  ) {
    return "WAIT_FOR_EVIDENCE";
  }
  if (assessment === "NEUTRAL") return "NO_ACTION";
  return "READY_FOR_REVIEW";
}

function nextStepFor(
  status: StrategicCampaignOutcomeLearningStatusV1,
  assessment: CampaignOutcomeAssessmentV1 | null
): StrategicCampaignOutcomeLearningReviewV1["nextInternalStep"] {
  if (status === "VERIFY") return "VERIFY_CAMPAIGN_OUTCOME_EVIDENCE";
  if (status === "WAIT_FOR_EVIDENCE") return "COLLECT_MORE_OUTCOME_EVIDENCE";
  if (status === "NO_ACTION") return null;
  if (assessment === "POSITIVE") return "REVIEW_CONTINUATION_WITHOUT_AUTOMATIC_SCALING";
  if (assessment === "NEGATIVE") {
    return "REVIEW_CAMPAIGN_ASSUMPTIONS_AND_ALLOCATION_WITHOUT_MUTATION";
  }
  return null;
}

/**
 * Joins an existing campaign steering result to a predeclared outcome measurement
 * plan and one canonical observation. This is a read-only learning handoff: it
 * preserves explicit upstream assessment/attribution without deriving causality,
 * confidence, value, allocation, or execution authority.
 */
export function reviewStrategicCampaignOutcomeLearningV1(
  input: StrategicCampaignOutcomeLearningInputV1
): StrategicCampaignOutcomeLearningReviewV1 {
  const steering = input?.steering;
  const plan = input?.measurementPlan;
  const observation = input?.observation;
  const reviewedAt = timestamp(input?.reviewedAt);
  const maximumObservationAgeMs = input?.maximumObservationAgeMs;

  const campaignId = text(steering?.campaignId) ?? "unknown-campaign";
  const planId = text(plan?.planId) ?? "unknown-plan";
  const observationId = text(observation?.observationId) ?? "unknown-observation";
  const metricRef = text(plan?.metricRef) ?? text(observation?.metricRef) ?? "unknown-metric";
  const unit = text(plan?.unit) ?? text(observation?.unit) ?? "unknown-unit";
  const reasons = new Set<StrategicCampaignOutcomeLearningReasonV1>();

  if (
    !steering
    || steering.contractVersion !== "StrategicCampaignSteeringV1"
    || !plan
    || !observation
    || !reviewedAt
    || !Number.isFinite(maximumObservationAgeMs)
    || maximumObservationAgeMs <= 0
    || maximumObservationAgeMs > MAX_OBSERVATION_AGE_MS
    || !text(campaignId)
    || !text(planId)
    || !text(observationId)
    || !text(metricRef)
    || !text(unit)
    || !EVIDENCE_STATES.has(plan.evidenceState)
    || !EVIDENCE_STATES.has(observation.evidenceState)
    || (observation.assessment !== null && !ASSESSMENTS.has(observation.assessment))
    || !ATTRIBUTION_CLASSES.has(observation.attributionClass)
  ) {
    reasons.add("INVALID_INPUT");
  }

  if (steering) {
    if (steering.status === "BLOCKED") reasons.add("SOURCE_STEERING_BLOCKED");
    if (steering.status === "WAITING") reasons.add("SOURCE_STEERING_WAITING");
    if (!sourceAuthorityInvariantHolds(steering)) reasons.add("SOURCE_AUTHORITY_INVARIANT_FAILED");
  }

  const planCampaignId = text(plan?.campaignId);
  const observationCampaignId = text(observation?.campaignId);
  if (
    planCampaignId !== campaignId
    || observationCampaignId !== campaignId
  ) {
    reasons.add("CAMPAIGN_MISMATCH");
  }

  if (plan?.evidenceState !== "KNOWN") reasons.add("PLAN_NOT_KNOWN");
  if (observation?.evidenceState !== "KNOWN") reasons.add("OBSERVATION_NOT_KNOWN");

  const planRefs = normalizeRefs(plan?.evidenceRefs);
  const observationRefs = normalizeRefs(observation?.evidenceRefs);
  const steeringLinkRefs = normalizeRefs(observation?.steeringEvidenceRefs);
  const attributionRefs = normalizeRefs(observation?.attributionEvidenceRefs);
  const confounderRefs = normalizeRefs(observation?.confounderEvidenceRefs);
  if (
    planRefs.unsafe
    || observationRefs.unsafe
    || steeringLinkRefs.unsafe
    || attributionRefs.unsafe
    || confounderRefs.unsafe
    || (observation?.causalDesignRef != null && looksUnsafeReference(observation.causalDesignRef))
  ) {
    reasons.add("UNSAFE_PROVENANCE");
  }
  if (planRefs.refs.length === 0 || observationRefs.refs.length === 0 || steeringLinkRefs.refs.length === 0) {
    reasons.add("EVIDENCE_MISSING");
  }

  const steeringEvidence = new Set(steering?.evidenceRefs ?? []);
  if (steeringLinkRefs.refs.some((ref) => !steeringEvidence.has(ref))) {
    reasons.add("STEERING_EVIDENCE_NOT_SHARED");
  }

  if (
    text(observation?.planId) !== planId
    || text(observation?.metricRef) !== metricRef
    || text(observation?.unit) !== unit
    || observation?.evaluationWindow?.startAt !== plan?.evaluationWindow?.startAt
    || observation?.evaluationWindow?.endAt !== plan?.evaluationWindow?.endAt
  ) {
    reasons.add("MEASUREMENT_IDENTITY_MISMATCH");
  }

  const reviewedAtMs = reviewedAt ? Date.parse(reviewedAt) : Number.NaN;
  const steeringAsOf = timestamp(steering?.asOf);
  const planStart = timestamp(plan?.evaluationWindow?.startAt);
  const planEnd = timestamp(plan?.evaluationWindow?.endAt);
  const observedAt = timestamp(observation?.observedAt);
  if (!steeringAsOf || !planStart || !planEnd || !observedAt || !reviewedAt) {
    reasons.add("INVALID_CHRONOLOGY");
  } else {
    const steeringAsOfMs = Date.parse(steeringAsOf);
    const planStartMs = Date.parse(planStart);
    const planEndMs = Date.parse(planEnd);
    const observedAtMs = Date.parse(observedAt);
    if (planStartMs >= planEndMs || observedAtMs < planStartMs) reasons.add("INVALID_CHRONOLOGY");
    if (steeringAsOfMs > reviewedAtMs || observedAtMs > reviewedAtMs) reasons.add("FUTURE_EVIDENCE");
    if (reviewedAtMs < planEndMs || observedAtMs < planEndMs) {
      reasons.add("EVALUATION_WINDOW_NOT_MATURE");
    }
    if (
      Number.isFinite(maximumObservationAgeMs)
      && maximumObservationAgeMs > 0
      && reviewedAtMs - observedAtMs > maximumObservationAgeMs
    ) {
      reasons.add("STALE_EVIDENCE");
    }
  }

  if (observation?.attributionClass !== "UNKNOWN" && attributionRefs.refs.length === 0) {
    reasons.add("ATTRIBUTION_EVIDENCE_MISSING");
  }
  if (observation?.attributionClass === "CAUSAL_SUPPORTED") {
    const causalDesignRef = text(observation.causalDesignRef);
    if (!causalDesignRef || !attributionRefs.refs.includes(causalDesignRef)) {
      reasons.add("CAUSAL_DESIGN_EVIDENCE_MISSING");
    }
  }

  const assessment = observation?.assessment ?? null;
  if (assessment === "POSITIVE") reasons.add("POSITIVE_OUTCOME_REVIEW");
  if (assessment === "NEGATIVE") reasons.add("NEGATIVE_OUTCOME_REVIEW");
  if (assessment === "NEUTRAL") reasons.add("NEUTRAL_OUTCOME_NO_REALLOCATION_SIGNAL");
  if (assessment === "INCONCLUSIVE") reasons.add("INCONCLUSIVE_OUTCOME");

  const status = statusFor(reasons, assessment);
  const reasonCodes = Object.freeze(
    [...reasons].sort((a, b) => a.localeCompare(b))
  ) as readonly StrategicCampaignOutcomeLearningReasonV1[];
  const evidenceRefs = Object.freeze(
    [...new Set([
      ...planRefs.refs,
      ...observationRefs.refs,
      ...steeringLinkRefs.refs,
      ...attributionRefs.refs
    ])].slice(0, MAX_REFS).sort((a, b) => a.localeCompare(b))
  );
  const learningReviewPreparation = status === "READY_FOR_REVIEW";

  return freezeDeep({
    contractVersion: STRATEGIC_CAMPAIGN_OUTCOME_LEARNING_VERSION_V1,
    policyVersion: STRATEGIC_CAMPAIGN_OUTCOME_LEARNING_POLICY_VERSION_V1,
    reviewId: `campaign-outcome-learning:${campaignId}:${planId}:${observationId}`,
    campaignId,
    planId,
    observationId,
    metricRef,
    unit,
    reviewedAt: reviewedAt ?? input.reviewedAt,
    status,
    reasonCodes,
    assessment,
    attributionClass: observation?.attributionClass ?? "UNKNOWN",
    evidenceRefs,
    confounderEvidenceRefs: confounderRefs.refs,
    nextInternalStep: nextStepFor(status, assessment),
    causalInterpretation: "NOT_INFERRED",
    confidence: null,
    monetaryValue: null,
    outcomeValue: null,
    limitations: LIMITATIONS,
    authority: {
      ...AUTHORITY_BASE,
      learningReviewPreparation
    }
  });
}
