import type {
  SocialContentBusinessValueReviewItemV1,
  SocialContentBusinessValueReviewV1
} from "./social-content-business-value-review-v1";
import type {
  SocialContentPerformanceItemV1,
  SocialContentPerformanceReviewV1
} from "./social-content-performance-review-v1";
import type { SocialMetricKeyV1, SocialPlatformV1 } from "./social-canonical-v1";

export const SOCIAL_PAID_SUPPORT_CANDIDATE_REVIEW_V1_VERSION = "SocialPaidSupportCandidateReviewV1" as const;
export const SOCIAL_PAID_SUPPORT_CANDIDATE_REVIEW_MAX_ITEMS_V1 = 500;

export type SocialPaidSupportEvidenceTierV1 =
  | "DIRECT_TRACKED_BUSINESS_SIGNAL"
  | "HIGH_INTENT_PLATFORM_SIGNAL";

export type SocialPaidSupportExclusionReasonV1 =
  | "NON_ORGANIC_OR_CONFLICTED_AMPLIFICATION"
  | "SUPPORTED_ASSOCIATION_ONLY"
  | "NO_QUALIFYING_BUSINESS_OR_HIGH_INTENT_SIGNAL"
  | "BELOW_CALLER_OWNED_SIGNAL_THRESHOLD";

export type SocialPaidSupportCandidatePolicyV1 = Readonly<{
  maxPerformanceAgeHours: number;
  maxBusinessValueAgeHours: number;
  minimumDirectTrackedOutcomeCount: number;
  minimumOutperformingHighIntentMetrics: number;
}>;

export type SocialPaidSupportCandidateItemV1 = Readonly<{
  contentRef: string;
  platform: SocialPlatformV1;
  accountId: string;
  contentId: string;
  amplificationState: "ORGANIC" | "NON_ORGANIC_OR_CONFLICTED";
  disposition: "PAID_SUPPORT_REVIEW_CANDIDATE" | "NOT_CANDIDATE";
  evidenceTier: SocialPaidSupportEvidenceTierV1 | null;
  exclusionReasons: readonly SocialPaidSupportExclusionReasonV1[];
  businessValueState: SocialContentBusinessValueReviewItemV1["businessValueState"];
  directTrackedOutcomeCount: number;
  linkedOutcomeCount: number;
  outperformingHighIntentMetrics: readonly Extract<SocialMetricKeyV1, "LINK_CLICKS" | "PROFILE_VISITS" | "SAVES">[];
  performanceEvidenceRefs: readonly string[];
  outcomeEvidenceRefs: readonly string[];
  interpretation: string;
  expectedLift: null;
  confidence: null;
  causalClaim: false;
  revenueAttributionClaim: false;
  monetaryValue: null;
  competitorPerformanceClaim: false;
  endorsementClaim: false;
  relationshipClaim: false;
  paidMediaExecutionAuthority: "NONE";
  providerWriteAuthority: "NONE";
  notificationAuthority: "NONE";
  humanApprovalRequiredBeforePaidMediaExecution: true;
}>;

export type SocialPaidSupportCandidateReviewV1 = Readonly<{
  contractVersion: typeof SOCIAL_PAID_SUPPORT_CANDIDATE_REVIEW_V1_VERSION;
  evaluatedAt: string;
  status: "READY" | "VERIFY_REQUIRED" | "NO_EVIDENCE";
  candidates: readonly SocialPaidSupportCandidateItemV1[];
  withheld: readonly SocialPaidSupportCandidateItemV1[];
  evidenceRefs: readonly string[];
  limitations: readonly string[];
  expectedLift: null;
  confidence: null;
  causalClaim: false;
  revenueAttributionClaim: false;
  monetaryValue: null;
  competitorPerformanceClaim: false;
  endorsementClaim: false;
  relationshipClaim: false;
  paidMediaExecutionAuthority: "NONE";
  providerWriteAuthority: "NONE";
  notificationAuthority: "NONE";
  externalAccessPerformed: false;
  writesPerformed: false;
}>;

export type SocialPaidSupportCandidateReviewInputV1 = Readonly<{
  performanceReview: SocialContentPerformanceReviewV1;
  businessValueReview: SocialContentBusinessValueReviewV1;
  policy: SocialPaidSupportCandidatePolicyV1;
  evaluatedAt: string;
}>;

const HIGH_INTENT_METRICS = new Set<SocialMetricKeyV1>(["LINK_CLICKS", "PROFILE_VISITS", "SAVES"]);
const PROHIBITED_RAW_TEXT_KEYS = new Set([
  "caption",
  "captionText",
  "transcript",
  "transcriptText",
  "comment",
  "commentText",
  "rawResponse",
  "rawPayload",
  "providerPayload",
  "prompt",
  "responseText"
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

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(unique(left)) === JSON.stringify(unique(right));
}

function contentRef(platform: SocialPlatformV1, contentId: string): string {
  return `${platform}:${contentId}`;
}

function performanceIdentity(item: SocialContentPerformanceItemV1): string {
  return `${item.platform}\u0000${item.accountId}\u0000${item.contentId}\u0000${item.metric}`;
}

function normalizePolicy(policy: SocialPaidSupportCandidatePolicyV1): SocialPaidSupportCandidatePolicyV1 {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) throw new Error("policy must be an object");
  return deepFreeze({
    maxPerformanceAgeHours: positive(policy.maxPerformanceAgeHours, "policy.maxPerformanceAgeHours"),
    maxBusinessValueAgeHours: positive(policy.maxBusinessValueAgeHours, "policy.maxBusinessValueAgeHours"),
    minimumDirectTrackedOutcomeCount: positiveInteger(
      policy.minimumDirectTrackedOutcomeCount,
      "policy.minimumDirectTrackedOutcomeCount"
    ),
    minimumOutperformingHighIntentMetrics: positiveInteger(
      policy.minimumOutperformingHighIntentMetrics,
      "policy.minimumOutperformingHighIntentMetrics"
    )
  });
}

function validatePerformanceReview(review: SocialContentPerformanceReviewV1): void {
  if (review.contractVersion !== "SocialContentPerformanceReviewV1") {
    throw new Error("performanceReview contractVersion is invalid");
  }
  if (review.interpretation !== "WITHIN_PLATFORM_ACCOUNT_AGE_FORMAT_AMPLIFICATION_BASELINE_ONLY") {
    throw new Error("performanceReview interpretation widened beyond the canonical policy");
  }
  if (
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
    throw new Error("performanceReview widens interpretation or action authority");
  }
  if (review.items.length > SOCIAL_PAID_SUPPORT_CANDIDATE_REVIEW_MAX_ITEMS_V1) {
    throw new Error("performanceReview exceeds the supported bound");
  }

  const seen = new Set<string>();
  for (const item of review.items) {
    const identity = performanceIdentity(item);
    if (seen.has(identity)) throw new Error(`duplicate performance item: ${identity}`);
    seen.add(identity);
    if (!item.evidenceRefs.length) throw new Error(`performance item lacks evidence: ${identity}`);
  }

  const partition = [...review.outperformers, ...review.underperformers, ...review.typical];
  const partitionIds = partition.map(performanceIdentity).sort();
  const itemIds = review.items.map(performanceIdentity).sort();
  if (partitionIds.length !== itemIds.length || partitionIds.some((identity, index) => identity !== itemIds[index])) {
    throw new Error("performanceReview classification partition does not match items");
  }
  for (const item of review.outperformers) {
    if (item.classification !== "OUTPERFORMING") throw new Error("performanceReview outperformer classification drift");
  }
  for (const item of review.underperformers) {
    if (item.classification !== "UNDERPERFORMING") throw new Error("performanceReview underperformer classification drift");
  }
  for (const item of review.typical) {
    if (item.classification !== "TYPICAL") throw new Error("performanceReview typical classification drift");
  }

  const expectedEvidence = unique(review.items.flatMap((item) => item.evidenceRefs));
  if (!sameStrings(expectedEvidence, review.evidenceRefs)) {
    throw new Error("performanceReview evidence summary does not match accepted items");
  }
}

function validateBusinessValueReview(review: SocialContentBusinessValueReviewV1): void {
  if (review.contractVersion !== "SocialContentBusinessValueReviewV1") {
    throw new Error("businessValueReview contractVersion is invalid");
  }
  if (
    review.causalClaim !== false ||
    review.revenueAttributionClaim !== false ||
    review.monetaryValue !== null ||
    review.competitorPerformanceClaim !== false ||
    review.endorsementClaim !== false ||
    review.recommendationAuthority !== "NONE" ||
    review.providerWriteAuthority !== "NONE" ||
    review.notificationAuthority !== "NONE" ||
    review.externalAccessPerformed !== false ||
    review.writesPerformed !== false
  ) {
    throw new Error("businessValueReview widens interpretation or action authority");
  }
  if (review.items.length > SOCIAL_PAID_SUPPORT_CANDIDATE_REVIEW_MAX_ITEMS_V1) {
    throw new Error("businessValueReview exceeds the supported bound");
  }

  const seen = new Set<string>();
  for (const item of review.items) {
    if (seen.has(item.contentRef)) throw new Error(`duplicate business-value content: ${item.contentRef}`);
    seen.add(item.contentRef);
    const expectedRef = contentRef(item.platform, item.contentId);
    if (item.contentRef !== expectedRef) throw new Error(`business-value content identity mismatch: ${item.contentRef}`);
    if (!Number.isInteger(item.linkedOutcomeCount) || item.linkedOutcomeCount < 0) {
      throw new Error(`invalid linkedOutcomeCount: ${item.contentRef}`);
    }
    if (!Number.isInteger(item.directTrackedOutcomeCount) || item.directTrackedOutcomeCount < 0) {
      throw new Error(`invalid directTrackedOutcomeCount: ${item.contentRef}`);
    }
    if (item.directTrackedOutcomeCount > item.linkedOutcomeCount) {
      throw new Error(`direct tracked outcome count exceeds linked outcome count: ${item.contentRef}`);
    }
    if (item.linkedOutcomeCount > 0 && !item.outcomeEvidenceRefs.length) {
      throw new Error(`linked business-value item lacks outcome evidence: ${item.contentRef}`);
    }
    if (
      item.causalClaim !== false ||
      item.revenueAttributionClaim !== false ||
      item.monetaryValue !== null ||
      item.competitorPerformanceClaim !== false ||
      item.endorsementClaim !== false ||
      item.recommendationAuthority !== "NONE" ||
      item.providerWriteAuthority !== "NONE" ||
      item.notificationAuthority !== "NONE"
    ) {
      throw new Error(`business-value item widens interpretation or action authority: ${item.contentRef}`);
    }
  }

  const expectedEvidence = unique(review.items.flatMap((item) => [
    ...item.performanceEvidenceRefs,
    ...item.outcomeEvidenceRefs
  ]));
  if (!sameStrings(expectedEvidence, review.evidenceRefs)) {
    throw new Error("businessValueReview evidence summary does not match accepted items");
  }
}

function groupPerformance(review: SocialContentPerformanceReviewV1): Map<string, SocialContentPerformanceItemV1[]> {
  const groups = new Map<string, SocialContentPerformanceItemV1[]>();
  for (const item of review.items) {
    const ref = contentRef(item.platform, item.contentId);
    const rows = groups.get(ref) ?? [];
    if (rows.length && rows[0]!.accountId !== item.accountId) {
      throw new Error(`ambiguous account identity for content: ${ref}`);
    }
    rows.push(item);
    groups.set(ref, rows);
  }
  return groups;
}

function expectedHighIntentMetrics(rows: readonly SocialContentPerformanceItemV1[]): SocialContentBusinessValueReviewItemV1["highIntentMetrics"] {
  return unique(rows
    .filter((row) => HIGH_INTENT_METRICS.has(row.metric) && row.classification === "OUTPERFORMING")
    .map((row) => row.metric)) as SocialContentBusinessValueReviewItemV1["highIntentMetrics"];
}

function bindBusinessValueToPerformance(
  item: SocialContentBusinessValueReviewItemV1,
  rows: readonly SocialContentPerformanceItemV1[] | undefined
): void {
  if (!rows?.length) throw new Error(`business-value content lacks matching performance evidence: ${item.contentRef}`);
  if (rows[0]!.platform !== item.platform || rows[0]!.accountId !== item.accountId || rows[0]!.contentId !== item.contentId) {
    throw new Error(`business-value identity does not match performance evidence: ${item.contentRef}`);
  }

  const performanceEvidence = unique(rows.flatMap((row) => row.evidenceRefs));
  if (!sameStrings(performanceEvidence, item.performanceEvidenceRefs)) {
    throw new Error(`business-value performance evidence drift: ${item.contentRef}`);
  }

  const highIntentMetrics = expectedHighIntentMetrics(rows);
  if (!sameStrings(highIntentMetrics, item.highIntentMetrics)) {
    throw new Error(`business-value high-intent metric drift: ${item.contentRef}`);
  }

  const expectedState = item.linkedOutcomeCount > 0
    ? "TRACKED_BUSINESS_SIGNAL"
    : highIntentMetrics.length > 0
      ? "HIGH_INTENT_PLATFORM_SIGNAL"
      : "NOT_ESTABLISHED";
  if (item.businessValueState !== expectedState) {
    throw new Error(`business-value state drift: ${item.contentRef}`);
  }
}

function emptyReview(
  evaluatedAt: string,
  status: "VERIFY_REQUIRED" | "NO_EVIDENCE",
  limitations: readonly string[]
): SocialPaidSupportCandidateReviewV1 {
  return deepFreeze({
    contractVersion: SOCIAL_PAID_SUPPORT_CANDIDATE_REVIEW_V1_VERSION,
    evaluatedAt,
    status,
    candidates: [],
    withheld: [],
    evidenceRefs: [],
    limitations: unique(limitations),
    expectedLift: null,
    confidence: null,
    causalClaim: false as const,
    revenueAttributionClaim: false as const,
    monetaryValue: null,
    competitorPerformanceClaim: false as const,
    endorsementClaim: false as const,
    relationshipClaim: false as const,
    paidMediaExecutionAuthority: "NONE" as const,
    providerWriteAuthority: "NONE" as const,
    notificationAuthority: "NONE" as const,
    externalAccessPerformed: false as const,
    writesPerformed: false as const
  });
}

function compileItem(
  item: SocialContentBusinessValueReviewItemV1,
  rows: readonly SocialContentPerformanceItemV1[],
  policy: SocialPaidSupportCandidatePolicyV1
): SocialPaidSupportCandidateItemV1 {
  const amplificationTypes = unique(rows.map((row) => row.amplificationType));
  const organicOnly = amplificationTypes.length === 1 && amplificationTypes[0] === "ORGANIC";
  const highIntentMetrics = expectedHighIntentMetrics(rows);

  let evidenceTier: SocialPaidSupportEvidenceTierV1 | null = null;
  const exclusionReasons: SocialPaidSupportExclusionReasonV1[] = [];

  if (!organicOnly) {
    exclusionReasons.push("NON_ORGANIC_OR_CONFLICTED_AMPLIFICATION");
  } else if (item.directTrackedOutcomeCount >= policy.minimumDirectTrackedOutcomeCount) {
    evidenceTier = "DIRECT_TRACKED_BUSINESS_SIGNAL";
  } else if (highIntentMetrics.length >= policy.minimumOutperformingHighIntentMetrics) {
    evidenceTier = "HIGH_INTENT_PLATFORM_SIGNAL";
  } else {
    if (item.linkedOutcomeCount > 0 && item.directTrackedOutcomeCount === 0) {
      exclusionReasons.push("SUPPORTED_ASSOCIATION_ONLY");
    }
    if (item.businessValueState === "NOT_ESTABLISHED") {
      exclusionReasons.push("NO_QUALIFYING_BUSINESS_OR_HIGH_INTENT_SIGNAL");
    } else {
      exclusionReasons.push("BELOW_CALLER_OWNED_SIGNAL_THRESHOLD");
    }
  }

  const candidate = organicOnly && evidenceTier !== null;
  const interpretation = candidate
    ? evidenceTier === "DIRECT_TRACKED_BUSINESS_SIGNAL"
      ? "Organic content has enough directly tracked downstream evidence to justify an internal paid-support test review. This does not establish that paid amplification will improve outcomes."
      : "Organic content has enough outperforming high-intent first-party platform evidence to justify an internal paid-support test review. This is not a prediction of paid-media performance."
    : !organicOnly
      ? "Paid support review is withheld because the source performance evidence is not consistently organic."
      : item.linkedOutcomeCount > 0 && item.directTrackedOutcomeCount === 0
        ? "Tracked downstream evidence is association-only and, without enough outperforming high-intent evidence, is insufficient by itself for a paid-support candidate."
        : "The supplied first-party evidence does not meet the caller-owned threshold for paid-support review.";

  return deepFreeze({
    contentRef: item.contentRef,
    platform: item.platform,
    accountId: item.accountId,
    contentId: item.contentId,
    amplificationState: organicOnly ? "ORGANIC" as const : "NON_ORGANIC_OR_CONFLICTED" as const,
    disposition: candidate ? "PAID_SUPPORT_REVIEW_CANDIDATE" as const : "NOT_CANDIDATE" as const,
    evidenceTier,
    exclusionReasons: unique(exclusionReasons) as SocialPaidSupportExclusionReasonV1[],
    businessValueState: item.businessValueState,
    directTrackedOutcomeCount: item.directTrackedOutcomeCount,
    linkedOutcomeCount: item.linkedOutcomeCount,
    outperformingHighIntentMetrics: highIntentMetrics,
    performanceEvidenceRefs: unique(item.performanceEvidenceRefs),
    outcomeEvidenceRefs: unique(item.outcomeEvidenceRefs),
    interpretation,
    expectedLift: null,
    confidence: null,
    causalClaim: false as const,
    revenueAttributionClaim: false as const,
    monetaryValue: null,
    competitorPerformanceClaim: false as const,
    endorsementClaim: false as const,
    relationshipClaim: false as const,
    paidMediaExecutionAuthority: "NONE" as const,
    providerWriteAuthority: "NONE" as const,
    notificationAuthority: "NONE" as const,
    humanApprovalRequiredBeforePaidMediaExecution: true as const
  });
}

export function compileSocialPaidSupportCandidateReviewV1(
  input: SocialPaidSupportCandidateReviewInputV1
): SocialPaidSupportCandidateReviewV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  assertNoRawText(input, "input");
  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const policy = normalizePolicy(input.policy);

  validatePerformanceReview(input.performanceReview);
  validateBusinessValueReview(input.businessValueReview);

  const performanceAt = Date.parse(timestamp(input.performanceReview.evaluatedAt, "performanceReview.evaluatedAt"));
  const businessAt = Date.parse(timestamp(input.businessValueReview.evaluatedAt, "businessValueReview.evaluatedAt"));

  if (performanceAt > evaluatedAtMs || businessAt > evaluatedAtMs) {
    return emptyReview(evaluatedAt, "VERIFY_REQUIRED", [
      "A source projection is from the future relative to this review; paid-support candidate review is withheld."
    ]);
  }

  const stalePerformance = evaluatedAtMs - performanceAt > policy.maxPerformanceAgeHours * 3_600_000;
  const staleBusiness = evaluatedAtMs - businessAt > policy.maxBusinessValueAgeHours * 3_600_000;
  if (
    input.performanceReview.status === "VERIFY_REQUIRED" ||
    input.businessValueReview.status === "VERIFY_REQUIRED" ||
    stalePerformance ||
    staleBusiness
  ) {
    return emptyReview(evaluatedAt, "VERIFY_REQUIRED", [
      input.performanceReview.status === "VERIFY_REQUIRED" ? "Canonical performance review requires verification." : "",
      input.businessValueReview.status === "VERIFY_REQUIRED" ? "Canonical business-value review requires verification." : "",
      stalePerformance ? "Canonical performance evidence is older than the caller-owned freshness limit." : "",
      staleBusiness ? "Canonical business-value evidence is older than the caller-owned freshness limit." : ""
    ]);
  }

  if (
    input.performanceReview.status === "NO_COMPARABLE_CONTENT" ||
    input.businessValueReview.status === "NO_EVIDENCE" ||
    input.performanceReview.items.length === 0 ||
    input.businessValueReview.items.length === 0
  ) {
    return emptyReview(evaluatedAt, "NO_EVIDENCE", [
      "No comparable first-party performance and business-value evidence is available for paid-support review."
    ]);
  }

  const performanceGroups = groupPerformance(input.performanceReview);
  const compiled: SocialPaidSupportCandidateItemV1[] = [];
  for (const item of input.businessValueReview.items) {
    const rows = performanceGroups.get(item.contentRef);
    bindBusinessValueToPerformance(item, rows);
    compiled.push(compileItem(item, rows!, policy));
  }

  const tierRank: Record<SocialPaidSupportEvidenceTierV1, number> = {
    DIRECT_TRACKED_BUSINESS_SIGNAL: 0,
    HIGH_INTENT_PLATFORM_SIGNAL: 1
  };
  const candidates = compiled
    .filter((item) => item.disposition === "PAID_SUPPORT_REVIEW_CANDIDATE")
    .sort((left, right) => {
      const tier = tierRank[left.evidenceTier!] - tierRank[right.evidenceTier!];
      if (tier !== 0) return tier;
      const direct = right.directTrackedOutcomeCount - left.directTrackedOutcomeCount;
      if (direct !== 0) return direct;
      const linked = right.linkedOutcomeCount - left.linkedOutcomeCount;
      if (linked !== 0) return linked;
      const intent = right.outperformingHighIntentMetrics.length - left.outperformingHighIntentMetrics.length;
      if (intent !== 0) return intent;
      return left.contentRef.localeCompare(right.contentRef);
    });
  const withheld = compiled
    .filter((item) => item.disposition === "NOT_CANDIDATE")
    .sort((left, right) => left.contentRef.localeCompare(right.contentRef));

  return deepFreeze({
    contractVersion: SOCIAL_PAID_SUPPORT_CANDIDATE_REVIEW_V1_VERSION,
    evaluatedAt,
    status: "READY" as const,
    candidates,
    withheld,
    evidenceRefs: unique(compiled.flatMap((item) => [
      ...item.performanceEvidenceRefs,
      ...item.outcomeEvidenceRefs
    ])),
    limitations: [
      "A paid-support candidate is an internal test-review hypothesis, not a prediction that amplification will improve reach, conversion, revenue, or any downstream outcome.",
      "Only consistently organic first-party content can enter this review; PAID, MIXED, UNKNOWN, or conflicting amplification evidence is withheld.",
      "Association-only downstream evidence does not qualify by itself. Direct tracking still does not establish causal lift or revenue attribution.",
      "High-intent qualification uses only already-outperforming LINK_CLICKS, PROFILE_VISITS, or SAVES from comparable within-platform evidence.",
      "No budget, audience, creative, bid, placement, campaign, ad-set, ad, tracking, or provider mutation is selected or authorized here.",
      "Any live paid-media execution remains subject to the existing human approval policy."
    ],
    expectedLift: null,
    confidence: null,
    causalClaim: false as const,
    revenueAttributionClaim: false as const,
    monetaryValue: null,
    competitorPerformanceClaim: false as const,
    endorsementClaim: false as const,
    relationshipClaim: false as const,
    paidMediaExecutionAuthority: "NONE" as const,
    providerWriteAuthority: "NONE" as const,
    notificationAuthority: "NONE" as const,
    externalAccessPerformed: false as const,
    writesPerformed: false as const
  });
}
