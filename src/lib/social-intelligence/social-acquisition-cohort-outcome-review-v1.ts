import {
  SOCIAL_PLATFORMS_V1,
  type SocialPlatformV1,
} from "./social-canonical-v1";
import {
  SOCIAL_BUSINESS_OUTCOME_KINDS_V1,
  type SocialBusinessOutcomeKindV1,
} from "./social-business-outcome-linkage-v1";

export type SocialCohortTruthStateV1 =
  | "KNOWN"
  | "INFERRED"
  | "UNKNOWN"
  | "STALE"
  | "PARTIAL"
  | "CONFLICTED";

export const SOCIAL_COHORT_SOURCE_KINDS_V1 = [
  "EXACT_CONTENT_REF",
  "EXACT_PROJECT_REF",
  "EXACT_CAMPAIGN_REF",
] as const;

export type SocialCohortSourceKindV1 = (typeof SOCIAL_COHORT_SOURCE_KINDS_V1)[number];

export const SOCIAL_COHORT_OUTCOME_LINK_BASES_V1 = [
  "EXACT_COHORT_MEMBERSHIP",
  "AGGREGATE_ASSOCIATION",
] as const;

export type SocialCohortOutcomeLinkBasisV1 = (typeof SOCIAL_COHORT_OUTCOME_LINK_BASES_V1)[number];
export type SocialCohortOutcomeAttributionClassV1 =
  | "DIRECT_TRACKED"
  | "SUPPORTED_ASSOCIATION"
  | "NOT_ESTABLISHED";

export type SocialAcquisitionCohortInputV1 = {
  cohortId: string;
  platform: SocialPlatformV1;
  accountRef: string;
  sourceKind: SocialCohortSourceKindV1;
  sourceRef: string;
  acquiredStart: string;
  acquiredEnd: string;
  initialMemberCount: number;
  observedAt: string;
  completeThroughAt: string;
  truthState: SocialCohortTruthStateV1;
  evidenceRefs: readonly string[];
};

export type SocialCohortRetentionObservationInputV1 = {
  retentionObservationId: string;
  cohortId: string;
  windowStart: string;
  windowEnd: string;
  eligibleMemberCount: number;
  engagedMemberCount: number;
  observedAt: string;
  completeThroughAt: string;
  truthState: SocialCohortTruthStateV1;
  evidenceRefs: readonly string[];
};

export type SocialCohortBusinessOutcomeObservationInputV1 = {
  outcomeObservationId: string;
  cohortId: string;
  kind: SocialBusinessOutcomeKindV1;
  windowStart: string;
  windowEnd: string;
  memberCount: number;
  eventCount: number;
  linkBasis: SocialCohortOutcomeLinkBasisV1;
  attributionClass: SocialCohortOutcomeAttributionClassV1;
  observedAt: string;
  completeThroughAt: string;
  truthState: SocialCohortTruthStateV1;
  evidenceRefs: readonly string[];
};

export type SocialAcquisitionCohortOutcomeReviewInputV1 = {
  generatedAt: string;
  maxEvidenceAgeMs: number;
  cohorts: readonly SocialAcquisitionCohortInputV1[];
  retentionObservations: readonly SocialCohortRetentionObservationInputV1[];
  outcomeObservations: readonly SocialCohortBusinessOutcomeObservationInputV1[];
};

export type SocialCohortRetentionReviewRowV1 = {
  retentionObservationId: string;
  windowStart: string;
  windowEnd: string;
  eligibleMemberCount: number;
  engagedMemberCount: number;
  observedRetentionRatio: number;
  evidenceRefs: readonly string[];
};

export type SocialCohortOutcomeReviewRowV1 = {
  outcomeObservationId: string;
  kind: SocialBusinessOutcomeKindV1;
  windowStart: string;
  windowEnd: string;
  memberCount: number;
  eventCount: number;
  linkBasis: SocialCohortOutcomeLinkBasisV1;
  attributionClass: SocialCohortOutcomeAttributionClassV1;
  qualifiedBusinessOutcome: boolean;
  decisionUse: "DIRECT_EVIDENCE" | "CONTEXT_ONLY" | "NOT_ESTABLISHED";
  evidenceRefs: readonly string[];
};

export type SocialAcquisitionCohortReviewSummaryV1 = {
  cohortId: string;
  platform: SocialPlatformV1;
  accountRef: string;
  sourceKind: SocialCohortSourceKindV1;
  sourceRef: string;
  acquiredStart: string;
  acquiredEnd: string;
  initialMemberCount: number;
  status:
    | "READY_FOR_COHORT_LEARNING_REVIEW"
    | "OBSERVATIONAL_ONLY"
    | "INSUFFICIENT_EVIDENCE"
    | "VERIFY_REQUIRED";
  retentionObservations: readonly SocialCohortRetentionReviewRowV1[];
  outcomeObservations: readonly SocialCohortOutcomeReviewRowV1[];
  latestObservedRetentionRatio: number | null;
  qualifiedDirectOutcomeObservationCount: number;
  qualifiedAssociatedOutcomeObservationCount: number;
  persistentEngagementEvidence: "OBSERVED_ACROSS_MULTIPLE_WINDOWS" | "SINGLE_WINDOW_ONLY" | "NOT_ESTABLISHED";
  businessOutcomeEvidence: "DIRECT_TRACKED_PRESENT" | "ASSOCIATION_ONLY" | "NOT_ESTABLISHED";
  learningCandidate: "COHORT_QUALITY_REVIEW" | "NONE";
  evidenceRefs: readonly string[];
  verificationReasons: readonly string[];
  causalClaim: false;
  revenueAttributionClaim: false;
  monetaryValue: null;
};

export type SocialAcquisitionCohortOutcomeReviewV1 = {
  contractVersion: "SocialAcquisitionCohortOutcomeReviewV1";
  generatedAt: string;
  status: "READY" | "PARTIAL" | "VERIFY_REQUIRED" | "NO_DECISION_GRADE_COHORTS";
  cohorts: readonly SocialAcquisitionCohortReviewSummaryV1[];
  verificationReasons: readonly string[];
  limitations: readonly string[];
  authority: {
    durableLearningPromotionAllowed: false;
    futurePriorUpdateAllowed: false;
    publicPostingAllowed: false;
    paidAmplificationAllowed: false;
    providerWriteAllowed: false;
    externalActionAllowed: false;
  };
  externalAccessPerformed: false;
  writesPerformed: false;
};

const INPUT_KEYS = new Set([
  "generatedAt",
  "maxEvidenceAgeMs",
  "cohorts",
  "retentionObservations",
  "outcomeObservations",
]);
const COHORT_KEYS = new Set([
  "cohortId",
  "platform",
  "accountRef",
  "sourceKind",
  "sourceRef",
  "acquiredStart",
  "acquiredEnd",
  "initialMemberCount",
  "observedAt",
  "completeThroughAt",
  "truthState",
  "evidenceRefs",
]);
const RETENTION_KEYS = new Set([
  "retentionObservationId",
  "cohortId",
  "windowStart",
  "windowEnd",
  "eligibleMemberCount",
  "engagedMemberCount",
  "observedAt",
  "completeThroughAt",
  "truthState",
  "evidenceRefs",
]);
const OUTCOME_KEYS = new Set([
  "outcomeObservationId",
  "cohortId",
  "kind",
  "windowStart",
  "windowEnd",
  "memberCount",
  "eventCount",
  "linkBasis",
  "attributionClass",
  "observedAt",
  "completeThroughAt",
  "truthState",
  "evidenceRefs",
]);

const TRUTH_STATES: readonly SocialCohortTruthStateV1[] = [
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "PARTIAL",
  "CONFLICTED",
];
const ATTRIBUTION_CLASSES: readonly SocialCohortOutcomeAttributionClassV1[] = [
  "DIRECT_TRACKED",
  "SUPPORTED_ASSOCIATION",
  "NOT_ESTABLISHED",
];
const QUALIFIED_BUSINESS_OUTCOMES = new Set<SocialBusinessOutcomeKindV1>([
  "INQUIRY",
  "PURCHASE",
  "OPPORTUNITY",
  "MEDIA_OUTCOME",
]);

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function assertPlainObject(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
}

function assertAllowedKeys(value: unknown, allowed: ReadonlySet<string>, field: string): void {
  assertPlainObject(value, field);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${field}.${key} is not supported`);
  }
}

function requireNonEmpty(value: string, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  if (normalized.length > 240) throw new Error(`${field} exceeds 240 characters`);
  return normalized;
}

function requireSafeRef(value: string, field: string): string {
  const normalized = requireNonEmpty(value, field);
  if (/^op:\/\//i.test(normalized)) throw new Error(`${field} must not contain a secret reference`);
  if (/mailto:|tel:/i.test(normalized) || /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(normalized)) {
    throw new Error(`${field} must not contain raw personal contact data`);
  }
  return normalized;
}

function requireIso(value: string, field: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be a valid timestamp`);
  }
  return new Date(Date.parse(value)).toISOString();
}

function requireSafeInteger(value: number, field: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${field} must be a safe integer >= ${minimum}`);
  }
  return value;
}

function requireAllowed<T extends string>(value: T, allowed: readonly T[], field: string): T {
  if (!allowed.includes(value)) throw new Error(`${field} is not supported`);
  return value;
}

function uniqueRefs(values: readonly string[], field: string): string[] {
  if (!Array.isArray(values) || values.length === 0) throw new Error(`${field} must contain evidence`);
  return [...new Set(values.map((value, index) => requireSafeRef(value, `${field}[${index}]`)))].sort((a, b) => a.localeCompare(b));
}

function isFreshKnown(
  truthState: SocialCohortTruthStateV1,
  observedAt: string,
  generatedAtMs: number,
  maxEvidenceAgeMs: number,
): boolean {
  const observedAtMs = Date.parse(observedAt);
  return truthState === "KNOWN" && observedAtMs <= generatedAtMs && generatedAtMs - observedAtMs <= maxEvidenceAgeMs;
}

function evidenceStateReasons(
  truthState: SocialCohortTruthStateV1,
  observedAt: string,
  generatedAtMs: number,
  maxEvidenceAgeMs: number,
  prefix: string,
): string[] {
  const reasons: string[] = [];
  const observedAtMs = Date.parse(observedAt);
  if (observedAtMs > generatedAtMs) reasons.push(`${prefix}_FUTURE_OBSERVATION`);
  if (generatedAtMs - observedAtMs > maxEvidenceAgeMs) reasons.push(`${prefix}_STALE_OBSERVATION`);
  if (truthState !== "KNOWN") reasons.push(`${prefix}_${truthState}`);
  return reasons;
}

function validateChronology(start: string, end: string, observedAt: string, completeThroughAt: string, field: string): void {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const observedAtMs = Date.parse(observedAt);
  const completeThroughAtMs = Date.parse(completeThroughAt);
  if (startMs >= endMs) throw new Error(`${field} must have start before end`);
  if (endMs > completeThroughAtMs) throw new Error(`${field}.completeThroughAt must cover the full window`);
  if (completeThroughAtMs > observedAtMs) throw new Error(`${field}.completeThroughAt must not be after observedAt`);
}

export function compileSocialAcquisitionCohortOutcomeReviewV1(
  input: SocialAcquisitionCohortOutcomeReviewInputV1,
): SocialAcquisitionCohortOutcomeReviewV1 {
  assertAllowedKeys(input, INPUT_KEYS, "input");
  const generatedAt = requireIso(input.generatedAt, "generatedAt");
  const generatedAtMs = Date.parse(generatedAt);
  const maxEvidenceAgeMs = requireSafeInteger(input.maxEvidenceAgeMs, "maxEvidenceAgeMs", 1);

  if (!Array.isArray(input.cohorts) || !Array.isArray(input.retentionObservations) || !Array.isArray(input.outcomeObservations)) {
    throw new Error("cohorts, retentionObservations, and outcomeObservations must be arrays");
  }
  if (input.cohorts.length > 500) throw new Error("cohorts exceeds bounded maximum of 500");
  if (input.retentionObservations.length > 5_000) throw new Error("retentionObservations exceeds bounded maximum of 5000");
  if (input.outcomeObservations.length > 5_000) throw new Error("outcomeObservations exceeds bounded maximum of 5000");

  const cohortIndex = new Map<string, SocialAcquisitionCohortInputV1>();
  const normalizedCohortEvidence = new Map<string, readonly string[]>();
  const globalVerificationReasons: string[] = [];

  for (const [index, cohort] of input.cohorts.entries()) {
    assertAllowedKeys(cohort, COHORT_KEYS, `cohorts[${index}]`);
    const cohortId = requireSafeRef(cohort.cohortId, `cohorts[${index}].cohortId`);
    if (cohortIndex.has(cohortId)) throw new Error(`duplicate cohortId ${cohortId}`);
    requireAllowed(cohort.platform, SOCIAL_PLATFORMS_V1, `cohorts[${index}].platform`);
    requireSafeRef(cohort.accountRef, `cohorts[${index}].accountRef`);
    requireAllowed(cohort.sourceKind, SOCIAL_COHORT_SOURCE_KINDS_V1, `cohorts[${index}].sourceKind`);
    requireSafeRef(cohort.sourceRef, `cohorts[${index}].sourceRef`);
    const acquiredStart = requireIso(cohort.acquiredStart, `cohorts[${index}].acquiredStart`);
    const acquiredEnd = requireIso(cohort.acquiredEnd, `cohorts[${index}].acquiredEnd`);
    const observedAt = requireIso(cohort.observedAt, `cohorts[${index}].observedAt`);
    const completeThroughAt = requireIso(cohort.completeThroughAt, `cohorts[${index}].completeThroughAt`);
    validateChronology(acquiredStart, acquiredEnd, observedAt, completeThroughAt, `cohorts[${index}]`);
    requireSafeInteger(cohort.initialMemberCount, `cohorts[${index}].initialMemberCount`, 1);
    requireAllowed(cohort.truthState, TRUTH_STATES, `cohorts[${index}].truthState`);
    const evidenceRefs = uniqueRefs(cohort.evidenceRefs, `cohorts[${index}].evidenceRefs`);
    normalizedCohortEvidence.set(cohortId, evidenceRefs);
    cohortIndex.set(cohortId, cohort);
  }

  const retentionByCohort = new Map<string, SocialCohortRetentionReviewRowV1[]>();
  const retentionReasonsByCohort = new Map<string, string[]>();
  const seenRetentionIds = new Set<string>();

  for (const [index, observation] of input.retentionObservations.entries()) {
    assertAllowedKeys(observation, RETENTION_KEYS, `retentionObservations[${index}]`);
    const id = requireSafeRef(observation.retentionObservationId, `retentionObservations[${index}].retentionObservationId`);
    if (seenRetentionIds.has(id)) throw new Error(`duplicate retentionObservationId ${id}`);
    seenRetentionIds.add(id);
    const cohortId = requireSafeRef(observation.cohortId, `retentionObservations[${index}].cohortId`);
    const cohort = cohortIndex.get(cohortId);
    if (!cohort) {
      globalVerificationReasons.push(`RETENTION_UNKNOWN_COHORT:${cohortId}`);
      continue;
    }
    const windowStart = requireIso(observation.windowStart, `retentionObservations[${index}].windowStart`);
    const windowEnd = requireIso(observation.windowEnd, `retentionObservations[${index}].windowEnd`);
    const observedAt = requireIso(observation.observedAt, `retentionObservations[${index}].observedAt`);
    const completeThroughAt = requireIso(observation.completeThroughAt, `retentionObservations[${index}].completeThroughAt`);
    validateChronology(windowStart, windowEnd, observedAt, completeThroughAt, `retentionObservations[${index}]`);
    if (Date.parse(windowStart) < Date.parse(cohort.acquiredEnd)) {
      throw new Error(`retentionObservations[${index}] starts before cohort acquisition completed`);
    }
    const eligibleMemberCount = requireSafeInteger(observation.eligibleMemberCount, `retentionObservations[${index}].eligibleMemberCount`, 1);
    const engagedMemberCount = requireSafeInteger(observation.engagedMemberCount, `retentionObservations[${index}].engagedMemberCount`);
    if (eligibleMemberCount > cohort.initialMemberCount) throw new Error(`retentionObservations[${index}].eligibleMemberCount exceeds initial cohort`);
    if (engagedMemberCount > eligibleMemberCount) throw new Error(`retentionObservations[${index}].engagedMemberCount exceeds eligible members`);
    requireAllowed(observation.truthState, TRUTH_STATES, `retentionObservations[${index}].truthState`);
    const evidenceRefs = uniqueRefs(observation.evidenceRefs, `retentionObservations[${index}].evidenceRefs`);
    const reasons = evidenceStateReasons(observation.truthState, observedAt, generatedAtMs, maxEvidenceAgeMs, "RETENTION");
    if (reasons.length) {
      retentionReasonsByCohort.set(cohortId, [...(retentionReasonsByCohort.get(cohortId) ?? []), ...reasons]);
      continue;
    }
    if (!isFreshKnown(observation.truthState, observedAt, generatedAtMs, maxEvidenceAgeMs)) continue;
    const row: SocialCohortRetentionReviewRowV1 = {
      retentionObservationId: id,
      windowStart,
      windowEnd,
      eligibleMemberCount,
      engagedMemberCount,
      observedRetentionRatio: engagedMemberCount / eligibleMemberCount,
      evidenceRefs,
    };
    retentionByCohort.set(cohortId, [...(retentionByCohort.get(cohortId) ?? []), row]);
  }

  const outcomesByCohort = new Map<string, SocialCohortOutcomeReviewRowV1[]>();
  const outcomeReasonsByCohort = new Map<string, string[]>();
  const seenOutcomeIds = new Set<string>();

  for (const [index, observation] of input.outcomeObservations.entries()) {
    assertAllowedKeys(observation, OUTCOME_KEYS, `outcomeObservations[${index}]`);
    const id = requireSafeRef(observation.outcomeObservationId, `outcomeObservations[${index}].outcomeObservationId`);
    if (seenOutcomeIds.has(id)) throw new Error(`duplicate outcomeObservationId ${id}`);
    seenOutcomeIds.add(id);
    const cohortId = requireSafeRef(observation.cohortId, `outcomeObservations[${index}].cohortId`);
    const cohort = cohortIndex.get(cohortId);
    if (!cohort) {
      globalVerificationReasons.push(`OUTCOME_UNKNOWN_COHORT:${cohortId}`);
      continue;
    }
    const kind = requireAllowed(observation.kind, SOCIAL_BUSINESS_OUTCOME_KINDS_V1, `outcomeObservations[${index}].kind`);
    const windowStart = requireIso(observation.windowStart, `outcomeObservations[${index}].windowStart`);
    const windowEnd = requireIso(observation.windowEnd, `outcomeObservations[${index}].windowEnd`);
    const observedAt = requireIso(observation.observedAt, `outcomeObservations[${index}].observedAt`);
    const completeThroughAt = requireIso(observation.completeThroughAt, `outcomeObservations[${index}].completeThroughAt`);
    validateChronology(windowStart, windowEnd, observedAt, completeThroughAt, `outcomeObservations[${index}]`);
    if (Date.parse(windowStart) < Date.parse(cohort.acquiredEnd)) {
      throw new Error(`outcomeObservations[${index}] starts before cohort acquisition completed`);
    }
    const memberCount = requireSafeInteger(observation.memberCount, `outcomeObservations[${index}].memberCount`);
    const eventCount = requireSafeInteger(observation.eventCount, `outcomeObservations[${index}].eventCount`);
    if (memberCount > cohort.initialMemberCount) throw new Error(`outcomeObservations[${index}].memberCount exceeds initial cohort`);
    if (eventCount < memberCount) throw new Error(`outcomeObservations[${index}].eventCount must be >= memberCount`);
    const linkBasis = requireAllowed(observation.linkBasis, SOCIAL_COHORT_OUTCOME_LINK_BASES_V1, `outcomeObservations[${index}].linkBasis`);
    const attributionClass = requireAllowed(observation.attributionClass, ATTRIBUTION_CLASSES, `outcomeObservations[${index}].attributionClass`);
    requireAllowed(observation.truthState, TRUTH_STATES, `outcomeObservations[${index}].truthState`);
    const evidenceRefs = uniqueRefs(observation.evidenceRefs, `outcomeObservations[${index}].evidenceRefs`);
    const reasons = evidenceStateReasons(observation.truthState, observedAt, generatedAtMs, maxEvidenceAgeMs, "OUTCOME");
    if (linkBasis === "EXACT_COHORT_MEMBERSHIP" && attributionClass !== "DIRECT_TRACKED") {
      reasons.push("OUTCOME_EXACT_MEMBERSHIP_REQUIRES_DIRECT_TRACKING");
    }
    if (linkBasis === "AGGREGATE_ASSOCIATION" && attributionClass === "DIRECT_TRACKED") {
      reasons.push("OUTCOME_AGGREGATE_ASSOCIATION_CANNOT_BE_DIRECT_TRACKED");
    }
    if (reasons.length) {
      outcomeReasonsByCohort.set(cohortId, [...(outcomeReasonsByCohort.get(cohortId) ?? []), ...reasons]);
      continue;
    }
    const qualifiedBusinessOutcome = QUALIFIED_BUSINESS_OUTCOMES.has(kind);
    const decisionUse: SocialCohortOutcomeReviewRowV1["decisionUse"] =
      attributionClass === "DIRECT_TRACKED" && linkBasis === "EXACT_COHORT_MEMBERSHIP"
        ? "DIRECT_EVIDENCE"
        : attributionClass === "SUPPORTED_ASSOCIATION"
          ? "CONTEXT_ONLY"
          : "NOT_ESTABLISHED";
    outcomesByCohort.set(cohortId, [
      ...(outcomesByCohort.get(cohortId) ?? []),
      {
        outcomeObservationId: id,
        kind,
        windowStart,
        windowEnd,
        memberCount,
        eventCount,
        linkBasis,
        attributionClass,
        qualifiedBusinessOutcome,
        decisionUse,
        evidenceRefs,
      },
    ]);
  }

  const summaries: SocialAcquisitionCohortReviewSummaryV1[] = [];

  for (const [cohortId, cohort] of [...cohortIndex.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const verificationReasons = [
      ...evidenceStateReasons(cohort.truthState, requireIso(cohort.observedAt, `${cohortId}.observedAt`), generatedAtMs, maxEvidenceAgeMs, "COHORT"),
      ...(retentionReasonsByCohort.get(cohortId) ?? []),
      ...(outcomeReasonsByCohort.get(cohortId) ?? []),
    ];

    const retentionObservations = [...(retentionByCohort.get(cohortId) ?? [])].sort(
      (a, b) => Date.parse(a.windowEnd) - Date.parse(b.windowEnd) || a.retentionObservationId.localeCompare(b.retentionObservationId),
    );
    const outcomeObservations = [...(outcomesByCohort.get(cohortId) ?? [])].sort(
      (a, b) => Date.parse(a.windowEnd) - Date.parse(b.windowEnd) || a.outcomeObservationId.localeCompare(b.outcomeObservationId),
    );

    for (let index = 1; index < retentionObservations.length; index += 1) {
      if (Date.parse(retentionObservations[index - 1].windowEnd) > Date.parse(retentionObservations[index].windowStart)) {
        verificationReasons.push("RETENTION_WINDOWS_OVERLAP");
        break;
      }
    }

    const qualifiedDirectOutcomeObservationCount = outcomeObservations.filter(
      (row) => row.qualifiedBusinessOutcome && row.decisionUse === "DIRECT_EVIDENCE" && row.memberCount > 0 && row.eventCount > 0,
    ).length;
    const qualifiedAssociatedOutcomeObservationCount = outcomeObservations.filter(
      (row) => row.qualifiedBusinessOutcome && row.decisionUse === "CONTEXT_ONLY" && row.memberCount > 0 && row.eventCount > 0,
    ).length;

    const persistentEngagementEvidence: SocialAcquisitionCohortReviewSummaryV1["persistentEngagementEvidence"] =
      retentionObservations.length >= 2
        ? "OBSERVED_ACROSS_MULTIPLE_WINDOWS"
        : retentionObservations.length === 1
          ? "SINGLE_WINDOW_ONLY"
          : "NOT_ESTABLISHED";
    const businessOutcomeEvidence: SocialAcquisitionCohortReviewSummaryV1["businessOutcomeEvidence"] =
      qualifiedDirectOutcomeObservationCount > 0
        ? "DIRECT_TRACKED_PRESENT"
        : qualifiedAssociatedOutcomeObservationCount > 0
          ? "ASSOCIATION_ONLY"
          : "NOT_ESTABLISHED";

    let status: SocialAcquisitionCohortReviewSummaryV1["status"] = "INSUFFICIENT_EVIDENCE";
    let learningCandidate: SocialAcquisitionCohortReviewSummaryV1["learningCandidate"] = "NONE";
    if (verificationReasons.length > 0) {
      status = "VERIFY_REQUIRED";
    } else if (persistentEngagementEvidence === "OBSERVED_ACROSS_MULTIPLE_WINDOWS" && businessOutcomeEvidence === "DIRECT_TRACKED_PRESENT") {
      status = "READY_FOR_COHORT_LEARNING_REVIEW";
      learningCandidate = "COHORT_QUALITY_REVIEW";
    } else if (retentionObservations.length > 0 || outcomeObservations.length > 0) {
      status = "OBSERVATIONAL_ONLY";
    }

    const evidenceRefs = [
      ...(normalizedCohortEvidence.get(cohortId) ?? []),
      ...retentionObservations.flatMap((row) => row.evidenceRefs),
      ...outcomeObservations.flatMap((row) => row.evidenceRefs),
    ];

    summaries.push({
      cohortId,
      platform: cohort.platform,
      accountRef: requireSafeRef(cohort.accountRef, `${cohortId}.accountRef`),
      sourceKind: cohort.sourceKind,
      sourceRef: requireSafeRef(cohort.sourceRef, `${cohortId}.sourceRef`),
      acquiredStart: requireIso(cohort.acquiredStart, `${cohortId}.acquiredStart`),
      acquiredEnd: requireIso(cohort.acquiredEnd, `${cohortId}.acquiredEnd`),
      initialMemberCount: cohort.initialMemberCount,
      status,
      retentionObservations,
      outcomeObservations,
      latestObservedRetentionRatio: retentionObservations.at(-1)?.observedRetentionRatio ?? null,
      qualifiedDirectOutcomeObservationCount,
      qualifiedAssociatedOutcomeObservationCount,
      persistentEngagementEvidence,
      businessOutcomeEvidence,
      learningCandidate,
      evidenceRefs: [...new Set(evidenceRefs)].sort((a, b) => a.localeCompare(b)),
      verificationReasons: [...new Set(verificationReasons)].sort((a, b) => a.localeCompare(b)),
      causalClaim: false,
      revenueAttributionClaim: false,
      monetaryValue: null,
    });
  }

  const readyCount = summaries.filter((row) => row.status === "READY_FOR_COHORT_LEARNING_REVIEW").length;
  const verifyCount = summaries.filter((row) => row.status === "VERIFY_REQUIRED").length;
  const status: SocialAcquisitionCohortOutcomeReviewV1["status"] =
    globalVerificationReasons.length > 0
      ? "VERIFY_REQUIRED"
      : summaries.length === 0 || summaries.every((row) => row.status === "INSUFFICIENT_EVIDENCE")
        ? "NO_DECISION_GRADE_COHORTS"
        : verifyCount === summaries.length
          ? "VERIFY_REQUIRED"
          : verifyCount > 0
            ? "PARTIAL"
            : readyCount > 0
              ? "READY"
              : "PARTIAL";

  return freeze({
    contractVersion: "SocialAcquisitionCohortOutcomeReviewV1",
    generatedAt,
    status,
    cohorts: summaries,
    verificationReasons: [...new Set(globalVerificationReasons)].sort((a, b) => a.localeCompare(b)),
    limitations: [
      "Cohort evidence is aggregate and privacy-preserving; this contract does not expose follower identities or raw contact data.",
      "Observed retention and downstream outcomes do not prove the acquisition source caused later engagement or business outcomes.",
      "Member counts across outcome kinds must not be summed as unique people because overlap is not established.",
      "A cohort learning candidate remains internal review only and cannot become durable policy from this contract.",
    ],
    authority: {
      durableLearningPromotionAllowed: false,
      futurePriorUpdateAllowed: false,
      publicPostingAllowed: false,
      paidAmplificationAllowed: false,
      providerWriteAllowed: false,
      externalActionAllowed: false,
    },
    externalAccessPerformed: false,
    writesPerformed: false,
  });
}
