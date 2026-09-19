import type {
  CanonicalSocialAccountSnapshotV1,
  CanonicalSocialContentV1,
  SocialMetricKeyV1,
  SocialPlatformV1
} from "./social-canonical-v1";
import {
  SOCIAL_CONTENT_PERFORMANCE_REVIEW_V1_VERSION,
  type SocialContentPerformanceItemV1,
  type SocialContentPerformanceReviewV1
} from "./social-content-performance-review-v1";

export const SOCIAL_CONTENT_FATIGUE_REVIEW_V1_VERSION = "SocialContentFatigueReviewV1" as const;
export const SOCIAL_CONTENT_FATIGUE_MAX_SNAPSHOTS_V1 = 20;

export type SocialContentFatigueDimensionV1 =
  | "FORMAT"
  | "SUBJECT"
  | "PROJECT"
  | "THEME"
  | "HOOK"
  | "COLLABORATION";

export type SocialContentFatigueReasonV1 =
  | "UPSTREAM_REVIEW_NOT_READY"
  | "UPSTREAM_REVIEW_FROM_FUTURE"
  | "UPSTREAM_REVIEW_TOO_OLD"
  | "UPSTREAM_AUTHORITY_WIDENED"
  | "SNAPSHOT_NOT_DECISION_GRADE"
  | "SNAPSHOT_FROM_FUTURE"
  | "SNAPSHOT_TOO_OLD"
  | "CONTENT_BINDING_MISMATCH"
  | "EVIDENCE_BINDING_MISMATCH"
  | "INSUFFICIENT_REPEATED_CONTENT";

export type SocialContentFatigueClassificationV1 =
  | "FATIGUE_REVIEW_CANDIDATE"
  | "NO_MATERIAL_DECLINE"
  | "UNRESOLVED_ZERO_PRIOR_BASELINE";

export type SocialContentFatiguePolicyV1 = Readonly<{
  maxReviewAgeHours: number;
  maxSnapshotAgeHours: number;
  minimumItemsPerWindow: number;
  minimumRecentItemsBelowPriorMedian: number;
  recentToPriorMedianRatioAtMost: number;
  maximumPriorToRecentGapDays: number;
}>;

export type SocialContentFatigueWindowV1 = Readonly<{
  contentIds: readonly string[];
  startPublishedAt: string;
  endPublishedAt: string;
  medianRatioToComparableBaseline: number;
}>;

export type SocialContentFatiguePatternV1 = Readonly<{
  platform: SocialPlatformV1;
  accountId: string;
  dimension: SocialContentFatigueDimensionV1;
  value: string;
  metric: SocialMetricKeyV1;
  amplificationType: SocialContentPerformanceItemV1["amplificationType"];
  ageBucket: SocialContentPerformanceItemV1["ageBucket"];
  formatKey: string;
  prior: SocialContentFatigueWindowV1;
  recent: SocialContentFatigueWindowV1;
  recentToPriorMedianRatio: number | null;
  recentItemsBelowPriorMedian: number;
  classification: SocialContentFatigueClassificationV1;
  alertReviewCandidate: boolean;
  evidenceRefs: readonly string[];
  causalClaim: false;
  attributionClaim: false;
  competitorPerformanceClaim: false;
  endorsementClaim: false;
  relationshipClaim: false;
  confidence: null;
  expectedPerformance: null;
}>;

export type SocialContentFatigueReviewInputV1 = Readonly<{
  generatedAt: string;
  performanceReview: SocialContentPerformanceReviewV1;
  snapshots: readonly CanonicalSocialAccountSnapshotV1[];
  dimensions: readonly SocialContentFatigueDimensionV1[];
  policy: SocialContentFatiguePolicyV1;
}>;

export type SocialContentFatigueReviewV1 = Readonly<{
  contractVersion: typeof SOCIAL_CONTENT_FATIGUE_REVIEW_V1_VERSION;
  generatedAt: string;
  status: "READY" | "VERIFY_REQUIRED" | "INSUFFICIENT_EVIDENCE";
  reasons: readonly SocialContentFatigueReasonV1[];
  patterns: readonly SocialContentFatiguePatternV1[];
  candidates: readonly SocialContentFatiguePatternV1[];
  evidenceRefs: readonly string[];
  notificationAuthority: "NONE";
  recommendationAuthority: "NONE";
  postingAuthority: "NONE";
  providerWriteAuthority: "NONE";
  externalAccessPerformed: false;
  writesPerformed: false;
  guardrails: readonly string[];
}>;

type BoundItem = Readonly<{
  performance: SocialContentPerformanceItemV1;
  content: CanonicalSocialContentV1;
}>;

type Group = {
  platform: SocialPlatformV1;
  accountId: string;
  dimension: SocialContentFatigueDimensionV1;
  value: string;
  metric: SocialMetricKeyV1;
  amplificationType: SocialContentPerformanceItemV1["amplificationType"];
  ageBucket: SocialContentPerformanceItemV1["ageBucket"];
  formatKey: string;
  items: BoundItem[];
};

const SUPPORTED_DIMENSIONS = new Set<SocialContentFatigueDimensionV1>([
  "FORMAT",
  "SUBJECT",
  "PROJECT",
  "THEME",
  "HOOK",
  "COLLABORATION"
]);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function requireIso(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty timestamp`);
  const parsed = Date.parse(value);
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

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(ordered.length / 2);
  if (ordered.length % 2) return ordered[midpoint]!;
  return (ordered[midpoint - 1]! + ordered[midpoint]!) / 2;
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function dimensionValue(content: CanonicalSocialContentV1, dimension: SocialContentFatigueDimensionV1): string | null {
  switch (dimension) {
    case "FORMAT": return content.format;
    case "SUBJECT": return content.subject;
    case "PROJECT": return content.project;
    case "THEME": return content.theme;
    case "HOOK": return content.hook;
    case "COLLABORATION": return content.collaborationContext;
  }
}

function normalizePolicy(policy: SocialContentFatiguePolicyV1): SocialContentFatiguePolicyV1 {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) throw new Error("policy must be an object");
  const maxReviewAgeHours = positive(policy.maxReviewAgeHours, "policy.maxReviewAgeHours");
  const maxSnapshotAgeHours = positive(policy.maxSnapshotAgeHours, "policy.maxSnapshotAgeHours");
  const minimumItemsPerWindow = positiveInteger(policy.minimumItemsPerWindow, "policy.minimumItemsPerWindow");
  if (minimumItemsPerWindow < 2) throw new Error("policy.minimumItemsPerWindow must be at least 2");
  const minimumRecentItemsBelowPriorMedian = positiveInteger(
    policy.minimumRecentItemsBelowPriorMedian,
    "policy.minimumRecentItemsBelowPriorMedian"
  );
  if (minimumRecentItemsBelowPriorMedian > minimumItemsPerWindow) {
    throw new Error("policy.minimumRecentItemsBelowPriorMedian cannot exceed minimumItemsPerWindow");
  }
  const recentToPriorMedianRatioAtMost = positive(
    policy.recentToPriorMedianRatioAtMost,
    "policy.recentToPriorMedianRatioAtMost"
  );
  if (recentToPriorMedianRatioAtMost >= 1) {
    throw new Error("policy.recentToPriorMedianRatioAtMost must be below 1");
  }
  const maximumPriorToRecentGapDays = positive(policy.maximumPriorToRecentGapDays, "policy.maximumPriorToRecentGapDays");
  return deepFreeze({
    maxReviewAgeHours,
    maxSnapshotAgeHours,
    minimumItemsPerWindow,
    minimumRecentItemsBelowPriorMedian,
    recentToPriorMedianRatioAtMost,
    maximumPriorToRecentGapDays
  });
}

function upstreamAuthorityIsNarrow(review: SocialContentPerformanceReviewV1): boolean {
  return review.contractVersion === SOCIAL_CONTENT_PERFORMANCE_REVIEW_V1_VERSION &&
    review.causalClaim === false &&
    review.attributionClaim === false &&
    review.competitorPerformanceClaim === false &&
    review.endorsementClaim === false &&
    review.crossPlatformPerformanceComparisonAuthority === "NONE" &&
    review.recommendationAuthority === "NONE" &&
    review.providerWriteAuthority === "NONE" &&
    review.notificationAuthority === "NONE" &&
    review.externalAccessPerformed === false &&
    review.writesPerformed === false;
}

function decisionGradeSnapshot(
  snapshot: CanonicalSocialAccountSnapshotV1,
  generatedAtMs: number,
  policy: SocialContentFatiguePolicyV1,
  reasons: Set<SocialContentFatigueReasonV1>
): boolean {
  if (snapshot.contractVersion !== "CanonicalSocialAccountSnapshotV1" ||
      snapshot.sourceCoverage.effectiveState !== "CONNECTED_AND_INGESTING" ||
      snapshot.sourceCoverage.freshness !== "FRESH" ||
      snapshot.externalAccessPerformed !== false ||
      snapshot.writesPerformed !== false) {
    reasons.add("SNAPSHOT_NOT_DECISION_GRADE");
    return false;
  }
  const retrievedAtMs = Date.parse(snapshot.retrievedAt);
  if (!Number.isFinite(retrievedAtMs)) {
    reasons.add("SNAPSHOT_NOT_DECISION_GRADE");
    return false;
  }
  if (retrievedAtMs > generatedAtMs) {
    reasons.add("SNAPSHOT_FROM_FUTURE");
    return false;
  }
  if (generatedAtMs - retrievedAtMs > policy.maxSnapshotAgeHours * 3_600_000) {
    reasons.add("SNAPSHOT_TOO_OLD");
    return false;
  }
  return true;
}

function bindItems(
  review: SocialContentPerformanceReviewV1,
  snapshots: readonly CanonicalSocialAccountSnapshotV1[],
  generatedAtMs: number,
  policy: SocialContentFatiguePolicyV1,
  reasons: Set<SocialContentFatigueReasonV1>
): BoundItem[] {
  const snapshotsByAccount = new Map<string, CanonicalSocialAccountSnapshotV1>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.platform}\u0000${snapshot.accountId}`;
    if (snapshotsByAccount.has(key)) throw new Error(`duplicate social snapshot identity: ${snapshot.platform}/${snapshot.accountId}`);
    snapshotsByAccount.set(key, snapshot);
  }

  const relevantKeys = new Set(review.items.map((item) => `${item.platform}\u0000${item.accountId}`));
  for (const key of relevantKeys) {
    const snapshot = snapshotsByAccount.get(key);
    if (!snapshot) {
      reasons.add("CONTENT_BINDING_MISMATCH");
      continue;
    }
    decisionGradeSnapshot(snapshot, generatedAtMs, policy, reasons);
  }
  if (reasons.size) return [];

  const bound: BoundItem[] = [];
  for (const item of review.items) {
    const snapshot = snapshotsByAccount.get(`${item.platform}\u0000${item.accountId}`)!;
    const content = snapshot.content.find((row) => row.contentId === item.contentId);
    if (!content ||
        content.publishedAt !== item.publishedAt ||
        !content.format ||
        normalizeText(content.format) !== normalizeText(item.formatKey)) {
      reasons.add("CONTENT_BINDING_MISMATCH");
      continue;
    }
    const snapshotEvidence = new Set(snapshot.evidenceRefs);
    if (!item.evidenceRefs.some((ref) => snapshotEvidence.has(ref))) {
      reasons.add("EVIDENCE_BINDING_MISMATCH");
      continue;
    }
    bound.push(deepFreeze({ performance: item, content }));
  }
  return reasons.size ? [] : bound;
}

function groupItems(bound: readonly BoundItem[], dimensions: readonly SocialContentFatigueDimensionV1[]): Group[] {
  const groups = new Map<string, Group>();
  for (const item of bound) {
    for (const dimension of dimensions) {
      const rawValue = dimensionValue(item.content, dimension)?.trim();
      if (!rawValue) continue;
      const performance = item.performance;
      const key = [
        performance.platform,
        performance.accountId,
        performance.metric,
        performance.amplificationType,
        performance.ageBucket,
        normalizeText(performance.formatKey),
        dimension,
        normalizeText(rawValue)
      ].join("\u0000");
      const existing = groups.get(key);
      if (existing) existing.items.push(item);
      else groups.set(key, {
        platform: performance.platform,
        accountId: performance.accountId,
        dimension,
        value: rawValue,
        metric: performance.metric,
        amplificationType: performance.amplificationType,
        ageBucket: performance.ageBucket,
        formatKey: performance.formatKey,
        items: [item]
      });
    }
  }
  return [...groups.values()].sort((a, b) =>
    a.platform.localeCompare(b.platform) ||
    a.accountId.localeCompare(b.accountId) ||
    a.dimension.localeCompare(b.dimension) ||
    normalizeText(a.value).localeCompare(normalizeText(b.value)) ||
    a.metric.localeCompare(b.metric) ||
    a.amplificationType.localeCompare(b.amplificationType) ||
    a.ageBucket.localeCompare(b.ageBucket) ||
    a.formatKey.localeCompare(b.formatKey)
  );
}

function window(items: readonly BoundItem[]): SocialContentFatigueWindowV1 {
  const ordered = [...items].sort((a, b) =>
    Date.parse(a.performance.publishedAt) - Date.parse(b.performance.publishedAt) ||
    a.performance.contentId.localeCompare(b.performance.contentId)
  );
  return deepFreeze({
    contentIds: ordered.map((item) => item.performance.contentId),
    startPublishedAt: ordered[0]!.performance.publishedAt,
    endPublishedAt: ordered.at(-1)!.performance.publishedAt,
    medianRatioToComparableBaseline: round(median(ordered.map((item) => item.performance.ratioToComparableMedian)))
  });
}

function evaluateGroup(group: Group, policy: SocialContentFatiguePolicyV1): SocialContentFatiguePatternV1 | null {
  const needed = policy.minimumItemsPerWindow * 2;
  if (group.items.length < needed) return null;
  const ordered = [...group.items].sort((a, b) =>
    Date.parse(a.performance.publishedAt) - Date.parse(b.performance.publishedAt) ||
    a.performance.contentId.localeCompare(b.performance.contentId)
  );
  const selected = ordered.slice(-needed);
  const priorItems = selected.slice(0, policy.minimumItemsPerWindow);
  const recentItems = selected.slice(policy.minimumItemsPerWindow);
  const gapMs = Date.parse(recentItems[0]!.performance.publishedAt) - Date.parse(priorItems.at(-1)!.performance.publishedAt);
  if (gapMs < 0 || gapMs > policy.maximumPriorToRecentGapDays * 86_400_000) return null;

  const prior = window(priorItems);
  const recent = window(recentItems);
  const priorMedian = prior.medianRatioToComparableBaseline;
  const recentMedian = recent.medianRatioToComparableBaseline;
  const recentToPriorMedianRatio = priorMedian === 0 ? null : round(recentMedian / priorMedian);
  const recentItemsBelowPriorMedian = recentItems.filter(
    (item) => item.performance.ratioToComparableMedian < priorMedian
  ).length;
  const classification: SocialContentFatigueClassificationV1 = priorMedian === 0
    ? "UNRESOLVED_ZERO_PRIOR_BASELINE"
    : recentToPriorMedianRatio! <= policy.recentToPriorMedianRatioAtMost &&
        recentItemsBelowPriorMedian >= policy.minimumRecentItemsBelowPriorMedian
      ? "FATIGUE_REVIEW_CANDIDATE"
      : "NO_MATERIAL_DECLINE";

  return deepFreeze({
    platform: group.platform,
    accountId: group.accountId,
    dimension: group.dimension,
    value: group.value,
    metric: group.metric,
    amplificationType: group.amplificationType,
    ageBucket: group.ageBucket,
    formatKey: group.formatKey,
    prior,
    recent,
    recentToPriorMedianRatio,
    recentItemsBelowPriorMedian,
    classification,
    alertReviewCandidate: classification === "FATIGUE_REVIEW_CANDIDATE",
    evidenceRefs: unique(selected.flatMap((item) => item.performance.evidenceRefs)),
    causalClaim: false as const,
    attributionClaim: false as const,
    competitorPerformanceClaim: false as const,
    endorsementClaim: false as const,
    relationshipClaim: false as const,
    confidence: null,
    expectedPerformance: null
  });
}

export function compileSocialContentFatigueReviewV1(
  input: SocialContentFatigueReviewInputV1
): SocialContentFatigueReviewV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.snapshots)) throw new Error("snapshots must be an array");
  if (input.snapshots.length > SOCIAL_CONTENT_FATIGUE_MAX_SNAPSHOTS_V1) {
    throw new Error(`at most ${SOCIAL_CONTENT_FATIGUE_MAX_SNAPSHOTS_V1} snapshots are allowed`);
  }
  if (!Array.isArray(input.dimensions) || !input.dimensions.length) throw new Error("dimensions must be a non-empty array");
  const dimensions = unique(input.dimensions).map((dimension) => {
    if (!SUPPORTED_DIMENSIONS.has(dimension as SocialContentFatigueDimensionV1)) throw new Error(`unsupported fatigue dimension: ${dimension}`);
    return dimension as SocialContentFatigueDimensionV1;
  });
  const policy = normalizePolicy(input.policy);
  const generatedAt = requireIso(input.generatedAt, "generatedAt");
  const generatedAtMs = Date.parse(generatedAt);
  const reasons = new Set<SocialContentFatigueReasonV1>();

  if (input.performanceReview.status !== "READY") reasons.add("UPSTREAM_REVIEW_NOT_READY");
  if (!upstreamAuthorityIsNarrow(input.performanceReview)) reasons.add("UPSTREAM_AUTHORITY_WIDENED");
  const reviewAtMs = Date.parse(input.performanceReview.evaluatedAt);
  if (!Number.isFinite(reviewAtMs) || reviewAtMs > generatedAtMs) reasons.add("UPSTREAM_REVIEW_FROM_FUTURE");
  else if (generatedAtMs - reviewAtMs > policy.maxReviewAgeHours * 3_600_000) reasons.add("UPSTREAM_REVIEW_TOO_OLD");

  let bound: BoundItem[] = [];
  if (!reasons.size) {
    bound = bindItems(input.performanceReview, input.snapshots, generatedAtMs, policy, reasons);
  }

  if (reasons.size) {
    return deepFreeze({
      contractVersion: SOCIAL_CONTENT_FATIGUE_REVIEW_V1_VERSION,
      generatedAt,
      status: "VERIFY_REQUIRED" as const,
      reasons: [...reasons].sort((a, b) => a.localeCompare(b)),
      patterns: [],
      candidates: [],
      evidenceRefs: [],
      notificationAuthority: "NONE" as const,
      recommendationAuthority: "NONE" as const,
      postingAuthority: "NONE" as const,
      providerWriteAuthority: "NONE" as const,
      externalAccessPerformed: false as const,
      writesPerformed: false as const,
      guardrails: [
        "Repeated normalized decline is a review signal only and does not prove creative fatigue or any causal mechanism.",
        "Patterns are evaluated only within exact platform, account, metric, amplification, age-bucket, format, and canonical content-dimension identity.",
        "This contract authorizes no recommendation execution, notification, posting, paid amplification, provider write, or other external action."
      ]
    });
  }

  const patterns = groupItems(bound, dimensions)
    .map((group) => evaluateGroup(group, policy))
    .filter((pattern): pattern is SocialContentFatiguePatternV1 => pattern !== null);
  if (!patterns.length) reasons.add("INSUFFICIENT_REPEATED_CONTENT");
  const candidates = patterns.filter((pattern) => pattern.classification === "FATIGUE_REVIEW_CANDIDATE");

  return deepFreeze({
    contractVersion: SOCIAL_CONTENT_FATIGUE_REVIEW_V1_VERSION,
    generatedAt,
    status: patterns.length ? "READY" as const : "INSUFFICIENT_EVIDENCE" as const,
    reasons: [...reasons].sort((a, b) => a.localeCompare(b)),
    patterns,
    candidates,
    evidenceRefs: unique(patterns.flatMap((pattern) => pattern.evidenceRefs)),
    notificationAuthority: "NONE" as const,
    recommendationAuthority: "NONE" as const,
    postingAuthority: "NONE" as const,
    providerWriteAuthority: "NONE" as const,
    externalAccessPerformed: false as const,
    writesPerformed: false as const,
    guardrails: [
      "Repeated normalized decline is a review signal only and does not prove creative fatigue, audience saturation, algorithmic suppression, or any other causal mechanism.",
      "Patterns are evaluated only within exact platform, account, metric, amplification, age-bucket, format, and canonical content-dimension identity.",
      "No cross-platform performance equivalence, attribution, confidence, expected performance, competitor performance, endorsement, or relationship is inferred.",
      "This contract authorizes no recommendation execution, notification, posting, paid amplification, provider write, or other external action."
    ]
  });
}
