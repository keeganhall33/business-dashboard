import type {
  SocialBusinessOutcomeKindV1,
  SocialBusinessOutcomeLinkageV1,
  SocialContentBusinessOutcomeSummaryV1
} from "./social-business-outcome-linkage-v1";
import type {
  SocialContentPerformanceItemV1,
  SocialContentPerformanceReviewV1
} from "./social-content-performance-review-v1";
import type { SocialMetricKeyV1, SocialPlatformV1 } from "./social-canonical-v1";

export const SOCIAL_CONTENT_BUSINESS_VALUE_REVIEW_V1_VERSION = "SocialContentBusinessValueReviewV1" as const;
export const SOCIAL_CONTENT_BUSINESS_VALUE_REVIEW_MAX_ITEMS_V1 = 500;

export type SocialContentBusinessValueSignalV1 =
  | "LOWER_REACH_HIGH_INTENT"
  | "HIGH_ENGAGEMENT_WITH_TRACKED_BUSINESS_SIGNAL"
  | "HIGH_ENGAGEMENT_WITHOUT_TRACKED_BUSINESS_EVIDENCE"
  | "TRACKED_BUSINESS_SIGNAL_REACH_UNASSESSED";

export type SocialContentBusinessValueStateV1 =
  | "TRACKED_BUSINESS_SIGNAL"
  | "HIGH_INTENT_PLATFORM_SIGNAL"
  | "NOT_ESTABLISHED";

export type SocialContentReachStateV1 =
  | "LOWER_THAN_COMPARABLE"
  | "HIGHER_THAN_COMPARABLE"
  | "TYPICAL"
  | "UNASSESSED";

export type SocialContentEngagementStateV1 = "OUTPERFORMING" | "NOT_OUTPERFORMING" | "UNASSESSED";

export type SocialContentBusinessValueReviewItemV1 = Readonly<{
  contentRef: string;
  platform: SocialPlatformV1;
  accountId: string;
  contentId: string;
  signals: readonly SocialContentBusinessValueSignalV1[];
  businessValueState: SocialContentBusinessValueStateV1;
  reachState: SocialContentReachStateV1;
  engagementState: SocialContentEngagementStateV1;
  linkedOutcomeCount: number;
  directTrackedOutcomeCount: number;
  outcomeCounts: Readonly<Record<SocialBusinessOutcomeKindV1, number>> | null;
  highIntentMetrics: readonly Extract<SocialMetricKeyV1, "LINK_CLICKS" | "PROFILE_VISITS" | "SAVES">[];
  outperformingEngagementMetrics: readonly Extract<SocialMetricKeyV1, "COMMENTS" | "SHARES" | "SAVES">[];
  reachMetricsReviewed: readonly Extract<SocialMetricKeyV1, "REACH" | "VIEWS">[];
  performanceEvidenceRefs: readonly string[];
  outcomeEvidenceRefs: readonly string[];
  interpretation: string;
  causalClaim: false;
  revenueAttributionClaim: false;
  monetaryValue: null;
  competitorPerformanceClaim: false;
  endorsementClaim: false;
  recommendationAuthority: "NONE";
  providerWriteAuthority: "NONE";
  notificationAuthority: "NONE";
}>;

export type SocialContentBusinessValueReviewV1 = Readonly<{
  contractVersion: typeof SOCIAL_CONTENT_BUSINESS_VALUE_REVIEW_V1_VERSION;
  evaluatedAt: string;
  status: "READY" | "VERIFY_REQUIRED" | "NO_EVIDENCE";
  items: readonly SocialContentBusinessValueReviewItemV1[];
  lowerReachHighIntent: readonly SocialContentBusinessValueReviewItemV1[];
  vanityRiskReview: readonly SocialContentBusinessValueReviewItemV1[];
  trackedBusinessSignal: readonly SocialContentBusinessValueReviewItemV1[];
  evidenceRefs: readonly string[];
  limitations: readonly string[];
  causalClaim: false;
  revenueAttributionClaim: false;
  monetaryValue: null;
  competitorPerformanceClaim: false;
  endorsementClaim: false;
  recommendationAuthority: "NONE";
  providerWriteAuthority: "NONE";
  notificationAuthority: "NONE";
  externalAccessPerformed: false;
  writesPerformed: false;
}>;

export type SocialContentBusinessValueReviewInputV1 = Readonly<{
  performanceReview: SocialContentPerformanceReviewV1;
  outcomeLinkage: SocialBusinessOutcomeLinkageV1;
  evaluatedAt: string;
  maxPerformanceAgeHours: number;
  maxOutcomeLinkageAgeHours: number;
}>;

const HIGH_INTENT_METRICS = new Set<SocialMetricKeyV1>(["LINK_CLICKS", "PROFILE_VISITS", "SAVES"]);
const ENGAGEMENT_METRICS = new Set<SocialMetricKeyV1>(["COMMENTS", "SHARES", "SAVES"]);
const REACH_METRICS = new Set<SocialMetricKeyV1>(["REACH", "VIEWS"]);
const OUTCOME_KINDS: readonly SocialBusinessOutcomeKindV1[] = [
  "SITE_SESSION",
  "EMAIL_SIGNUP",
  "INQUIRY",
  "PURCHASE",
  "OPPORTUNITY",
  "MEDIA_OUTCOME"
];
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
    if (PROHIBITED_RAW_TEXT_KEYS.has(key)) throw new Error(`${path}.${key} is prohibited; retain opaque evidence references instead`);
    assertNoRawText(child, `${path}.${key}`, seen);
  }
}

function timestamp(value: string, field: string): string {
  const normalized = value?.trim();
  const parsed = Date.parse(normalized);
  if (!normalized || Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function positive(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be a finite positive number`);
  return value;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function contentRef(platform: SocialPlatformV1, contentId: string): string {
  return `${platform}:${contentId}`;
}

function performanceIdentity(item: SocialContentPerformanceItemV1): string {
  return `${item.platform}\u0000${item.accountId}\u0000${item.contentId}\u0000${item.metric}`;
}

function validatePerformanceReview(review: SocialContentPerformanceReviewV1): void {
  if (review.contractVersion !== "SocialContentPerformanceReviewV1") throw new Error("performanceReview contractVersion is invalid");
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
  if (review.items.length > SOCIAL_CONTENT_BUSINESS_VALUE_REVIEW_MAX_ITEMS_V1) throw new Error("performanceReview exceeds the supported bound");

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
  for (const item of review.outperformers) if (item.classification !== "OUTPERFORMING") throw new Error("performanceReview outperformer classification drift");
  for (const item of review.underperformers) if (item.classification !== "UNDERPERFORMING") throw new Error("performanceReview underperformer classification drift");
  for (const item of review.typical) if (item.classification !== "TYPICAL") throw new Error("performanceReview typical classification drift");

  const expectedEvidence = unique(review.items.flatMap((item) => item.evidenceRefs));
  if (JSON.stringify(expectedEvidence) !== JSON.stringify(unique(review.evidenceRefs))) {
    throw new Error("performanceReview evidence summary does not match accepted items");
  }
}

function emptyOutcomeCounts(): Record<SocialBusinessOutcomeKindV1, number> {
  return {
    SITE_SESSION: 0,
    EMAIL_SIGNUP: 0,
    INQUIRY: 0,
    PURCHASE: 0,
    OPPORTUNITY: 0,
    MEDIA_OUTCOME: 0
  };
}

function validateOutcomeLinkage(linkage: SocialBusinessOutcomeLinkageV1): Map<string, SocialContentBusinessOutcomeSummaryV1> {
  if (linkage.contractVersion !== "SocialBusinessOutcomeLinkageV1") throw new Error("outcomeLinkage contractVersion is invalid");
  if (linkage.externalAccessPerformed !== false || linkage.writesPerformed !== false) {
    throw new Error("outcomeLinkage widens action authority");
  }
  const summaries = new Map<string, SocialContentBusinessOutcomeSummaryV1>();
  for (const summary of linkage.byContent) {
    const expectedRef = contentRef(summary.platform, summary.contentId);
    if (summary.socialContentRef !== expectedRef) throw new Error(`outcome summary identity mismatch: ${summary.socialContentRef}`);
    if (summaries.has(summary.socialContentRef)) throw new Error(`duplicate outcome summary: ${summary.socialContentRef}`);
    if (summary.causalClaim !== false || summary.revenueAttributionClaim !== false || summary.monetaryValue !== null) {
      throw new Error(`outcome summary widens interpretation: ${summary.socialContentRef}`);
    }

    const rows = linkage.rows.filter((row) =>
      row.socialContentRef === summary.socialContentRef &&
      (row.disposition === "DIRECT_LINK" || row.disposition === "ASSOCIATED_LINK")
    );
    const outcomeCounts = emptyOutcomeCounts();
    let directTrackedOutcomeCount = 0;
    const evidenceRefs: string[] = [];
    for (const row of rows) {
      if (row.causalClaim !== false || row.revenueAttributionClaim !== false || row.monetaryValue !== null) {
        throw new Error(`outcome row widens interpretation: ${row.outcomeId}`);
      }
      outcomeCounts[row.kind] += 1;
      if (row.attributionClass === "DIRECT_TRACKED") directTrackedOutcomeCount += 1;
      evidenceRefs.push(...row.evidenceRefs);
    }
    if (summary.linkedOutcomeCount !== rows.length) throw new Error(`outcome summary linked count drift: ${summary.socialContentRef}`);
    if (summary.directTrackedOutcomeCount !== directTrackedOutcomeCount) throw new Error(`outcome summary direct count drift: ${summary.socialContentRef}`);
    for (const kind of OUTCOME_KINDS) {
      if (summary.outcomeCounts[kind] !== outcomeCounts[kind]) throw new Error(`outcome summary kind count drift: ${summary.socialContentRef}/${kind}`);
    }
    const expectedStrongest = directTrackedOutcomeCount > 0 ? "DIRECT_TRACKED" : "SUPPORTED_ASSOCIATION";
    if (summary.strongestAttributionClass !== expectedStrongest) throw new Error(`outcome summary attribution drift: ${summary.socialContentRef}`);
    if (JSON.stringify(unique(summary.evidenceRefs)) !== JSON.stringify(unique(evidenceRefs))) {
      throw new Error(`outcome summary evidence drift: ${summary.socialContentRef}`);
    }
    summaries.set(summary.socialContentRef, summary);
  }
  return summaries;
}

function reachState(items: readonly SocialContentPerformanceItemV1[]): SocialContentReachStateV1 {
  const reach = items.filter((item) => REACH_METRICS.has(item.metric));
  if (!reach.length) return "UNASSESSED";
  if (reach.some((item) => item.classification === "UNDERPERFORMING")) return "LOWER_THAN_COMPARABLE";
  if (reach.some((item) => item.classification === "OUTPERFORMING")) return "HIGHER_THAN_COMPARABLE";
  return "TYPICAL";
}

function engagementState(items: readonly SocialContentPerformanceItemV1[]): SocialContentEngagementStateV1 {
  const engagement = items.filter((item) => ENGAGEMENT_METRICS.has(item.metric));
  if (!engagement.length) return "UNASSESSED";
  return engagement.some((item) => item.classification === "OUTPERFORMING") ? "OUTPERFORMING" : "NOT_OUTPERFORMING";
}

export function compileSocialContentBusinessValueReviewV1(
  input: SocialContentBusinessValueReviewInputV1
): SocialContentBusinessValueReviewV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  assertNoRawText(input, "input");
  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const maxPerformanceAgeHours = positive(input.maxPerformanceAgeHours, "maxPerformanceAgeHours");
  const maxOutcomeLinkageAgeHours = positive(input.maxOutcomeLinkageAgeHours, "maxOutcomeLinkageAgeHours");

  validatePerformanceReview(input.performanceReview);
  const summaries = validateOutcomeLinkage(input.outcomeLinkage);

  const performanceAt = Date.parse(timestamp(input.performanceReview.evaluatedAt, "performanceReview.evaluatedAt"));
  const outcomeAt = Date.parse(timestamp(input.outcomeLinkage.generatedAt, "outcomeLinkage.generatedAt"));
  if (performanceAt > evaluatedAtMs || outcomeAt > evaluatedAtMs) {
    return deepFreeze({
      contractVersion: SOCIAL_CONTENT_BUSINESS_VALUE_REVIEW_V1_VERSION,
      evaluatedAt,
      status: "VERIFY_REQUIRED" as const,
      items: [],
      lowerReachHighIntent: [],
      vanityRiskReview: [],
      trackedBusinessSignal: [],
      evidenceRefs: [],
      limitations: ["A source projection is from the future relative to this review; no business-value interpretation was produced."],
      causalClaim: false as const,
      revenueAttributionClaim: false as const,
      monetaryValue: null,
      competitorPerformanceClaim: false as const,
      endorsementClaim: false as const,
      recommendationAuthority: "NONE" as const,
      providerWriteAuthority: "NONE" as const,
      notificationAuthority: "NONE" as const,
      externalAccessPerformed: false as const,
      writesPerformed: false as const
    });
  }

  const stalePerformance = evaluatedAtMs - performanceAt > maxPerformanceAgeHours * 3_600_000;
  const staleOutcome = evaluatedAtMs - outcomeAt > maxOutcomeLinkageAgeHours * 3_600_000;
  if (input.performanceReview.status === "VERIFY_REQUIRED" || stalePerformance || staleOutcome) {
    return deepFreeze({
      contractVersion: SOCIAL_CONTENT_BUSINESS_VALUE_REVIEW_V1_VERSION,
      evaluatedAt,
      status: "VERIFY_REQUIRED" as const,
      items: [],
      lowerReachHighIntent: [],
      vanityRiskReview: [],
      trackedBusinessSignal: [],
      evidenceRefs: [],
      limitations: unique([
        input.performanceReview.status === "VERIFY_REQUIRED" ? "Canonical performance review requires verification." : "",
        stalePerformance ? "Canonical performance evidence is older than the caller-owned freshness limit." : "",
        staleOutcome ? "Canonical outcome-linkage evidence is older than the caller-owned freshness limit." : ""
      ]),
      causalClaim: false as const,
      revenueAttributionClaim: false as const,
      monetaryValue: null,
      competitorPerformanceClaim: false as const,
      endorsementClaim: false as const,
      recommendationAuthority: "NONE" as const,
      providerWriteAuthority: "NONE" as const,
      notificationAuthority: "NONE" as const,
      externalAccessPerformed: false as const,
      writesPerformed: false as const
    });
  }

  if (input.performanceReview.status === "NO_COMPARABLE_CONTENT" || input.performanceReview.items.length === 0) {
    return deepFreeze({
      contractVersion: SOCIAL_CONTENT_BUSINESS_VALUE_REVIEW_V1_VERSION,
      evaluatedAt,
      status: "NO_EVIDENCE" as const,
      items: [],
      lowerReachHighIntent: [],
      vanityRiskReview: [],
      trackedBusinessSignal: [],
      evidenceRefs: [],
      limitations: ["No comparable first-party content performance evidence is available for business-value review."],
      causalClaim: false as const,
      revenueAttributionClaim: false as const,
      monetaryValue: null,
      competitorPerformanceClaim: false as const,
      endorsementClaim: false as const,
      recommendationAuthority: "NONE" as const,
      providerWriteAuthority: "NONE" as const,
      notificationAuthority: "NONE" as const,
      externalAccessPerformed: false as const,
      writesPerformed: false as const
    });
  }

  const grouped = new Map<string, { platform: SocialPlatformV1; accountId: string; contentId: string; items: SocialContentPerformanceItemV1[] }>();
  for (const item of input.performanceReview.items) {
    const ref = contentRef(item.platform, item.contentId);
    const existing = grouped.get(ref);
    if (existing && existing.accountId !== item.accountId) throw new Error(`ambiguous account identity for content: ${ref}`);
    if (existing) existing.items.push(item);
    else grouped.set(ref, { platform: item.platform, accountId: item.accountId, contentId: item.contentId, items: [item] });
  }

  const items = [...grouped.entries()].map(([ref, group]): SocialContentBusinessValueReviewItemV1 => {
    const outcome = summaries.get(ref) ?? null;
    const linkedOutcomeCount = outcome?.linkedOutcomeCount ?? 0;
    const directTrackedOutcomeCount = outcome?.directTrackedOutcomeCount ?? 0;
    const highIntentMetrics = unique(group.items
      .filter((item) => HIGH_INTENT_METRICS.has(item.metric) && item.classification === "OUTPERFORMING")
      .map((item) => item.metric)) as SocialContentBusinessValueReviewItemV1["highIntentMetrics"];
    const outperformingEngagementMetrics = unique(group.items
      .filter((item) => ENGAGEMENT_METRICS.has(item.metric) && item.classification === "OUTPERFORMING")
      .map((item) => item.metric)) as SocialContentBusinessValueReviewItemV1["outperformingEngagementMetrics"];
    const reachMetricsReviewed = unique(group.items
      .filter((item) => REACH_METRICS.has(item.metric))
      .map((item) => item.metric)) as SocialContentBusinessValueReviewItemV1["reachMetricsReviewed"];
    const currentReachState = reachState(group.items);
    const currentEngagementState = engagementState(group.items);
    const businessValueState: SocialContentBusinessValueStateV1 = linkedOutcomeCount > 0
      ? "TRACKED_BUSINESS_SIGNAL"
      : highIntentMetrics.length > 0
        ? "HIGH_INTENT_PLATFORM_SIGNAL"
        : "NOT_ESTABLISHED";

    const signals: SocialContentBusinessValueSignalV1[] = [];
    if (currentReachState === "LOWER_THAN_COMPARABLE" && businessValueState !== "NOT_ESTABLISHED") signals.push("LOWER_REACH_HIGH_INTENT");
    if (currentEngagementState === "OUTPERFORMING" && linkedOutcomeCount > 0) signals.push("HIGH_ENGAGEMENT_WITH_TRACKED_BUSINESS_SIGNAL");
    if (currentEngagementState === "OUTPERFORMING" && businessValueState === "NOT_ESTABLISHED") signals.push("HIGH_ENGAGEMENT_WITHOUT_TRACKED_BUSINESS_EVIDENCE");
    if (currentReachState === "UNASSESSED" && linkedOutcomeCount > 0) signals.push("TRACKED_BUSINESS_SIGNAL_REACH_UNASSESSED");

    const interpretation = signals.includes("LOWER_REACH_HIGH_INTENT")
      ? "This content has lower comparable reach/view performance while retaining an observed high-intent or tracked downstream signal; lower reach is therefore not treated as low business value."
      : signals.includes("HIGH_ENGAGEMENT_WITH_TRACKED_BUSINESS_SIGNAL")
        ? "This content combines outperforming engagement with tracked downstream association; the association does not establish causality or revenue impact."
        : signals.includes("HIGH_ENGAGEMENT_WITHOUT_TRACKED_BUSINESS_EVIDENCE")
          ? "This content has outperforming engagement but no accepted high-intent or tracked downstream evidence in the supplied canonical projections; business value remains unestablished rather than classified as low."
          : linkedOutcomeCount > 0
            ? "This content has tracked downstream association; comparable reach/engagement evidence does not justify a stronger performance interpretation."
            : "No qualified business-value review signal is established from the supplied comparable performance and outcome evidence.";

    return deepFreeze({
      contentRef: ref,
      platform: group.platform,
      accountId: group.accountId,
      contentId: group.contentId,
      signals: [...signals].sort((a, b) => a.localeCompare(b)),
      businessValueState,
      reachState: currentReachState,
      engagementState: currentEngagementState,
      linkedOutcomeCount,
      directTrackedOutcomeCount,
      outcomeCounts: outcome ? deepFreeze({ ...outcome.outcomeCounts }) : null,
      highIntentMetrics,
      outperformingEngagementMetrics,
      reachMetricsReviewed,
      performanceEvidenceRefs: unique(group.items.flatMap((item) => item.evidenceRefs)),
      outcomeEvidenceRefs: unique(outcome?.evidenceRefs ?? []),
      interpretation,
      causalClaim: false as const,
      revenueAttributionClaim: false as const,
      monetaryValue: null,
      competitorPerformanceClaim: false as const,
      endorsementClaim: false as const,
      recommendationAuthority: "NONE" as const,
      providerWriteAuthority: "NONE" as const,
      notificationAuthority: "NONE" as const
    });
  }).sort((left, right) => {
    const direct = right.directTrackedOutcomeCount - left.directTrackedOutcomeCount;
    if (direct !== 0) return direct;
    const linked = right.linkedOutcomeCount - left.linkedOutcomeCount;
    if (linked !== 0) return linked;
    const lowerReach = Number(right.signals.includes("LOWER_REACH_HIGH_INTENT")) - Number(left.signals.includes("LOWER_REACH_HIGH_INTENT"));
    if (lowerReach !== 0) return lowerReach;
    return left.contentRef.localeCompare(right.contentRef);
  });

  const lowerReachHighIntent = items.filter((item) => item.signals.includes("LOWER_REACH_HIGH_INTENT"));
  const vanityRiskReview = items.filter((item) => item.signals.includes("HIGH_ENGAGEMENT_WITHOUT_TRACKED_BUSINESS_EVIDENCE"));
  const trackedBusinessSignal = items.filter((item) => item.businessValueState === "TRACKED_BUSINESS_SIGNAL");

  return deepFreeze({
    contractVersion: SOCIAL_CONTENT_BUSINESS_VALUE_REVIEW_V1_VERSION,
    evaluatedAt,
    status: "READY" as const,
    items,
    lowerReachHighIntent,
    vanityRiskReview,
    trackedBusinessSignal,
    evidenceRefs: unique(items.flatMap((item) => [...item.performanceEvidenceRefs, ...item.outcomeEvidenceRefs])),
    limitations: [
      "No absence of linked downstream evidence is treated as proof of low business value; it means business value is not established by the supplied canonical evidence.",
      "Lower comparable reach or views can coexist with stronger high-intent or tracked downstream signals and must not be suppressed as a vanity-only loser.",
      "Tracked outcomes remain associations unless the upstream linkage is DIRECT_TRACKED, and even direct tracking does not establish causal lift or revenue attribution.",
      "Performance remains within-platform/account/age/format/amplification comparable evidence only; this review does not authorize cross-platform metric equivalence.",
      "This review authorizes no content recommendation execution, posting, paid support, provider write, alert delivery, or other external action."
    ],
    causalClaim: false as const,
    revenueAttributionClaim: false as const,
    monetaryValue: null,
    competitorPerformanceClaim: false as const,
    endorsementClaim: false as const,
    recommendationAuthority: "NONE" as const,
    providerWriteAuthority: "NONE" as const,
    notificationAuthority: "NONE" as const,
    externalAccessPerformed: false as const,
    writesPerformed: false as const
  });
}
