import { SOCIAL_PLATFORMS_V1, type SocialMetricKeyV1, type SocialPlatformV1 } from "./social-canonical-v1";

export const SOCIAL_CONTENT_PERFORMANCE_REVIEW_V1_VERSION = "SocialContentPerformanceReviewV1" as const;
export const SOCIAL_CONTENT_PERFORMANCE_REVIEW_MAX_ITEMS_V1 = 500;

export type SocialContentPerformanceSourceStateV1 = "COMPLETE" | "PARTIAL" | "CONFLICTED" | "MISSING";
export type SocialContentPerformanceAgeBucketV1 = "0_24H" | "1_7D" | "8_30D" | "31_90D" | "90D_PLUS";
export type SocialContentPerformanceAmplificationV1 = "ORGANIC" | "PAID" | "MIXED" | "UNKNOWN";
export type SocialContentPerformanceClassificationV1 = "OUTPERFORMING" | "TYPICAL" | "UNDERPERFORMING";

export type SocialContentPerformanceReasonV1 =
  | "SOURCE_NOT_COMPLETE"
  | "EVIDENCE_FROM_FUTURE"
  | "EVIDENCE_TOO_OLD"
  | "CONTENT_FROM_FUTURE"
  | "COMPARABLE_COHORT_TOO_SMALL"
  | "MISSING_REQUIRED_EVIDENCE";

export type SocialContentPerformancePolicyV1 = Readonly<{
  maxEvidenceAgeHours: number;
  minimumComparableCohortSize: number;
  outperformingRatioAtLeast: number;
  underperformingRatioAtMost: number;
}>;

export type SocialContentPerformanceCandidateInputV1 = Readonly<{
  platform: SocialPlatformV1;
  accountId: string;
  contentId: string;
  publishedAt: string;
  observedAt: string;
  sourceState: SocialContentPerformanceSourceStateV1;
  amplificationType: SocialContentPerformanceAmplificationV1;
  ageBucket: SocialContentPerformanceAgeBucketV1;
  formatKey: string;
  metric: Extract<SocialMetricKeyV1, "REACH" | "VIEWS" | "SAVES" | "SHARES" | "COMMENTS" | "LINK_CLICKS" | "PROFILE_VISITS">;
  metricValue: number;
  audienceAtObservation: number;
  comparableCohortSize: number;
  comparableMedianPerThousandAudience: number;
  contentDnaRef?: string | null;
  metricEvidenceRefs: readonly string[];
  audienceEvidenceRefs: readonly string[];
  comparableCohortEvidenceRefs: readonly string[];
}>;

export type SocialContentPerformanceItemV1 = Readonly<{
  platform: SocialPlatformV1;
  accountId: string;
  contentId: string;
  publishedAt: string;
  observedAt: string;
  sourceState: SocialContentPerformanceSourceStateV1;
  amplificationType: SocialContentPerformanceAmplificationV1;
  ageBucket: SocialContentPerformanceAgeBucketV1;
  formatKey: string;
  metric: SocialContentPerformanceCandidateInputV1["metric"];
  metricValue: number;
  audienceAtObservation: number;
  observedPerThousandAudience: number;
  comparableCohortSize: number;
  comparableMedianPerThousandAudience: number;
  ratioToComparableMedian: number;
  classification: SocialContentPerformanceClassificationV1;
  explanation: string;
  contentDnaRef: string | null;
  evidenceRefs: readonly string[];
}>;

export type SocialContentPerformanceReviewV1 = Readonly<{
  contractVersion: typeof SOCIAL_CONTENT_PERFORMANCE_REVIEW_V1_VERSION;
  evaluatedAt: string;
  status: "READY" | "VERIFY_REQUIRED" | "NO_COMPARABLE_CONTENT";
  reasons: readonly SocialContentPerformanceReasonV1[];
  items: readonly SocialContentPerformanceItemV1[];
  outperformers: readonly SocialContentPerformanceItemV1[];
  underperformers: readonly SocialContentPerformanceItemV1[];
  typical: readonly SocialContentPerformanceItemV1[];
  evidenceRefs: readonly string[];
  interpretation: "WITHIN_PLATFORM_ACCOUNT_AGE_FORMAT_AMPLIFICATION_BASELINE_ONLY";
  causalClaim: false;
  attributionClaim: false;
  competitorPerformanceClaim: false;
  endorsementClaim: false;
  crossPlatformPerformanceComparisonAuthority: "NONE";
  recommendationAuthority: "NONE";
  providerWriteAuthority: "NONE";
  notificationAuthority: "NONE";
  externalAccessPerformed: false;
  writesPerformed: false;
  guardrails: readonly string[];
}>;

export type SocialContentPerformanceReviewInputV1 = Readonly<{
  candidates: readonly SocialContentPerformanceCandidateInputV1[];
  policy: SocialContentPerformancePolicyV1;
  evaluatedAt: string;
}>;

const SUPPORTED_METRICS = new Set<SocialContentPerformanceCandidateInputV1["metric"]>([
  "REACH",
  "VIEWS",
  "SAVES",
  "SHARES",
  "COMMENTS",
  "LINK_CLICKS",
  "PROFILE_VISITS"
]);

const SOURCE_STATES = new Set<SocialContentPerformanceSourceStateV1>(["COMPLETE", "PARTIAL", "CONFLICTED", "MISSING"]);
const AGE_BUCKETS = new Set<SocialContentPerformanceAgeBucketV1>(["0_24H", "1_7D", "8_30D", "31_90D", "90D_PLUS"]);
const AMPLIFICATION_TYPES = new Set<SocialContentPerformanceAmplificationV1>(["ORGANIC", "PAID", "MIXED", "UNKNOWN"]);
const PROHIBITED_RAW_TEXT_KEYS = new Set([
  "caption",
  "captionText",
  "transcript",
  "transcriptText",
  "comment",
  "commentText",
  "rawResponse",
  "rawPayload",
  "providerPayload"
]);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function assertNoRawText(value: unknown, path: string, seen = new Set<object>()): void {
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  if (seen.has(object)) return;
  seen.add(object);
  for (const [key, child] of Object.entries(object)) {
    if (PROHIBITED_RAW_TEXT_KEYS.has(key)) {
      throw new Error(`${path}.${key} is prohibited; retain opaque evidence references instead`);
    }
    assertNoRawText(child, `${path}.${key}`, seen);
  }
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

function finite(value: unknown, field: string, min = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min) {
    throw new Error(`${field} must be a finite number greater than or equal to ${min}`);
  }
  return value;
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

function uniqueRefs(values: readonly string[], field: string): string[] {
  if (!Array.isArray(values)) throw new Error(`${field} must be an array`);
  return [...new Set(values.map((value, index) => nonEmpty(value, `${field}[${index}]`)))].sort((a, b) => a.localeCompare(b));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizePolicy(policy: SocialContentPerformancePolicyV1): SocialContentPerformancePolicyV1 {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) throw new Error("policy must be an object");
  const maxEvidenceAgeHours = positive(policy.maxEvidenceAgeHours, "policy.maxEvidenceAgeHours");
  const minimumComparableCohortSize = positiveInteger(policy.minimumComparableCohortSize, "policy.minimumComparableCohortSize");
  const outperformingRatioAtLeast = positive(policy.outperformingRatioAtLeast, "policy.outperformingRatioAtLeast");
  const underperformingRatioAtMost = finite(policy.underperformingRatioAtMost, "policy.underperformingRatioAtMost");
  if (underperformingRatioAtMost >= outperformingRatioAtLeast) {
    throw new Error("policy.underperformingRatioAtMost must be below policy.outperformingRatioAtLeast");
  }
  return deepFreeze({ maxEvidenceAgeHours, minimumComparableCohortSize, outperformingRatioAtLeast, underperformingRatioAtMost });
}

function classify(ratio: number, policy: SocialContentPerformancePolicyV1): SocialContentPerformanceClassificationV1 {
  if (ratio >= policy.outperformingRatioAtLeast) return "OUTPERFORMING";
  if (ratio <= policy.underperformingRatioAtMost) return "UNDERPERFORMING";
  return "TYPICAL";
}

function explanation(
  candidate: SocialContentPerformanceCandidateInputV1,
  normalizedPerThousand: number,
  ratio: number,
  classification: SocialContentPerformanceClassificationV1
): string {
  const comparison = classification === "OUTPERFORMING" ? "above" : classification === "UNDERPERFORMING" ? "below" : "near";
  return `${candidate.metric} per 1,000 observed audience is ${round(normalizedPerThousand)} versus an evidenced comparable median of ${round(candidate.comparableMedianPerThousandAudience)} (${round(ratio)}x, ${comparison} the caller-owned classification threshold) within the same ${candidate.platform} account, age bucket, format, and amplification class.`;
}

function normalizeCandidate(
  candidate: SocialContentPerformanceCandidateInputV1,
  index: number,
  policy: SocialContentPerformancePolicyV1,
  evaluatedAtMs: number,
  reviewReasons: Set<SocialContentPerformanceReasonV1>
): SocialContentPerformanceItemV1 | null {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error(`candidates[${index}] must be an object`);
  if (!SOCIAL_PLATFORMS_V1.includes(candidate.platform)) throw new Error(`candidates[${index}].platform is unsupported`);
  if (!SOURCE_STATES.has(candidate.sourceState)) throw new Error(`candidates[${index}].sourceState is unsupported`);
  if (!AGE_BUCKETS.has(candidate.ageBucket)) throw new Error(`candidates[${index}].ageBucket is unsupported`);
  if (!AMPLIFICATION_TYPES.has(candidate.amplificationType)) throw new Error(`candidates[${index}].amplificationType is unsupported`);
  if (!SUPPORTED_METRICS.has(candidate.metric)) throw new Error(`candidates[${index}].metric is unsupported`);

  const accountId = nonEmpty(candidate.accountId, `candidates[${index}].accountId`);
  const contentId = nonEmpty(candidate.contentId, `candidates[${index}].contentId`);
  const formatKey = nonEmpty(candidate.formatKey, `candidates[${index}].formatKey`);
  const publishedAt = timestamp(candidate.publishedAt, `candidates[${index}].publishedAt`);
  const observedAt = timestamp(candidate.observedAt, `candidates[${index}].observedAt`);
  const metricValue = finite(candidate.metricValue, `candidates[${index}].metricValue`);
  const audienceAtObservation = positive(candidate.audienceAtObservation, `candidates[${index}].audienceAtObservation`);
  const comparableCohortSize = positiveInteger(candidate.comparableCohortSize, `candidates[${index}].comparableCohortSize`);
  const comparableMedianPerThousandAudience = positive(
    candidate.comparableMedianPerThousandAudience,
    `candidates[${index}].comparableMedianPerThousandAudience`
  );
  const contentDnaRef = candidate.contentDnaRef == null ? null : nonEmpty(candidate.contentDnaRef, `candidates[${index}].contentDnaRef`);
  const metricEvidenceRefs = uniqueRefs(candidate.metricEvidenceRefs, `candidates[${index}].metricEvidenceRefs`);
  const audienceEvidenceRefs = uniqueRefs(candidate.audienceEvidenceRefs, `candidates[${index}].audienceEvidenceRefs`);
  const comparableCohortEvidenceRefs = uniqueRefs(candidate.comparableCohortEvidenceRefs, `candidates[${index}].comparableCohortEvidenceRefs`);

  const itemReasons = new Set<SocialContentPerformanceReasonV1>();
  if (candidate.sourceState !== "COMPLETE") itemReasons.add("SOURCE_NOT_COMPLETE");
  if (!metricEvidenceRefs.length || !audienceEvidenceRefs.length || !comparableCohortEvidenceRefs.length) itemReasons.add("MISSING_REQUIRED_EVIDENCE");
  const publishedAtMs = Date.parse(publishedAt);
  const observedAtMs = Date.parse(observedAt);
  if (publishedAtMs > evaluatedAtMs) itemReasons.add("CONTENT_FROM_FUTURE");
  if (observedAtMs > evaluatedAtMs) itemReasons.add("EVIDENCE_FROM_FUTURE");
  if (observedAtMs < publishedAtMs) throw new Error(`candidates[${index}].observedAt must not precede publishedAt`);
  if (evaluatedAtMs >= observedAtMs && evaluatedAtMs - observedAtMs > policy.maxEvidenceAgeHours * 3_600_000) {
    itemReasons.add("EVIDENCE_TOO_OLD");
  }
  if (comparableCohortSize < policy.minimumComparableCohortSize) itemReasons.add("COMPARABLE_COHORT_TOO_SMALL");

  for (const reason of itemReasons) reviewReasons.add(reason);
  if (itemReasons.size) return null;

  const observedPerThousandAudience = round((metricValue / audienceAtObservation) * 1_000);
  const ratioToComparableMedian = round(observedPerThousandAudience / comparableMedianPerThousandAudience);
  const classification = classify(ratioToComparableMedian, policy);
  return deepFreeze({
    platform: candidate.platform,
    accountId,
    contentId,
    publishedAt,
    observedAt,
    sourceState: candidate.sourceState,
    amplificationType: candidate.amplificationType,
    ageBucket: candidate.ageBucket,
    formatKey,
    metric: candidate.metric,
    metricValue,
    audienceAtObservation,
    observedPerThousandAudience,
    comparableCohortSize,
    comparableMedianPerThousandAudience: round(comparableMedianPerThousandAudience),
    ratioToComparableMedian,
    classification,
    explanation: explanation(candidate, observedPerThousandAudience, ratioToComparableMedian, classification),
    contentDnaRef,
    evidenceRefs: [...new Set([...metricEvidenceRefs, ...audienceEvidenceRefs, ...comparableCohortEvidenceRefs])].sort((a, b) => a.localeCompare(b))
  });
}

function ranked(items: readonly SocialContentPerformanceItemV1[], direction: "HIGH" | "LOW"): SocialContentPerformanceItemV1[] {
  return [...items].sort((left, right) => {
    const difference = direction === "HIGH"
      ? right.ratioToComparableMedian - left.ratioToComparableMedian
      : left.ratioToComparableMedian - right.ratioToComparableMedian;
    if (difference !== 0) return difference;
    return left.platform.localeCompare(right.platform) || left.accountId.localeCompare(right.accountId) || left.contentId.localeCompare(right.contentId);
  });
}

export function compileSocialContentPerformanceReviewV1(
  input: SocialContentPerformanceReviewInputV1
): SocialContentPerformanceReviewV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  assertNoRawText(input, "input");
  if (!Array.isArray(input.candidates)) throw new Error("candidates must be an array");
  if (input.candidates.length > SOCIAL_CONTENT_PERFORMANCE_REVIEW_MAX_ITEMS_V1) throw new Error("candidates exceed the supported bound");

  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const policy = normalizePolicy(input.policy);
  const reasons = new Set<SocialContentPerformanceReasonV1>();
  const items = input.candidates
    .map((candidate, index) => normalizeCandidate(candidate, index, policy, evaluatedAtMs, reasons))
    .filter((item): item is SocialContentPerformanceItemV1 => item !== null);

  const identity = new Set<string>();
  for (const item of items) {
    const key = `${item.platform}\u0000${item.accountId}\u0000${item.contentId}\u0000${item.metric}`;
    if (identity.has(key)) throw new Error(`duplicate comparable content item: ${item.platform}/${item.accountId}/${item.contentId}/${item.metric}`);
    identity.add(key);
  }

  const outperformers = ranked(items.filter((item) => item.classification === "OUTPERFORMING"), "HIGH");
  const underperformers = ranked(items.filter((item) => item.classification === "UNDERPERFORMING"), "LOW");
  const typical = ranked(items.filter((item) => item.classification === "TYPICAL"), "HIGH");
  const normalizedReasons = [...reasons].sort((a, b) => a.localeCompare(b));
  const status = input.candidates.length === 0 || items.length === 0
    ? (normalizedReasons.length ? "VERIFY_REQUIRED" as const : "NO_COMPARABLE_CONTENT" as const)
    : normalizedReasons.length ? "VERIFY_REQUIRED" as const : "READY" as const;

  return deepFreeze({
    contractVersion: SOCIAL_CONTENT_PERFORMANCE_REVIEW_V1_VERSION,
    evaluatedAt,
    status,
    reasons: normalizedReasons,
    items: ranked(items, "HIGH"),
    outperformers,
    underperformers,
    typical,
    evidenceRefs: [...new Set(items.flatMap((item) => item.evidenceRefs))].sort((a, b) => a.localeCompare(b)),
    interpretation: "WITHIN_PLATFORM_ACCOUNT_AGE_FORMAT_AMPLIFICATION_BASELINE_ONLY" as const,
    causalClaim: false as const,
    attributionClaim: false as const,
    competitorPerformanceClaim: false as const,
    endorsementClaim: false as const,
    crossPlatformPerformanceComparisonAuthority: "NONE" as const,
    recommendationAuthority: "NONE" as const,
    providerWriteAuthority: "NONE" as const,
    notificationAuthority: "NONE" as const,
    externalAccessPerformed: false as const,
    writesPerformed: false as const,
    guardrails: [
      "Performance classification compares an observed content metric per 1,000 observed audience only with an evidenced comparable median for the same platform account, age bucket, format, and amplification class.",
      "Different platform metric semantics are never treated as equivalent and this contract authorizes no cross-platform performance ranking.",
      "Observed over- or under-performance does not establish why content performed that way, business attribution, endorsement, competitor performance, future performance, or monetary value.",
      "Content DNA is carried only as an opaque reference for downstream evidence review; this contract does not infer a winning hook, style, subject, or causal creative trait.",
      "This contract authorizes no recommendation execution, posting, provider write, paid amplification, notification, or other external action."
    ]
  });
}
