export const POLICY_LONGITUDINAL_CONTROL_VERSION_V1 = "PolicyLongitudinalControlV1" as const;
export const POLICY_LONGITUDINAL_CONTROL_POLICY_VERSION_V1 =
  "policy_longitudinal_control_v1.0.0" as const;

const MAX_OBSERVATIONS = 500;
const MAX_REFS = 2_000;
const MAX_TEXT = 512;

export type PolicyOutcomeTruthStateV1 =
  | "KNOWN"
  | "INFERRED"
  | "UNKNOWN"
  | "STALE"
  | "PARTIAL"
  | "CONFLICTED";

export type PolicyOutcomeAssessmentV1 =
  | "POSITIVE"
  | "NEUTRAL"
  | "NEGATIVE"
  | "INCONCLUSIVE";

export type PolicyOutcomeObservationV1 = Readonly<{
  observationId: string;
  canonicalOutcomeRef: string;
  policyCandidateId: string;
  policyCandidateVersion: string;
  policyCandidateRef: string;
  domain: string;
  observedAt: string;
  truthState: PolicyOutcomeTruthStateV1;
  outcomeAssessment: PolicyOutcomeAssessmentV1;
  attributionClass: string;
  outcomeEvidenceRef: string;
  sourceRefs: readonly string[];
  confounderRefs: readonly string[];
}>;

export type GovernedPolicyCandidateV1 = Readonly<{
  policyCandidateId: string;
  policyCandidateVersion: string;
  policyCandidateRef: string;
  domain: string;
  promotedAt: string;
  candidateEvidenceRefs: readonly string[];
  candidateSourceRefs: readonly string[];
}>;

export type PolicyLongitudinalControlInputV1 = Readonly<{
  candidate: GovernedPolicyCandidateV1;
  observations: readonly PolicyOutcomeObservationV1[];
  generatedAt: string;
  maximumObservationAgeMs: number;
  requiredNegativeObservations: number;
}>;

export type PolicyLongitudinalObservationLaneV1 =
  | "COUNTED_NEGATIVE"
  | "COUNTED_NON_NEGATIVE"
  | "INCONCLUSIVE"
  | "VERIFY_EVIDENCE";

export type PolicyLongitudinalControlStateV1 =
  | "NO_OBSERVATIONS"
  | "CONTINUE_OBSERVATION"
  | "EVIDENCE_REVIEW_REQUIRED"
  | "RETURN_TO_EXPERIMENT_REVIEW_REQUIRED";

export type PolicyLongitudinalReasonV1 =
  | "NO_OBSERVATIONS"
  | "NEGATIVE_OBSERVATION_THRESHOLD_MET"
  | "INSUFFICIENT_NEGATIVE_OBSERVATIONS"
  | "CANDIDATE_IDENTITY_INVALID"
  | "CANDIDATE_TIMESTAMP_INVALID"
  | "CANDIDATE_FUTURE_DATED"
  | "CANDIDATE_PROVENANCE_REQUIRED"
  | "OBSERVATION_IDENTITY_INVALID"
  | "OBSERVATION_CANDIDATE_MISMATCH"
  | "OBSERVATION_TIMESTAMP_INVALID"
  | "OBSERVATION_FUTURE_DATED"
  | "OBSERVATION_PRECEDES_CANDIDATE"
  | "OBSERVATION_STALE"
  | "OBSERVATION_TRUTH_NOT_KNOWN"
  | "OBSERVATION_ASSESSMENT_INVALID"
  | "OBSERVATION_ATTRIBUTION_REQUIRED"
  | "OBSERVATION_PROVENANCE_REQUIRED"
  | "DUPLICATE_OBSERVATION_ID"
  | "DUPLICATE_OUTCOME_REF"
  | "DUPLICATE_OUTCOME_EVIDENCE_REF";

export type PolicyLongitudinalObservationReviewV1 = Readonly<{
  observationId: string;
  canonicalOutcomeRef: string;
  observedAt: string | null;
  truthState: PolicyOutcomeTruthStateV1;
  outcomeAssessment: PolicyOutcomeAssessmentV1 | null;
  attributionClass: string | null;
  outcomeEvidenceRef: string | null;
  sourceRefs: readonly string[];
  confounderRefs: readonly string[];
  lane: PolicyLongitudinalObservationLaneV1;
  reasons: readonly PolicyLongitudinalReasonV1[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
}>;

export type PolicyLongitudinalControlV1 = Readonly<{
  contractVersion: typeof POLICY_LONGITUDINAL_CONTROL_VERSION_V1;
  policyVersion: typeof POLICY_LONGITUDINAL_CONTROL_POLICY_VERSION_V1;
  reviewId: string;
  state: PolicyLongitudinalControlStateV1;
  generatedAt: string;
  candidate: Readonly<{
    policyCandidateId: string;
    policyCandidateVersion: string;
    policyCandidateRef: string;
    domain: string;
    promotedAt: string | null;
  }>;
  requiredNegativeObservations: number;
  maximumObservationAgeMs: number;
  eligibleObservationCount: number;
  negativeObservationCount: number;
  positiveObservationCount: number;
  neutralObservationCount: number;
  inconclusiveObservationCount: number;
  verificationObservationCount: number;
  countedNegativeObservationIds: readonly string[];
  observationReviews: readonly PolicyLongitudinalObservationReviewV1[];
  reasons: readonly PolicyLongitudinalReasonV1[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  attributionClassesObserved: readonly string[];
  analysisOnly: true;
  policyMutationAuthorized: false;
  policyDemotionAuthorized: false;
  experimentLaunchAuthorized: false;
  rollbackExecutionAuthorized: false;
  allocationMutationAuthorized: false;
  spendAuthorized: false;
  pricingChangeAuthorized: false;
  externalActionAuthorized: false;
  approvalBypassAuthorized: false;
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  expectedOutcome: null;
  limitations: readonly string[];
}>;

export class PolicyLongitudinalControlError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "PolicyLongitudinalControlError";
  }
}

const TRUTH_STATES = new Set<PolicyOutcomeTruthStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "PARTIAL",
  "CONFLICTED"
]);

const ASSESSMENTS = new Set<PolicyOutcomeAssessmentV1>([
  "POSITIVE",
  "NEUTRAL",
  "NEGATIVE",
  "INCONCLUSIVE"
]);

const LIMITATIONS = Object.freeze([
  "This control reviews repeated, explicitly recorded outcomes for one exact governed policy candidate. It does not infer outcomes from metrics or narrative text.",
  "RETURN_TO_EXPERIMENT_REVIEW_REQUIRED is an internal review signal only. It does not demote or mutate a policy, launch an experiment, execute a rollback, or authorize any external action.",
  "Outcome assessments and attribution classes are preserved from source observations. The control does not upgrade attribution or establish causality, confidence, expected value, or monetary value.",
  "Unknown, inferred, stale, partial, conflicted, mismatched, duplicate, future-dated, pre-candidate, or provenance-free observations fail closed to evidence review and cannot satisfy the negative-outcome threshold.",
  "Repeated observations are not treated as statistically independent merely because their identities and evidence refs are distinct."
] as const);

function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= max ? normalized : null;
}

function canonicalTimestamp(value: unknown): string | null {
  const normalized = text(value, 128);
  if (!normalized) return null;
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis)) return null;
  const canonical = new Date(millis).toISOString();
  return canonical === normalized ? normalized : null;
}

function positiveFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function integerAtLeastTwo(value: unknown): number | null {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 2
    && value <= MAX_OBSERVATIONS
    ? value
    : null;
}

function boundedUniqueRefs(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > MAX_REFS) return null;
  const normalized: string[] = [];
  for (const candidate of value) {
    const ref = text(candidate, 512);
    if (!ref) return null;
    normalized.push(ref);
  }
  if (new Set(normalized).size !== normalized.length) return null;
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value as Readonly<T>;
}

function stableReviewId(candidateId: string, candidateVersion: string, generatedAt: string): string {
  return `policy-longitudinal:${encodeURIComponent(candidateId)}:${encodeURIComponent(candidateVersion)}:${generatedAt}`;
}

export function reviewPolicyLongitudinalOutcomesV1(
  input: PolicyLongitudinalControlInputV1
): PolicyLongitudinalControlV1 {
  if (!input || typeof input !== "object") {
    throw new PolicyLongitudinalControlError("INVALID_INPUT", "input is required");
  }

  if (!Array.isArray(input.observations) || input.observations.length > MAX_OBSERVATIONS) {
    throw new PolicyLongitudinalControlError(
      "INVALID_OBSERVATIONS",
      `observations must be an array with at most ${MAX_OBSERVATIONS} entries`
    );
  }

  const generatedAt = canonicalTimestamp(input.generatedAt);
  if (!generatedAt) {
    throw new PolicyLongitudinalControlError(
      "INVALID_GENERATED_AT",
      "generatedAt must be a canonical ISO timestamp"
    );
  }

  const maximumObservationAgeMs = positiveFinite(input.maximumObservationAgeMs);
  if (!maximumObservationAgeMs) {
    throw new PolicyLongitudinalControlError(
      "INVALID_MAXIMUM_OBSERVATION_AGE",
      "maximumObservationAgeMs must be a positive finite number"
    );
  }

  const requiredNegativeObservations = integerAtLeastTwo(input.requiredNegativeObservations);
  if (!requiredNegativeObservations) {
    throw new PolicyLongitudinalControlError(
      "INVALID_NEGATIVE_THRESHOLD",
      "requiredNegativeObservations must be an explicit integer between 2 and 500"
    );
  }

  const generatedAtMs = Date.parse(generatedAt);
  const candidateReasons = new Set<PolicyLongitudinalReasonV1>();
  const candidateId = text(input.candidate?.policyCandidateId, 256);
  const candidateVersion = text(input.candidate?.policyCandidateVersion, 128);
  const candidateRef = text(input.candidate?.policyCandidateRef, 512);
  const candidateDomain = text(input.candidate?.domain, 256);
  const promotedAt = canonicalTimestamp(input.candidate?.promotedAt);
  const candidateEvidenceRefs = boundedUniqueRefs(input.candidate?.candidateEvidenceRefs);
  const candidateSourceRefs = boundedUniqueRefs(input.candidate?.candidateSourceRefs);

  if (!candidateId || !candidateVersion || !candidateRef || !candidateDomain) {
    candidateReasons.add("CANDIDATE_IDENTITY_INVALID");
  }
  if (!promotedAt) {
    candidateReasons.add("CANDIDATE_TIMESTAMP_INVALID");
  } else if (Date.parse(promotedAt) > generatedAtMs) {
    candidateReasons.add("CANDIDATE_FUTURE_DATED");
  }
  if (
    !candidateEvidenceRefs
    || candidateEvidenceRefs.length === 0
    || !candidateSourceRefs
    || candidateSourceRefs.length === 0
  ) {
    candidateReasons.add("CANDIDATE_PROVENANCE_REQUIRED");
  }

  const seenObservationIds = new Set<string>();
  const seenOutcomeRefs = new Set<string>();
  const seenOutcomeEvidenceRefs = new Set<string>();
  const observationReviews: PolicyLongitudinalObservationReviewV1[] = [];
  const aggregateReasons = new Set<PolicyLongitudinalReasonV1>(candidateReasons);
  const evidenceRefs = new Set<string>(candidateEvidenceRefs ?? []);
  const sourceRefs = new Set<string>(candidateSourceRefs ?? []);
  const attributionClasses = new Set<string>();

  let negativeObservationCount = 0;
  let positiveObservationCount = 0;
  let neutralObservationCount = 0;
  let inconclusiveObservationCount = 0;
  let verificationObservationCount = 0;
  const countedNegativeObservationIds: string[] = [];

  for (const raw of input.observations) {
    const reasons = new Set<PolicyLongitudinalReasonV1>();
    const observationId = text(raw?.observationId, 256);
    const canonicalOutcomeRef = text(raw?.canonicalOutcomeRef, 512);
    const observedCandidateId = text(raw?.policyCandidateId, 256);
    const observedCandidateVersion = text(raw?.policyCandidateVersion, 128);
    const observedCandidateRef = text(raw?.policyCandidateRef, 512);
    const observedDomain = text(raw?.domain, 256);
    const observedAt = canonicalTimestamp(raw?.observedAt);
    const truthState = TRUTH_STATES.has(raw?.truthState) ? raw.truthState : "UNKNOWN";
    const outcomeAssessment = ASSESSMENTS.has(raw?.outcomeAssessment)
      ? raw.outcomeAssessment
      : null;
    const attributionClass = text(raw?.attributionClass, 128);
    const outcomeEvidenceRef = text(raw?.outcomeEvidenceRef, 512);
    const observationSourceRefs = boundedUniqueRefs(raw?.sourceRefs);
    const confounderRefs = boundedUniqueRefs(raw?.confounderRefs);

    if (!observationId || !canonicalOutcomeRef) {
      reasons.add("OBSERVATION_IDENTITY_INVALID");
    }

    if (observationId) {
      if (seenObservationIds.has(observationId)) reasons.add("DUPLICATE_OBSERVATION_ID");
      seenObservationIds.add(observationId);
    }
    if (canonicalOutcomeRef) {
      if (seenOutcomeRefs.has(canonicalOutcomeRef)) reasons.add("DUPLICATE_OUTCOME_REF");
      seenOutcomeRefs.add(canonicalOutcomeRef);
    }
    if (outcomeEvidenceRef) {
      if (seenOutcomeEvidenceRefs.has(outcomeEvidenceRef)) {
        reasons.add("DUPLICATE_OUTCOME_EVIDENCE_REF");
      }
      seenOutcomeEvidenceRefs.add(outcomeEvidenceRef);
    }

    if (
      !candidateId
      || !candidateVersion
      || !candidateRef
      || !candidateDomain
      || observedCandidateId !== candidateId
      || observedCandidateVersion !== candidateVersion
      || observedCandidateRef !== candidateRef
      || observedDomain !== candidateDomain
    ) {
      reasons.add("OBSERVATION_CANDIDATE_MISMATCH");
    }

    if (!observedAt) {
      reasons.add("OBSERVATION_TIMESTAMP_INVALID");
    } else {
      const observedAtMs = Date.parse(observedAt);
      if (observedAtMs > generatedAtMs) reasons.add("OBSERVATION_FUTURE_DATED");
      if (promotedAt && observedAtMs < Date.parse(promotedAt)) {
        reasons.add("OBSERVATION_PRECEDES_CANDIDATE");
      }
      if (generatedAtMs - observedAtMs > maximumObservationAgeMs) {
        reasons.add("OBSERVATION_STALE");
      }
    }

    if (!TRUTH_STATES.has(raw?.truthState) || truthState !== "KNOWN") {
      reasons.add("OBSERVATION_TRUTH_NOT_KNOWN");
    }
    if (!outcomeAssessment) reasons.add("OBSERVATION_ASSESSMENT_INVALID");
    if (!attributionClass) reasons.add("OBSERVATION_ATTRIBUTION_REQUIRED");
    if (
      !outcomeEvidenceRef
      || !observationSourceRefs
      || observationSourceRefs.length === 0
      || !confounderRefs
    ) {
      reasons.add("OBSERVATION_PROVENANCE_REQUIRED");
    }

    for (const reason of reasons) aggregateReasons.add(reason);
    if (outcomeEvidenceRef) evidenceRefs.add(outcomeEvidenceRef);
    for (const ref of observationSourceRefs ?? []) sourceRefs.add(ref);
    if (attributionClass) attributionClasses.add(attributionClass);

    let lane: PolicyLongitudinalObservationLaneV1;
    if (reasons.size > 0 || candidateReasons.size > 0) {
      lane = "VERIFY_EVIDENCE";
      verificationObservationCount += 1;
    } else if (outcomeAssessment === "NEGATIVE") {
      lane = "COUNTED_NEGATIVE";
      negativeObservationCount += 1;
      countedNegativeObservationIds.push(observationId as string);
    } else if (outcomeAssessment === "INCONCLUSIVE") {
      lane = "INCONCLUSIVE";
      inconclusiveObservationCount += 1;
    } else {
      lane = "COUNTED_NON_NEGATIVE";
      if (outcomeAssessment === "POSITIVE") positiveObservationCount += 1;
      if (outcomeAssessment === "NEUTRAL") neutralObservationCount += 1;
    }

    observationReviews.push(Object.freeze({
      observationId: observationId ?? "INVALID_OBSERVATION",
      canonicalOutcomeRef: canonicalOutcomeRef ?? "INVALID_OUTCOME_REF",
      observedAt,
      truthState,
      outcomeAssessment,
      attributionClass,
      outcomeEvidenceRef,
      sourceRefs: observationSourceRefs ?? Object.freeze([]),
      confounderRefs: confounderRefs ?? Object.freeze([]),
      lane,
      reasons: Object.freeze([...reasons].sort((a, b) => a.localeCompare(b))),
      causalInterpretation: "NOT_ESTABLISHED",
      confidence: "NOT_ESTABLISHED",
      monetaryValue: null
    }));
  }

  let state: PolicyLongitudinalControlStateV1;
  if (input.observations.length === 0) {
    aggregateReasons.add("NO_OBSERVATIONS");
    state = candidateReasons.size > 0 ? "EVIDENCE_REVIEW_REQUIRED" : "NO_OBSERVATIONS";
  } else if (candidateReasons.size > 0 || verificationObservationCount > 0) {
    state = "EVIDENCE_REVIEW_REQUIRED";
  } else if (negativeObservationCount >= requiredNegativeObservations) {
    aggregateReasons.add("NEGATIVE_OBSERVATION_THRESHOLD_MET");
    state = "RETURN_TO_EXPERIMENT_REVIEW_REQUIRED";
  } else {
    aggregateReasons.add("INSUFFICIENT_NEGATIVE_OBSERVATIONS");
    state = "CONTINUE_OBSERVATION";
  }

  observationReviews.sort((a, b) => {
    const timeOrder = (a.observedAt ?? "").localeCompare(b.observedAt ?? "");
    return timeOrder !== 0 ? timeOrder : a.observationId.localeCompare(b.observationId);
  });
  countedNegativeObservationIds.sort((a, b) => a.localeCompare(b));

  const eligibleObservationCount = input.observations.length - verificationObservationCount;

  return deepFreeze({
    contractVersion: POLICY_LONGITUDINAL_CONTROL_VERSION_V1,
    policyVersion: POLICY_LONGITUDINAL_CONTROL_POLICY_VERSION_V1,
    reviewId: stableReviewId(candidateId ?? "INVALID_CANDIDATE", candidateVersion ?? "INVALID_VERSION", generatedAt),
    state,
    generatedAt,
    candidate: {
      policyCandidateId: candidateId ?? "INVALID_CANDIDATE",
      policyCandidateVersion: candidateVersion ?? "INVALID_VERSION",
      policyCandidateRef: candidateRef ?? "INVALID_CANDIDATE_REF",
      domain: candidateDomain ?? "INVALID_DOMAIN",
      promotedAt
    },
    requiredNegativeObservations,
    maximumObservationAgeMs,
    eligibleObservationCount,
    negativeObservationCount,
    positiveObservationCount,
    neutralObservationCount,
    inconclusiveObservationCount,
    verificationObservationCount,
    countedNegativeObservationIds: Object.freeze(countedNegativeObservationIds),
    observationReviews: Object.freeze(observationReviews),
    reasons: Object.freeze([...aggregateReasons].sort((a, b) => a.localeCompare(b))),
    evidenceRefs: Object.freeze([...evidenceRefs].sort((a, b) => a.localeCompare(b))),
    sourceRefs: Object.freeze([...sourceRefs].sort((a, b) => a.localeCompare(b))),
    attributionClassesObserved: Object.freeze([...attributionClasses].sort((a, b) => a.localeCompare(b))),
    analysisOnly: true,
    policyMutationAuthorized: false,
    policyDemotionAuthorized: false,
    experimentLaunchAuthorized: false,
    rollbackExecutionAuthorized: false,
    allocationMutationAuthorized: false,
    spendAuthorized: false,
    pricingChangeAuthorized: false,
    externalActionAuthorized: false,
    approvalBypassAuthorized: false,
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    expectedOutcome: null,
    limitations: LIMITATIONS
  });
}
