import type {
  SocialContentPerformanceAgeBucketV1,
  SocialContentPerformanceAmplificationV1,
  SocialContentPerformanceClassificationV1,
  SocialContentPerformanceItemV1,
  SocialContentPerformanceReviewV1
} from "./social-content-performance-review-v1";
import type { SocialMetricKeyV1, SocialPlatformV1 } from "./social-canonical-v1";

export const SOCIAL_CONTENT_PERFORMANCE_DISTRIBUTION_V1_VERSION = "SocialContentPerformanceDistributionV1" as const;
export const SOCIAL_CONTENT_PERFORMANCE_DISTRIBUTION_MAX_GROUPS_V1 = 250;

export type SocialContentPerformanceDistributionStatusV1 =
  | "READY"
  | "PARTIAL"
  | "NO_DISTRIBUTIONS"
  | "VERIFY_REQUIRED";

export type SocialContentPerformanceDistributionReasonV1 =
  | "UPSTREAM_NOT_READY"
  | "REVIEW_FROM_FUTURE"
  | "REVIEW_TOO_OLD"
  | "INSUFFICIENT_GROUP_SIZE";

export type SocialContentPerformanceDistributionPolicyV1 = Readonly<{
  maxReviewAgeHours: number;
  minimumDistributionSize: number;
}>;

export type SocialContentPerformanceDistributionIdentityV1 = Readonly<{
  platform: SocialPlatformV1;
  accountId: string;
  ageBucket: SocialContentPerformanceAgeBucketV1;
  formatKey: string;
  amplificationType: SocialContentPerformanceAmplificationV1;
  metric: Extract<SocialMetricKeyV1, "REACH" | "VIEWS" | "SAVES" | "SHARES" | "COMMENTS" | "LINK_CLICKS" | "PROFILE_VISITS">;
}>;

export type SocialContentPerformanceDistributionGroupV1 = SocialContentPerformanceDistributionIdentityV1 & Readonly<{
  itemCount: number;
  minimumPerThousandAudience: number;
  firstQuartilePerThousandAudience: number;
  medianPerThousandAudience: number;
  thirdQuartilePerThousandAudience: number;
  maximumPerThousandAudience: number;
  interquartileRangePerThousandAudience: number;
  classificationCounts: Readonly<Record<SocialContentPerformanceClassificationV1, number>>;
  evidenceRefs: readonly string[];
  distributionMethod: "LINEAR_INTERPOLATED_QUARTILES";
  valueSemantics: "OBSERVED_METRIC_PER_1000_OBSERVED_AUDIENCE";
}>;

export type SocialContentPerformanceInsufficientGroupV1 = SocialContentPerformanceDistributionIdentityV1 & Readonly<{
  itemCount: number;
  requiredItemCount: number;
  evidenceRefs: readonly string[];
}>;

export type SocialContentPerformanceDistributionV1 = Readonly<{
  contractVersion: typeof SOCIAL_CONTENT_PERFORMANCE_DISTRIBUTION_V1_VERSION;
  generatedAt: string;
  sourceReviewEvaluatedAt: string;
  status: SocialContentPerformanceDistributionStatusV1;
  reasons: readonly SocialContentPerformanceDistributionReasonV1[];
  distributions: readonly SocialContentPerformanceDistributionGroupV1[];
  insufficientGroups: readonly SocialContentPerformanceInsufficientGroupV1[];
  evidenceRefs: readonly string[];
  interpretation: "WITHIN_EXACT_PLATFORM_ACCOUNT_AGE_FORMAT_AMPLIFICATION_METRIC_COHORT_ONLY";
  crossPlatformAggregationPerformed: false;
  crossPlatformPerformanceRankingPerformed: false;
  causalClaim: false;
  attributionClaim: false;
  competitorPerformanceClaim: false;
  endorsementClaim: false;
  relationshipClaim: false;
  confidence: null;
  monetaryValue: null;
  recommendationAuthority: "NONE";
  notificationAuthority: "NONE";
  providerWriteAuthority: "NONE";
  externalAccessPerformed: false;
  writesPerformed: false;
  guardrails: readonly string[];
}>;

export type SocialContentPerformanceDistributionInputV1 = Readonly<{
  review: SocialContentPerformanceReviewV1;
  generatedAt: string;
  policy: SocialContentPerformanceDistributionPolicyV1;
}>;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
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

function finiteNonNegative(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative number`);
  }
  return value;
}

function uniqueRefs(values: readonly string[], field: string): string[] {
  if (!Array.isArray(values)) throw new Error(`${field} must be an array`);
  return [...new Set(values.map((value, index) => nonEmpty(value, `${field}[${index}]`)))].sort((a, b) => a.localeCompare(b));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizePolicy(policy: SocialContentPerformanceDistributionPolicyV1): SocialContentPerformanceDistributionPolicyV1 {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) throw new Error("policy must be an object");
  const maxReviewAgeHours = positive(policy.maxReviewAgeHours, "policy.maxReviewAgeHours");
  const minimumDistributionSize = positiveInteger(policy.minimumDistributionSize, "policy.minimumDistributionSize");
  if (minimumDistributionSize < 3) throw new Error("policy.minimumDistributionSize must be at least 3");
  return deepFreeze({ maxReviewAgeHours, minimumDistributionSize });
}

function assertUpstreamAuthority(review: SocialContentPerformanceReviewV1): void {
  if (!review || typeof review !== "object" || Array.isArray(review)) throw new Error("review must be an object");
  if (review.contractVersion !== "SocialContentPerformanceReviewV1") throw new Error("review contractVersion is invalid");
  if (
    review.interpretation !== "WITHIN_PLATFORM_ACCOUNT_AGE_FORMAT_AMPLIFICATION_BASELINE_ONLY" ||
    review.causalClaim !== false ||
    review.attributionClaim !== false ||
    review.competitorPerformanceClaim !== false ||
    review.endorsementClaim !== false ||
    review.crossPlatformPerformanceComparisonAuthority !== "NONE" ||
    review.recommendationAuthority !== "NONE" ||
    review.providerWriteAuthority !== "NONE" ||
    review.notificationAuthority !== "NONE" ||
    review.externalAccessPerformed !== false ||
    review.writesPerformed !== false
  ) {
    throw new Error("review widens interpretation or action authority");
  }
}

function identityFor(item: SocialContentPerformanceItemV1): SocialContentPerformanceDistributionIdentityV1 {
  return {
    platform: item.platform,
    accountId: nonEmpty(item.accountId, "item.accountId"),
    ageBucket: item.ageBucket,
    formatKey: nonEmpty(item.formatKey, "item.formatKey"),
    amplificationType: item.amplificationType,
    metric: item.metric
  };
}

function groupKey(identity: SocialContentPerformanceDistributionIdentityV1): string {
  return [
    identity.platform,
    identity.accountId,
    identity.ageBucket,
    identity.formatKey,
    identity.amplificationType,
    identity.metric
  ].join("\u0000");
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (!sorted.length) throw new Error("cannot calculate percentile for an empty distribution");
  if (sorted.length === 1) return sorted[0] ?? 0;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  if (lower === upper) return round(lowerValue);
  return round(lowerValue + (upperValue - lowerValue) * (position - lower));
}

function compareIdentity(
  left: SocialContentPerformanceDistributionIdentityV1,
  right: SocialContentPerformanceDistributionIdentityV1
): number {
  return left.platform.localeCompare(right.platform) ||
    left.accountId.localeCompare(right.accountId) ||
    left.metric.localeCompare(right.metric) ||
    left.ageBucket.localeCompare(right.ageBucket) ||
    left.formatKey.localeCompare(right.formatKey) ||
    left.amplificationType.localeCompare(right.amplificationType);
}

function validateItems(items: readonly SocialContentPerformanceItemV1[], generatedAtMs: number): void {
  if (!Array.isArray(items)) throw new Error("review.items must be an array");
  const identities = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`review.items[${index}] must be an object`);
    if (item.sourceState !== "COMPLETE") throw new Error(`review.items[${index}] is not complete source evidence`);
    const observedAt = timestamp(item.observedAt, `review.items[${index}].observedAt`);
    if (Date.parse(observedAt) > generatedAtMs) throw new Error(`review.items[${index}].observedAt cannot be in the future`);
    finiteNonNegative(item.observedPerThousandAudience, `review.items[${index}].observedPerThousandAudience`);
    if (!uniqueRefs(item.evidenceRefs, `review.items[${index}].evidenceRefs`).length) {
      throw new Error(`review.items[${index}].evidenceRefs must contain evidence`);
    }
    const identity = identityFor(item);
    const contentId = nonEmpty(item.contentId, `review.items[${index}].contentId`);
    const exactItemKey = `${groupKey(identity)}\u0000${contentId}`;
    if (identities.has(exactItemKey)) throw new Error(`duplicate distribution item: ${contentId}`);
    identities.add(exactItemKey);
  }
}

export function compileSocialContentPerformanceDistributionV1(
  input: SocialContentPerformanceDistributionInputV1
): SocialContentPerformanceDistributionV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  assertUpstreamAuthority(input.review);
  const policy = normalizePolicy(input.policy);
  const generatedAt = timestamp(input.generatedAt, "generatedAt");
  const generatedAtMs = Date.parse(generatedAt);
  const sourceReviewEvaluatedAt = timestamp(input.review.evaluatedAt, "review.evaluatedAt");
  const sourceReviewEvaluatedAtMs = Date.parse(sourceReviewEvaluatedAt);

  const reasons = new Set<SocialContentPerformanceDistributionReasonV1>();
  if (input.review.status !== "READY") reasons.add("UPSTREAM_NOT_READY");
  if (sourceReviewEvaluatedAtMs > generatedAtMs) reasons.add("REVIEW_FROM_FUTURE");
  if (generatedAtMs >= sourceReviewEvaluatedAtMs && generatedAtMs - sourceReviewEvaluatedAtMs > policy.maxReviewAgeHours * 3_600_000) {
    reasons.add("REVIEW_TOO_OLD");
  }

  const hardBlock = reasons.has("UPSTREAM_NOT_READY") || reasons.has("REVIEW_FROM_FUTURE") || reasons.has("REVIEW_TOO_OLD");
  if (hardBlock) {
    return deepFreeze({
      contractVersion: SOCIAL_CONTENT_PERFORMANCE_DISTRIBUTION_V1_VERSION,
      generatedAt,
      sourceReviewEvaluatedAt,
      status: "VERIFY_REQUIRED" as const,
      reasons: [...reasons].sort((a, b) => a.localeCompare(b)),
      distributions: [],
      insufficientGroups: [],
      evidenceRefs: [],
      interpretation: "WITHIN_EXACT_PLATFORM_ACCOUNT_AGE_FORMAT_AMPLIFICATION_METRIC_COHORT_ONLY" as const,
      crossPlatformAggregationPerformed: false as const,
      crossPlatformPerformanceRankingPerformed: false as const,
      causalClaim: false as const,
      attributionClaim: false as const,
      competitorPerformanceClaim: false as const,
      endorsementClaim: false as const,
      relationshipClaim: false as const,
      confidence: null,
      monetaryValue: null,
      recommendationAuthority: "NONE" as const,
      notificationAuthority: "NONE" as const,
      providerWriteAuthority: "NONE" as const,
      externalAccessPerformed: false as const,
      writesPerformed: false as const,
      guardrails: [
        "Distributions require a current READY SocialContentPerformanceReviewV1 and never promote partial, stale, or future evidence.",
        "Content is grouped only by exact platform, account, age bucket, format, amplification type, and metric before quartiles are calculated.",
        "No distribution establishes causality, attribution, confidence, monetary value, competitor performance, endorsement, relationship, or future performance.",
        "This contract authorizes no recommendation execution, notification, posting, provider write, paid amplification, or external action."
      ]
    });
  }

  validateItems(input.review.items, generatedAtMs);

  const groups = new Map<string, { identity: SocialContentPerformanceDistributionIdentityV1; items: SocialContentPerformanceItemV1[] }>();
  for (const item of input.review.items) {
    const identity = identityFor(item);
    const key = groupKey(identity);
    const group = groups.get(key) ?? { identity, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  if (groups.size > SOCIAL_CONTENT_PERFORMANCE_DISTRIBUTION_MAX_GROUPS_V1) throw new Error("distribution groups exceed the supported bound");

  const distributions: SocialContentPerformanceDistributionGroupV1[] = [];
  const insufficientGroups: SocialContentPerformanceInsufficientGroupV1[] = [];

  for (const group of groups.values()) {
    const evidenceRefs = [...new Set(group.items.flatMap((item) => uniqueRefs(item.evidenceRefs, "item.evidenceRefs")))].sort((a, b) => a.localeCompare(b));
    if (group.items.length < policy.minimumDistributionSize) {
      reasons.add("INSUFFICIENT_GROUP_SIZE");
      insufficientGroups.push(deepFreeze({
        ...group.identity,
        itemCount: group.items.length,
        requiredItemCount: policy.minimumDistributionSize,
        evidenceRefs
      }));
      continue;
    }

    const values = group.items.map((item) => item.observedPerThousandAudience).sort((a, b) => a - b);
    const firstQuartile = percentile(values, 0.25);
    const median = percentile(values, 0.5);
    const thirdQuartile = percentile(values, 0.75);
    const classificationCounts: Record<SocialContentPerformanceClassificationV1, number> = {
      OUTPERFORMING: 0,
      TYPICAL: 0,
      UNDERPERFORMING: 0
    };
    for (const item of group.items) classificationCounts[item.classification] += 1;

    distributions.push(deepFreeze({
      ...group.identity,
      itemCount: group.items.length,
      minimumPerThousandAudience: round(values[0] ?? 0),
      firstQuartilePerThousandAudience: firstQuartile,
      medianPerThousandAudience: median,
      thirdQuartilePerThousandAudience: thirdQuartile,
      maximumPerThousandAudience: round(values[values.length - 1] ?? 0),
      interquartileRangePerThousandAudience: round(thirdQuartile - firstQuartile),
      classificationCounts: deepFreeze(classificationCounts),
      evidenceRefs,
      distributionMethod: "LINEAR_INTERPOLATED_QUARTILES" as const,
      valueSemantics: "OBSERVED_METRIC_PER_1000_OBSERVED_AUDIENCE" as const
    }));
  }

  distributions.sort(compareIdentity);
  insufficientGroups.sort(compareIdentity);
  const normalizedReasons = [...reasons].sort((a, b) => a.localeCompare(b));
  const status: SocialContentPerformanceDistributionStatusV1 = distributions.length === 0
    ? "NO_DISTRIBUTIONS"
    : insufficientGroups.length
      ? "PARTIAL"
      : "READY";

  return deepFreeze({
    contractVersion: SOCIAL_CONTENT_PERFORMANCE_DISTRIBUTION_V1_VERSION,
    generatedAt,
    sourceReviewEvaluatedAt,
    status,
    reasons: normalizedReasons,
    distributions,
    insufficientGroups,
    evidenceRefs: [...new Set(distributions.flatMap((group) => group.evidenceRefs))].sort((a, b) => a.localeCompare(b)),
    interpretation: "WITHIN_EXACT_PLATFORM_ACCOUNT_AGE_FORMAT_AMPLIFICATION_METRIC_COHORT_ONLY" as const,
    crossPlatformAggregationPerformed: false as const,
    crossPlatformPerformanceRankingPerformed: false as const,
    causalClaim: false as const,
    attributionClaim: false as const,
    competitorPerformanceClaim: false as const,
    endorsementClaim: false as const,
    relationshipClaim: false as const,
    confidence: null,
    monetaryValue: null,
    recommendationAuthority: "NONE" as const,
    notificationAuthority: "NONE" as const,
    providerWriteAuthority: "NONE" as const,
    externalAccessPerformed: false as const,
    writesPerformed: false as const,
    guardrails: [
      "Distributions require a current READY SocialContentPerformanceReviewV1 and never promote partial, stale, or future evidence.",
      "Content is grouped only by exact platform, account, age bucket, format, amplification type, and metric before quartiles are calculated.",
      "Quartiles summarize observed normalized values; they do not make unlike platform metrics comparable or identify a universal content winner.",
      "No distribution establishes causality, attribution, confidence, monetary value, competitor performance, endorsement, relationship, or future performance.",
      "This contract authorizes no recommendation execution, notification, posting, provider write, paid amplification, or external action."
    ]
  });
}
