import type {
  SocialContentBusinessValueReviewItemV1,
  SocialContentBusinessValueReviewV1
} from "./social-content-business-value-review-v1";
import type {
  SocialContentPerformanceAgeBucketV1,
  SocialContentPerformanceAmplificationV1,
  SocialContentPerformanceItemV1,
  SocialContentPerformanceReviewV1
} from "./social-content-performance-review-v1";
import type { SocialMetricKeyV1, SocialPlatformV1 } from "./social-canonical-v1";

export const SOCIAL_CONTENT_EFFORT_EFFICIENCY_REVIEW_V1_VERSION =
  "SocialContentEffortEfficiencyReviewV1" as const;
export const SOCIAL_CONTENT_EFFORT_EFFICIENCY_MAX_ITEMS_V1 = 500;

export type SocialContentEffortSourceStateV1 = "COMPLETE" | "PARTIAL" | "CONFLICTED" | "MISSING";

export type SocialContentEffortObservationInputV1 = Readonly<{
  platform: SocialPlatformV1;
  accountId: string;
  contentId: string;
  formatKey: string;
  amplificationType: SocialContentPerformanceAmplificationV1;
  ageBucket: SocialContentPerformanceAgeBucketV1;
  sourceState: SocialContentEffortSourceStateV1;
  observedAt: string;
  productionEffortMinutes: number;
  comparableMedianEffortMinutes: number;
  comparableCohortSize: number;
  effortEvidenceRefs: readonly string[];
  comparableCohortEvidenceRefs: readonly string[];
}>;

export type SocialContentEffortEfficiencyPolicyV1 = Readonly<{
  maxEvidenceAgeHours: number;
  minimumComparableCohortSize: number;
  lowerEffortRatioAtMost: number;
  higherEffortRatioAtLeast: number;
}>;

export type SocialContentEffortClassV1 =
  | "LOWER_THAN_COMPARABLE"
  | "TYPICAL"
  | "HIGHER_THAN_COMPARABLE"
  | "NOT_ESTABLISHED";

export type SocialContentEffortEfficiencySignalV1 =
  | "LOWER_EFFORT_TRACKED_BUSINESS_SIGNAL"
  | "LOWER_EFFORT_OUTPERFORMING_PLATFORM_SIGNAL"
  | "HIGHER_EFFORT_TRACKED_BUSINESS_SIGNAL_REVIEW"
  | "HIGHER_EFFORT_BUSINESS_VALUE_NOT_ESTABLISHED"
  | "TYPICAL_EFFORT_TRACKED_BUSINESS_SIGNAL";

export type SocialContentEffortEfficiencyReasonV1 =
  | "EFFORT_SOURCE_NOT_COMPLETE"
  | "EFFORT_EVIDENCE_FROM_FUTURE"
  | "EFFORT_EVIDENCE_TOO_OLD"
  | "COMPARABLE_COHORT_TOO_SMALL"
  | "PERFORMANCE_COHORT_MISMATCH"
  | "PERFORMANCE_EVIDENCE_NOT_READY"
  | "BUSINESS_VALUE_EVIDENCE_NOT_READY";

export type SocialContentEffortEfficiencyItemV1 = Readonly<{
  contentRef: string;
  platform: SocialPlatformV1;
  accountId: string;
  contentId: string;
  formatKey: string;
  amplificationType: SocialContentPerformanceAmplificationV1;
  ageBucket: SocialContentPerformanceAgeBucketV1;
  state: "READY" | "VERIFY_REQUIRED";
  reasons: readonly SocialContentEffortEfficiencyReasonV1[];
  productionEffortMinutes: number;
  comparableMedianEffortMinutes: number;
  comparableCohortSize: number;
  effortRatioToComparableMedian: number | null;
  effortClass: SocialContentEffortClassV1;
  performanceMetricsObserved: readonly SocialMetricKeyV1[];
  outperformingMetrics: readonly SocialMetricKeyV1[];
  underperformingMetrics: readonly SocialMetricKeyV1[];
  businessValueState: SocialContentBusinessValueReviewItemV1["businessValueState"] | "NOT_ESTABLISHED";
  linkedOutcomeCount: number | null;
  directTrackedOutcomeCount: number | null;
  signals: readonly SocialContentEffortEfficiencySignalV1[];
  evidenceRefs: readonly string[];
  interpretation: "NON_MONETARY_WITHIN_COHORT_EFFORT_CONTEXT_ONLY";
  causalClaim: false;
  revenueAttributionClaim: false;
  monetaryRoiClaim: false;
  expectedLift: null;
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
}>;

export type SocialContentEffortEfficiencyReviewV1 = Readonly<{
  contractVersion: typeof SOCIAL_CONTENT_EFFORT_EFFICIENCY_REVIEW_V1_VERSION;
  evaluatedAt: string;
  status: "READY" | "PARTIAL" | "VERIFY_REQUIRED" | "NO_EVIDENCE";
  items: readonly SocialContentEffortEfficiencyItemV1[];
  lowerEffortWithTrackedBusinessSignal: readonly SocialContentEffortEfficiencyItemV1[];
  lowerEffortWithOutperformingPlatformSignal: readonly SocialContentEffortEfficiencyItemV1[];
  highEffortReview: readonly SocialContentEffortEfficiencyItemV1[];
  verificationRequired: readonly SocialContentEffortEfficiencyItemV1[];
  evidenceRefs: readonly string[];
  limitations: readonly string[];
  causalClaim: false;
  revenueAttributionClaim: false;
  monetaryRoiClaim: false;
  crossPlatformEfficiencyComparisonAuthority: "NONE";
  recommendationAuthority: "NONE";
  providerWriteAuthority: "NONE";
  notificationAuthority: "NONE";
  postingAuthority: "NONE";
  spendAuthority: "NONE";
  externalAccessPerformed: false;
  writesPerformed: false;
}>;

export type SocialContentEffortEfficiencyReviewInputV1 = Readonly<{
  effortObservations: readonly SocialContentEffortObservationInputV1[];
  performanceReview: SocialContentPerformanceReviewV1;
  businessValueReview: SocialContentBusinessValueReviewV1;
  policy: SocialContentEffortEfficiencyPolicyV1;
  evaluatedAt: string;
}>;

const SECRET_LIKE =
  /(authorization\s*:|bearer\s+[a-z0-9._~+\/-]+|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|client[_-]?secret|session[_-]?token)\s*[=:])/i;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be non-empty`);
  return value.trim();
}

function timestamp(value: unknown, field: string): string {
  const normalized = nonEmpty(value, field);
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function positive(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a finite positive number`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function safeRef(value: unknown, field: string): string {
  const normalized = nonEmpty(value, field);
  if (SECRET_LIKE.test(normalized)) throw new Error(`${field} contains credential-like material`);
  return normalized;
}

function uniqueRefs(values: readonly string[], field: string): string[] {
  if (!Array.isArray(values)) throw new Error(`${field} must be an array`);
  return [...new Set(values.map((value, index) => safeRef(value, `${field}[${index}]`)))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000) / 1_000;
}

function contentKey(platform: SocialPlatformV1, accountId: string, contentId: string): string {
  return `${platform}\u0000${accountId}\u0000${contentId}`;
}

function normalizePolicy(policy: SocialContentEffortEfficiencyPolicyV1): SocialContentEffortEfficiencyPolicyV1 {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) throw new Error("policy must be an object");
  const maxEvidenceAgeHours = positive(policy.maxEvidenceAgeHours, "policy.maxEvidenceAgeHours");
  const minimumComparableCohortSize = positiveInteger(
    policy.minimumComparableCohortSize,
    "policy.minimumComparableCohortSize"
  );
  const lowerEffortRatioAtMost = positive(policy.lowerEffortRatioAtMost, "policy.lowerEffortRatioAtMost");
  const higherEffortRatioAtLeast = positive(policy.higherEffortRatioAtLeast, "policy.higherEffortRatioAtLeast");
  if (lowerEffortRatioAtMost >= higherEffortRatioAtLeast) {
    throw new Error("policy.lowerEffortRatioAtMost must be below policy.higherEffortRatioAtLeast");
  }
  return deepFreeze({
    maxEvidenceAgeHours,
    minimumComparableCohortSize,
    lowerEffortRatioAtMost,
    higherEffortRatioAtLeast
  });
}

function validatePerformanceReview(review: SocialContentPerformanceReviewV1, evaluatedAt: string, maxAgeHours: number): boolean {
  if (review.contractVersion !== "SocialContentPerformanceReviewV1") {
    throw new Error("performanceReview contractVersion is invalid");
  }
  if (
    review.externalAccessPerformed !== false ||
    review.writesPerformed !== false ||
    review.recommendationAuthority !== "NONE" ||
    review.providerWriteAuthority !== "NONE"
  ) {
    throw new Error("performanceReview widens analysis-only authority");
  }
  const observedAt = timestamp(review.evaluatedAt, "performanceReview.evaluatedAt");
  const ageHours = (Date.parse(evaluatedAt) - Date.parse(observedAt)) / 3_600_000;
  if (ageHours < 0) throw new Error("performanceReview.evaluatedAt cannot be after evaluatedAt");
  return ageHours <= maxAgeHours && review.status === "READY";
}

function validateBusinessValueReview(review: SocialContentBusinessValueReviewV1, evaluatedAt: string, maxAgeHours: number): boolean {
  if (review.contractVersion !== "SocialContentBusinessValueReviewV1") {
    throw new Error("businessValueReview contractVersion is invalid");
  }
  if (
    review.externalAccessPerformed !== false ||
    review.writesPerformed !== false ||
    review.recommendationAuthority !== "NONE" ||
    review.providerWriteAuthority !== "NONE"
  ) {
    throw new Error("businessValueReview widens analysis-only authority");
  }
  const observedAt = timestamp(review.evaluatedAt, "businessValueReview.evaluatedAt");
  const ageHours = (Date.parse(evaluatedAt) - Date.parse(observedAt)) / 3_600_000;
  if (ageHours < 0) throw new Error("businessValueReview.evaluatedAt cannot be after evaluatedAt");
  return ageHours <= maxAgeHours && review.status === "READY";
}

function effortClass(
  ratio: number,
  policy: SocialContentEffortEfficiencyPolicyV1
): SocialContentEffortClassV1 {
  if (ratio <= policy.lowerEffortRatioAtMost) return "LOWER_THAN_COMPARABLE";
  if (ratio >= policy.higherEffortRatioAtLeast) return "HIGHER_THAN_COMPARABLE";
  return "TYPICAL";
}

function signalsFor(
  effort: SocialContentEffortClassV1,
  performanceItems: readonly SocialContentPerformanceItemV1[],
  businessValue: SocialContentBusinessValueReviewItemV1 | null
): SocialContentEffortEfficiencySignalV1[] {
  const signals: SocialContentEffortEfficiencySignalV1[] = [];
  const trackedBusinessSignal = businessValue?.businessValueState === "TRACKED_BUSINESS_SIGNAL";
  const outperforming = performanceItems.some((item) => item.classification === "OUTPERFORMING");
  if (effort === "LOWER_THAN_COMPARABLE" && trackedBusinessSignal) {
    signals.push("LOWER_EFFORT_TRACKED_BUSINESS_SIGNAL");
  }
  if (effort === "LOWER_THAN_COMPARABLE" && outperforming) {
    signals.push("LOWER_EFFORT_OUTPERFORMING_PLATFORM_SIGNAL");
  }
  if (effort === "HIGHER_THAN_COMPARABLE" && trackedBusinessSignal) {
    signals.push("HIGHER_EFFORT_TRACKED_BUSINESS_SIGNAL_REVIEW");
  }
  if (effort === "HIGHER_THAN_COMPARABLE" && !trackedBusinessSignal) {
    signals.push("HIGHER_EFFORT_BUSINESS_VALUE_NOT_ESTABLISHED");
  }
  if (effort === "TYPICAL" && trackedBusinessSignal) {
    signals.push("TYPICAL_EFFORT_TRACKED_BUSINESS_SIGNAL");
  }
  return unique(signals);
}

function normalizeObservation(
  observation: SocialContentEffortObservationInputV1,
  index: number,
  policy: SocialContentEffortEfficiencyPolicyV1,
  evaluatedAt: string,
  performanceReady: boolean,
  businessValueReady: boolean,
  performanceItems: readonly SocialContentPerformanceItemV1[],
  businessValue: SocialContentBusinessValueReviewItemV1 | null
): SocialContentEffortEfficiencyItemV1 {
  const accountId = nonEmpty(observation.accountId, `effortObservations[${index}].accountId`);
  const contentId = nonEmpty(observation.contentId, `effortObservations[${index}].contentId`);
  const formatKey = nonEmpty(observation.formatKey, `effortObservations[${index}].formatKey`);
  const observedAt = timestamp(observation.observedAt, `effortObservations[${index}].observedAt`);
  const productionEffortMinutes = positive(
    observation.productionEffortMinutes,
    `effortObservations[${index}].productionEffortMinutes`
  );
  const comparableMedianEffortMinutes = positive(
    observation.comparableMedianEffortMinutes,
    `effortObservations[${index}].comparableMedianEffortMinutes`
  );
  const comparableCohortSize = positiveInteger(
    observation.comparableCohortSize,
    `effortObservations[${index}].comparableCohortSize`
  );
  const effortEvidenceRefs = uniqueRefs(
    observation.effortEvidenceRefs,
    `effortObservations[${index}].effortEvidenceRefs`
  );
  const cohortEvidenceRefs = uniqueRefs(
    observation.comparableCohortEvidenceRefs,
    `effortObservations[${index}].comparableCohortEvidenceRefs`
  );
  if (!effortEvidenceRefs.length) throw new Error(`effortObservations[${index}] requires effort evidence`);
  if (!cohortEvidenceRefs.length) throw new Error(`effortObservations[${index}] requires comparable cohort evidence`);

  const reasons: SocialContentEffortEfficiencyReasonV1[] = [];
  if (observation.sourceState !== "COMPLETE") reasons.push("EFFORT_SOURCE_NOT_COMPLETE");
  const ageHours = (Date.parse(evaluatedAt) - Date.parse(observedAt)) / 3_600_000;
  if (ageHours < 0) reasons.push("EFFORT_EVIDENCE_FROM_FUTURE");
  if (ageHours >= 0 && ageHours > policy.maxEvidenceAgeHours) reasons.push("EFFORT_EVIDENCE_TOO_OLD");
  if (comparableCohortSize < policy.minimumComparableCohortSize) reasons.push("COMPARABLE_COHORT_TOO_SMALL");
  if (!performanceReady) reasons.push("PERFORMANCE_EVIDENCE_NOT_READY");
  if (!businessValueReady) reasons.push("BUSINESS_VALUE_EVIDENCE_NOT_READY");

  const cohortMismatch = performanceItems.some(
    (item) =>
      item.formatKey !== formatKey ||
      item.amplificationType !== observation.amplificationType ||
      item.ageBucket !== observation.ageBucket
  );
  if (cohortMismatch) reasons.push("PERFORMANCE_COHORT_MISMATCH");

  const normalizedReasons = unique(reasons);
  const ready = normalizedReasons.length === 0;
  const ratio = ready ? round(productionEffortMinutes / comparableMedianEffortMinutes) : null;
  const effort = ratio == null ? "NOT_ESTABLISHED" : effortClass(ratio, policy);
  const acceptedPerformance = ready ? performanceItems : [];
  const acceptedBusinessValue = ready ? businessValue : null;

  return deepFreeze({
    contentRef: `${observation.platform}:${contentId}`,
    platform: observation.platform,
    accountId,
    contentId,
    formatKey,
    amplificationType: observation.amplificationType,
    ageBucket: observation.ageBucket,
    state: ready ? ("READY" as const) : ("VERIFY_REQUIRED" as const),
    reasons: normalizedReasons,
    productionEffortMinutes,
    comparableMedianEffortMinutes,
    comparableCohortSize,
    effortRatioToComparableMedian: ratio,
    effortClass: effort,
    performanceMetricsObserved: unique(acceptedPerformance.map((item) => item.metric)),
    outperformingMetrics: unique(
      acceptedPerformance.filter((item) => item.classification === "OUTPERFORMING").map((item) => item.metric)
    ),
    underperformingMetrics: unique(
      acceptedPerformance.filter((item) => item.classification === "UNDERPERFORMING").map((item) => item.metric)
    ),
    businessValueState: acceptedBusinessValue?.businessValueState ?? "NOT_ESTABLISHED",
    linkedOutcomeCount: acceptedBusinessValue?.linkedOutcomeCount ?? null,
    directTrackedOutcomeCount: acceptedBusinessValue?.directTrackedOutcomeCount ?? null,
    signals: ready ? signalsFor(effort, acceptedPerformance, acceptedBusinessValue) : [],
    evidenceRefs: uniqueRefs(
      [
        ...effortEvidenceRefs,
        ...cohortEvidenceRefs,
        ...acceptedPerformance.flatMap((item) => item.evidenceRefs),
        ...(acceptedBusinessValue?.performanceEvidenceRefs ?? []),
        ...(acceptedBusinessValue?.outcomeEvidenceRefs ?? [])
      ],
      `effortObservations[${index}].combinedEvidenceRefs`
    ),
    interpretation: "NON_MONETARY_WITHIN_COHORT_EFFORT_CONTEXT_ONLY" as const,
    causalClaim: false as const,
    revenueAttributionClaim: false as const,
    monetaryRoiClaim: false as const,
    expectedLift: null,
    confidence: "NOT_ESTABLISHED" as const,
    monetaryValue: null
  });
}

export function compileSocialContentEffortEfficiencyReviewV1(
  input: SocialContentEffortEfficiencyReviewInputV1
): SocialContentEffortEfficiencyReviewV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.effortObservations)) throw new Error("effortObservations must be an array");
  if (input.effortObservations.length > SOCIAL_CONTENT_EFFORT_EFFICIENCY_MAX_ITEMS_V1) {
    throw new Error("effortObservations exceed the supported bound");
  }

  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const policy = normalizePolicy(input.policy);
  const performanceReady = validatePerformanceReview(
    input.performanceReview,
    evaluatedAt,
    policy.maxEvidenceAgeHours
  );
  const businessValueReady = validateBusinessValueReview(
    input.businessValueReview,
    evaluatedAt,
    policy.maxEvidenceAgeHours
  );

  const performanceByContent = new Map<string, SocialContentPerformanceItemV1[]>();
  for (const item of input.performanceReview.items) {
    const key = contentKey(item.platform, item.accountId, item.contentId);
    const existing = performanceByContent.get(key) ?? [];
    existing.push(item);
    performanceByContent.set(key, existing);
  }

  const businessByContent = new Map<string, SocialContentBusinessValueReviewItemV1>();
  for (const item of input.businessValueReview.items) {
    const performanceMatches = input.performanceReview.items.filter(
      (candidate) => candidate.platform === item.platform && candidate.contentId === item.contentId
    );
    const accountIds = unique(performanceMatches.map((candidate) => candidate.accountId));
    if (accountIds.length > 1) throw new Error(`business value identity for ${item.contentRef} maps to multiple accountIds`);
    if (accountIds.length === 1) {
      businessByContent.set(contentKey(item.platform, accountIds[0]!, item.contentId), item);
    }
  }

  const seen = new Set<string>();
  const items = input.effortObservations.map((observation, index) => {
    const key = contentKey(
      observation.platform,
      nonEmpty(observation.accountId, `effortObservations[${index}].accountId`),
      nonEmpty(observation.contentId, `effortObservations[${index}].contentId`)
    );
    if (seen.has(key)) throw new Error(`duplicate effort observation for ${observation.platform}:${observation.contentId}`);
    seen.add(key);
    return normalizeObservation(
      observation,
      index,
      policy,
      evaluatedAt,
      performanceReady,
      businessValueReady,
      performanceByContent.get(key) ?? [],
      businessByContent.get(key) ?? null
    );
  });

  const readyItems = items.filter((item) => item.state === "READY");
  const verificationRequired = items.filter((item) => item.state === "VERIFY_REQUIRED");
  const status: SocialContentEffortEfficiencyReviewV1["status"] = !items.length
    ? "NO_EVIDENCE"
    : !readyItems.length
      ? "VERIFY_REQUIRED"
      : verificationRequired.length
        ? "PARTIAL"
        : "READY";

  return deepFreeze({
    contractVersion: SOCIAL_CONTENT_EFFORT_EFFICIENCY_REVIEW_V1_VERSION,
    evaluatedAt,
    status,
    items: items.sort((left, right) => left.contentRef.localeCompare(right.contentRef)),
    lowerEffortWithTrackedBusinessSignal: readyItems.filter((item) =>
      item.signals.includes("LOWER_EFFORT_TRACKED_BUSINESS_SIGNAL")
    ),
    lowerEffortWithOutperformingPlatformSignal: readyItems.filter((item) =>
      item.signals.includes("LOWER_EFFORT_OUTPERFORMING_PLATFORM_SIGNAL")
    ),
    highEffortReview: readyItems.filter((item) => item.effortClass === "HIGHER_THAN_COMPARABLE"),
    verificationRequired,
    evidenceRefs: uniqueRefs(
      items.flatMap((item) => item.evidenceRefs),
      "review.evidenceRefs"
    ),
    limitations: deepFreeze([
      "Production effort is compared only with the explicitly evidenced caller-supplied comparable cohort for the same platform, format, age bucket, and amplification class.",
      "Observed platform performance and tracked business signals are not monetary ROI, causal lift, or proof that production effort caused an outcome.",
      "Metrics are not compared across platforms, and missing business evidence remains NOT_ESTABLISHED rather than zero.",
      "This review cannot recommend publishing, paid amplification, spend, or provider/account changes."
    ]),
    causalClaim: false as const,
    revenueAttributionClaim: false as const,
    monetaryRoiClaim: false as const,
    crossPlatformEfficiencyComparisonAuthority: "NONE" as const,
    recommendationAuthority: "NONE" as const,
    providerWriteAuthority: "NONE" as const,
    notificationAuthority: "NONE" as const,
    postingAuthority: "NONE" as const,
    spendAuthority: "NONE" as const,
    externalAccessPerformed: false as const,
    writesPerformed: false as const
  });
}
