import type {
  SocialHistoryWindowV1,
  SocialMetricKeyV1,
  SocialPlatformV1
} from "./social-canonical-v1";
import type {
  SocialChannelDrilldownV1,
  SocialChannelMetricV1
} from "./social-channel-drilldown-v1";
import type {
  SocialConnectorHealthPlatformV1,
  SocialConnectorHealthReviewV1
} from "./social-connector-health-review-v1";
import type {
  SocialContentPerformanceItemV1,
  SocialContentPerformanceReviewV1
} from "./social-content-performance-review-v1";
import type {
  SocialContentBusinessValueReviewItemV1,
  SocialContentBusinessValueReviewV1
} from "./social-content-business-value-review-v1";
import type {
  SocialContentOpportunityQueueV1,
  SocialContentOpportunityV1
} from "./social-content-opportunity-queue-v1";
import type {
  SocialMaterialAlertReadinessItemV1,
  SocialMaterialAlertReadinessV1
} from "./social-material-alert-readiness-v1";

export const SOCIAL_EXECUTIVE_OVERVIEW_V1_VERSION = "SocialExecutiveOverviewV1" as const;
export const SOCIAL_EXECUTIVE_OVERVIEW_MAX_CHANNELS_V1 = 20;
export const SOCIAL_EXECUTIVE_OVERVIEW_MAX_ALERT_REVIEWS_V1 = 20;
export const SOCIAL_EXECUTIVE_OVERVIEW_MAX_ACTIONS_V1 = 5;

export type SocialExecutiveOverviewStatusV1 = "READY" | "PARTIAL" | "VERIFY_REQUIRED";

export type SocialExecutiveOverviewReasonV1 =
  | "CHANNEL_NOT_DECISION_GRADE"
  | "CHANNEL_CONNECTOR_HEALTH_MISSING"
  | "CHANNEL_CONNECTOR_TRUTH_MISMATCH"
  | "CONNECTOR_HEALTH_STALE"
  | "CONNECTOR_HEALTH_NOT_FULLY_OPERATIONAL"
  | "CONTENT_PERFORMANCE_STALE"
  | "CONTENT_PERFORMANCE_NOT_READY"
  | "BUSINESS_VALUE_STALE"
  | "BUSINESS_VALUE_NOT_READY"
  | "OPPORTUNITY_QUEUE_STALE"
  | "OPPORTUNITY_QUEUE_NOT_READY"
  | "ALERT_READINESS_STALE"
  | "ALERT_READINESS_NOT_READY";

export type SocialExecutiveOverviewComponentStateV1 = "CURRENT" | "PARTIAL" | "VERIFY_REQUIRED";

export type SocialExecutiveOverviewComponentV1 = Readonly<{
  component:
    | "CONNECTOR_HEALTH"
    | "CHANNEL_DRILLDOWNS"
    | "CONTENT_PERFORMANCE"
    | "BUSINESS_VALUE"
    | "OPPORTUNITY_QUEUE"
    | "ALERT_READINESS";
  state: SocialExecutiveOverviewComponentStateV1;
  observedAt: string | null;
  reasons: readonly SocialExecutiveOverviewReasonV1[];
}>;

export type SocialExecutiveAudienceMetricV1 = Readonly<{
  metric: Extract<SocialMetricKeyV1, "AUDIENCE_TOTAL" | "NET_NEW_AUDIENCE">;
  value: number | null;
  priorValue: number | null;
  absoluteDelta: number | null;
  percentageDelta: number | null;
  direction: SocialChannelMetricV1["direction"];
  state: SocialChannelMetricV1["state"];
  decisionGrade: boolean;
  evidenceRefs: readonly string[];
}>;

export type SocialExecutiveChannelCardV1 = Readonly<{
  platform: SocialPlatformV1;
  accountId: string;
  handle: string | null;
  window: SocialHistoryWindowV1;
  availability: SocialChannelDrilldownV1["availability"];
  sourceState: SocialChannelDrilldownV1["sourceHealth"]["state"];
  sourceFreshness: SocialChannelDrilldownV1["sourceHealth"]["freshness"];
  connectorSourceHealth: SocialConnectorHealthPlatformV1["sourceHealth"] | null;
  canonicalDataState: SocialConnectorHealthPlatformV1["canonicalDataState"] | null;
  liveFirstPartyDataProven: boolean;
  decisionGrade: boolean;
  audience: SocialExecutiveAudienceMetricV1;
  netNewAudience: SocialExecutiveAudienceMetricV1;
  warningCodes: readonly string[];
  limitations: readonly string[];
  evidenceRefs: readonly string[];
  uniqueAudienceClaim: false;
}>;

export type SocialExecutiveContentHighlightV1 = Readonly<{
  platform: SocialPlatformV1;
  accountId: string;
  contentId: string;
  metric: SocialContentPerformanceItemV1["metric"];
  classification: SocialContentPerformanceItemV1["classification"];
  ratioToComparableMedian: number;
  evidenceRefs: readonly string[];
  interpretation: "WITHIN_PLATFORM_ACCOUNT_AGE_FORMAT_AMPLIFICATION_BASELINE_ONLY";
  crossPlatformWinnerClaim: false;
  causalClaim: false;
  attributionClaim: false;
}>;

export type SocialExecutiveBusinessValueHighlightV1 = Readonly<{
  platform: SocialPlatformV1;
  accountId: string;
  contentId: string;
  contentRef: string;
  businessValueState: SocialContentBusinessValueReviewItemV1["businessValueState"];
  directTrackedOutcomeCount: number;
  linkedOutcomeCount: number;
  highIntentMetrics: SocialContentBusinessValueReviewItemV1["highIntentMetrics"];
  evidenceRefs: readonly string[];
  crossPlatformWinnerClaim: false;
  causalClaim: false;
  revenueAttributionClaim: false;
  monetaryValue: null;
}>;

export type SocialExecutiveRecommendedActionV1 = Readonly<{
  opportunityId: string;
  rank: number;
  priority: SocialContentOpportunityV1["priority"];
  targetPlatform: SocialPlatformV1;
  sourcePlatform: SocialPlatformV1;
  observedMechanism: string;
  experimentPlan: string;
  successMetricPlan: string;
  evidenceRefs: readonly string[];
  requiresApprovalForPosting: true;
  executionAuthority: "NONE";
  confidence: null;
  causalClaim: false;
  revenueAttributionClaim: false;
  competitorPerformanceClaim: false;
}>;

export type SocialExecutiveAlertReviewV1 = Readonly<{
  signalId: string;
  platform: SocialPlatformV1;
  accountId: string;
  metric: SocialMetricKeyV1;
  window: SocialHistoryWindowV1;
  direction: "UP" | "DOWN";
  independentSupportingSourceCount: number;
  evidenceRefs: readonly string[];
  eligibleForNotification: false;
  notificationAuthority: "NONE";
  causalClaim: false;
  attributionClaim: false;
  competitorPerformanceClaim: false;
  relationshipClaim: false;
  endorsementClaim: false;
}>;

export type SocialExecutiveOverviewV1 = Readonly<{
  contractVersion: typeof SOCIAL_EXECUTIVE_OVERVIEW_V1_VERSION;
  generatedAt: string;
  window: SocialHistoryWindowV1;
  status: SocialExecutiveOverviewStatusV1;
  reasons: readonly SocialExecutiveOverviewReasonV1[];
  components: readonly SocialExecutiveOverviewComponentV1[];
  channelCards: readonly SocialExecutiveChannelCardV1[];
  audienceTotalAcrossPlatforms: null;
  audienceOverlapKnown: false;
  audienceRollupState: "NOT_ESTABLISHED";
  contentHighlightsByPlatform: readonly SocialExecutiveContentHighlightV1[];
  strongestContentWinnerAcrossPlatforms: null;
  businessValueHighlightsByPlatform: readonly SocialExecutiveBusinessValueHighlightV1[];
  strongestBusinessValueContentAcrossPlatforms: null;
  recommendedActions: readonly SocialExecutiveRecommendedActionV1[];
  alertReviewCandidates: readonly SocialExecutiveAlertReviewV1[];
  guardrails: readonly string[];
  crossPlatformMetricAggregationPerformed: false;
  crossPlatformPerformanceRankingPerformed: false;
  causalClaim: false;
  attributionClaim: false;
  competitorPerformanceClaim: false;
  relationshipClaim: false;
  endorsementClaim: false;
  notificationAuthority: "NONE";
  postingAuthority: "NONE";
  externalAccessPerformed: false;
  writesPerformed: false;
}>;

export type SocialExecutiveOverviewInputV1 = Readonly<{
  generatedAt: string;
  window: SocialHistoryWindowV1;
  channelDrilldowns: readonly SocialChannelDrilldownV1[];
  connectorHealth: SocialConnectorHealthReviewV1;
  performanceReview: SocialContentPerformanceReviewV1;
  businessValueReview: SocialContentBusinessValueReviewV1;
  opportunityQueue: SocialContentOpportunityQueueV1;
  alertReadiness: readonly SocialMaterialAlertReadinessV1[];
  maxEvidenceAgeHours: number;
  maxRecommendedActions?: number;
}>;

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function iso(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!value || Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function nonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  return normalized;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function uniqueReasons(values: readonly SocialExecutiveOverviewReasonV1[]): SocialExecutiveOverviewReasonV1[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function componentAge(
  observedAt: string,
  generatedAtMs: number,
  maxEvidenceAgeHours: number,
  staleReason: SocialExecutiveOverviewReasonV1,
  field: string
): { observedAt: string; stale: boolean; staleReason: SocialExecutiveOverviewReasonV1 | null } {
  const normalized = iso(observedAt, field);
  const observedMs = Date.parse(normalized);
  if (observedMs > generatedAtMs) throw new Error(`${field} cannot be in the future`);
  const stale = generatedAtMs - observedMs > maxEvidenceAgeHours * 3_600_000;
  return { observedAt: normalized, stale, staleReason: stale ? staleReason : null };
}

function assertChannelAuthority(channel: SocialChannelDrilldownV1): void {
  if (channel.contractVersion !== "SocialChannelDrilldownV1") throw new Error("channelDrilldown contractVersion is invalid");
  if (
    channel.crossPlatformAggregationPerformed !== false ||
    channel.causalAttributionClaimed !== false ||
    channel.externalAccessPerformed !== false ||
    channel.writesPerformed !== false
  ) throw new Error("channelDrilldown widens interpretation or action authority");
}

function assertConnectorAuthority(review: SocialConnectorHealthReviewV1): void {
  if (review.contractVersion !== "SocialConnectorHealthReviewV1") throw new Error("connectorHealth contractVersion is invalid");
  if (review.externalAccessPerformed !== false || review.writesPerformed !== false) {
    throw new Error("connectorHealth widens action authority");
  }
  for (const row of review.platforms) {
    if (row.readOnly !== true || row.writesPerformed !== false) throw new Error("connectorHealth platform widens action authority");
  }
}

function assertPerformanceAuthority(review: SocialContentPerformanceReviewV1): void {
  if (review.contractVersion !== "SocialContentPerformanceReviewV1") throw new Error("performanceReview contractVersion is invalid");
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
  ) throw new Error("performanceReview widens interpretation or action authority");
}

function assertBusinessValueAuthority(review: SocialContentBusinessValueReviewV1): void {
  if (review.contractVersion !== "SocialContentBusinessValueReviewV1") throw new Error("businessValueReview contractVersion is invalid");
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
  ) throw new Error("businessValueReview widens interpretation or action authority");
}

function assertQueueAuthority(queue: SocialContentOpportunityQueueV1): void {
  if (queue.contractVersion !== "SocialContentOpportunityQueueV1") throw new Error("opportunityQueue contractVersion is invalid");
  if (queue.postingAuthority !== "NONE" || queue.externalAccessPerformed !== false || queue.writesPerformed !== false) {
    throw new Error("opportunityQueue widens action authority");
  }
  if (queue.opportunities.some((item) =>
    item.executionAuthority !== "NONE" || item.publicPostingRequiresApproval !== true || item.confidence !== null
  )) throw new Error("opportunityQueue item widens action authority or confidence");
}

function assertAlertAuthority(review: SocialMaterialAlertReadinessV1): void {
  if (review.contractVersion !== "SocialMaterialAlertReadinessV1") throw new Error("alertReadiness contractVersion is invalid");
  if (review.notificationAuthority !== "NONE" || review.externalAccessPerformed !== false || review.writesPerformed !== false) {
    throw new Error("alertReadiness widens action authority");
  }
  if (review.items.some((item) => item.eligibleForNotification !== false)) {
    throw new Error("alertReadiness item widens notification authority");
  }
}

function audienceMetric(
  channel: SocialChannelDrilldownV1,
  key: "AUDIENCE_TOTAL" | "NET_NEW_AUDIENCE"
): SocialExecutiveAudienceMetricV1 {
  const metric = channel.metrics.find((row) => row.key === key);
  if (!metric) {
    return freeze<SocialExecutiveAudienceMetricV1>({
      metric: key,
      value: null,
      priorValue: null,
      absoluteDelta: null,
      percentageDelta: null,
      direction: "UNKNOWN",
      state: "UNKNOWN",
      decisionGrade: false,
      evidenceRefs: []
    });
  }
  return freeze<SocialExecutiveAudienceMetricV1>({
    metric: key,
    value: metric.value,
    priorValue: metric.priorValue,
    absoluteDelta: metric.absoluteDelta,
    percentageDelta: metric.percentageDelta,
    direction: metric.direction,
    state: metric.state,
    decisionGrade: metric.decisionGrade,
    evidenceRefs: unique(metric.evidenceRefs)
  });
}

function connectorByPlatform(review: SocialConnectorHealthReviewV1): Map<SocialPlatformV1, SocialConnectorHealthPlatformV1> {
  const result = new Map<SocialPlatformV1, SocialConnectorHealthPlatformV1>();
  for (const row of review.platforms) {
    if (result.has(row.platform)) throw new Error(`duplicate connector health platform: ${row.platform}`);
    result.set(row.platform, row);
  }
  return result;
}

function channelCard(
  channel: SocialChannelDrilldownV1,
  connector: SocialConnectorHealthPlatformV1 | null,
  reasons: SocialExecutiveOverviewReasonV1[]
): SocialExecutiveChannelCardV1 {
  const connectorCurrent = connector?.canonicalDataState === "CURRENT" && connector.liveFirstPartyDataProven === true;
  const channelCurrent = channel.availability === "READY" && channel.sourceHealth.freshness === "FRESH";
  if (!connector) reasons.push("CHANNEL_CONNECTOR_HEALTH_MISSING");
  else if (channelCurrent !== connectorCurrent) reasons.push("CHANNEL_CONNECTOR_TRUTH_MISMATCH");
  const decisionGrade = channelCurrent && connectorCurrent && connector?.sourceHealth === "HEALTHY";
  if (!decisionGrade) reasons.push("CHANNEL_NOT_DECISION_GRADE");

  return freeze<SocialExecutiveChannelCardV1>({
    platform: channel.platform,
    accountId: nonEmpty(channel.accountId, "channel.accountId"),
    handle: channel.handle,
    window: channel.window,
    availability: channel.availability,
    sourceState: channel.sourceHealth.state,
    sourceFreshness: channel.sourceHealth.freshness,
    connectorSourceHealth: connector?.sourceHealth ?? null,
    canonicalDataState: connector?.canonicalDataState ?? null,
    liveFirstPartyDataProven: connector?.liveFirstPartyDataProven ?? false,
    decisionGrade,
    audience: audienceMetric(channel, "AUDIENCE_TOTAL"),
    netNewAudience: audienceMetric(channel, "NET_NEW_AUDIENCE"),
    warningCodes: unique(channel.warnings.map((warning) => warning.code)),
    limitations: unique([...(channel.sourceHealth.limitations ?? []), ...(connector?.limitations ?? [])]),
    evidenceRefs: unique([...(channel.evidenceRefs ?? []), ...(connector?.evidenceRefs ?? [])]),
    uniqueAudienceClaim: false
  });
}

function topOutperformerPerPlatform(review: SocialContentPerformanceReviewV1): SocialExecutiveContentHighlightV1[] {
  const groups = new Map<SocialPlatformV1, SocialContentPerformanceItemV1[]>();
  for (const item of review.outperformers) {
    const rows = groups.get(item.platform) ?? [];
    rows.push(item);
    groups.set(item.platform, rows);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([platform, rows]) => {
      const top = [...rows].sort((a, b) =>
        b.ratioToComparableMedian - a.ratioToComparableMedian ||
        a.contentId.localeCompare(b.contentId) ||
        a.metric.localeCompare(b.metric)
      )[0];
      return freeze<SocialExecutiveContentHighlightV1>({
        platform,
        accountId: top.accountId,
        contentId: top.contentId,
        metric: top.metric,
        classification: top.classification,
        ratioToComparableMedian: top.ratioToComparableMedian,
        evidenceRefs: unique(top.evidenceRefs),
        interpretation: "WITHIN_PLATFORM_ACCOUNT_AGE_FORMAT_AMPLIFICATION_BASELINE_ONLY",
        crossPlatformWinnerClaim: false,
        causalClaim: false,
        attributionClaim: false
      });
    });
}

function businessValuePerPlatform(review: SocialContentBusinessValueReviewV1): SocialExecutiveBusinessValueHighlightV1[] {
  const groups = new Map<SocialPlatformV1, SocialContentBusinessValueReviewItemV1[]>();
  for (const item of review.items.filter((row) => row.businessValueState !== "NOT_ESTABLISHED")) {
    const rows = groups.get(item.platform) ?? [];
    rows.push(item);
    groups.set(item.platform, rows);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([platform, rows]) => {
      const top = [...rows].sort((a, b) =>
        b.directTrackedOutcomeCount - a.directTrackedOutcomeCount ||
        b.linkedOutcomeCount - a.linkedOutcomeCount ||
        a.contentRef.localeCompare(b.contentRef)
      )[0];
      return freeze<SocialExecutiveBusinessValueHighlightV1>({
        platform,
        accountId: top.accountId,
        contentId: top.contentId,
        contentRef: top.contentRef,
        businessValueState: top.businessValueState,
        directTrackedOutcomeCount: top.directTrackedOutcomeCount,
        linkedOutcomeCount: top.linkedOutcomeCount,
        highIntentMetrics: freeze([...top.highIntentMetrics]),
        evidenceRefs: unique([...top.performanceEvidenceRefs, ...top.outcomeEvidenceRefs]),
        crossPlatformWinnerClaim: false,
        causalClaim: false,
        revenueAttributionClaim: false,
        monetaryValue: null
      });
    });
}

function recommendedActions(queue: SocialContentOpportunityQueueV1, limit: number): SocialExecutiveRecommendedActionV1[] {
  return [...queue.opportunities]
    .sort((a, b) => a.rank - b.rank || a.opportunityId.localeCompare(b.opportunityId))
    .slice(0, limit)
    .map((item) => freeze<SocialExecutiveRecommendedActionV1>({
      opportunityId: item.opportunityId,
      rank: item.rank,
      priority: item.priority,
      targetPlatform: item.targetPlatform,
      sourcePlatform: item.sourcePlatform,
      observedMechanism: item.observedMechanism,
      experimentPlan: item.experimentPlan,
      successMetricPlan: item.successMetricPlan,
      evidenceRefs: unique(item.firstPartyEvidenceRefs),
      requiresApprovalForPosting: true,
      executionAuthority: "NONE",
      confidence: null,
      causalClaim: false,
      revenueAttributionClaim: false,
      competitorPerformanceClaim: false
    }));
}

function alertCandidate(item: SocialMaterialAlertReadinessItemV1): SocialExecutiveAlertReviewV1 {
  return freeze<SocialExecutiveAlertReviewV1>({
    signalId: item.signalId,
    platform: item.platform,
    accountId: item.accountId,
    metric: item.metric,
    window: item.window,
    direction: item.direction,
    independentSupportingSourceCount: item.independentSupportingSourceCount,
    evidenceRefs: unique(item.evidenceRefs),
    eligibleForNotification: false,
    notificationAuthority: "NONE",
    causalClaim: false,
    attributionClaim: false,
    competitorPerformanceClaim: false,
    relationshipClaim: false,
    endorsementClaim: false
  });
}

function component(
  name: SocialExecutiveOverviewComponentV1["component"],
  state: SocialExecutiveOverviewComponentStateV1,
  observedAt: string | null,
  reasons: readonly SocialExecutiveOverviewReasonV1[]
): SocialExecutiveOverviewComponentV1 {
  return freeze<SocialExecutiveOverviewComponentV1>({ component: name, state, observedAt, reasons: uniqueReasons(reasons) });
}

export function compileSocialExecutiveOverviewV1(input: SocialExecutiveOverviewInputV1): SocialExecutiveOverviewV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.channelDrilldowns)) throw new Error("channelDrilldowns must be an array");
  if (!Array.isArray(input.alertReadiness)) throw new Error("alertReadiness must be an array");
  if (input.channelDrilldowns.length > SOCIAL_EXECUTIVE_OVERVIEW_MAX_CHANNELS_V1) throw new Error("too many channel drilldowns");
  if (input.alertReadiness.length > SOCIAL_EXECUTIVE_OVERVIEW_MAX_ALERT_REVIEWS_V1) throw new Error("too many alert readiness reviews");
  if (!Number.isFinite(input.maxEvidenceAgeHours) || input.maxEvidenceAgeHours <= 0) {
    throw new Error("maxEvidenceAgeHours must be a finite positive number");
  }
  const maxRecommendedActions = input.maxRecommendedActions ?? 3;
  if (!Number.isInteger(maxRecommendedActions) || maxRecommendedActions < 1 || maxRecommendedActions > SOCIAL_EXECUTIVE_OVERVIEW_MAX_ACTIONS_V1) {
    throw new Error(`maxRecommendedActions must be an integer between 1 and ${SOCIAL_EXECUTIVE_OVERVIEW_MAX_ACTIONS_V1}`);
  }

  const generatedAt = iso(input.generatedAt, "generatedAt");
  const generatedAtMs = Date.parse(generatedAt);
  assertConnectorAuthority(input.connectorHealth);
  assertPerformanceAuthority(input.performanceReview);
  assertBusinessValueAuthority(input.businessValueReview);
  assertQueueAuthority(input.opportunityQueue);
  input.channelDrilldowns.forEach(assertChannelAuthority);
  input.alertReadiness.forEach(assertAlertAuthority);

  const reasons: SocialExecutiveOverviewReasonV1[] = [];
  const components: SocialExecutiveOverviewComponentV1[] = [];

  const connectorObserved = componentAge(
    input.connectorHealth.generatedAt,
    generatedAtMs,
    input.maxEvidenceAgeHours,
    "CONNECTOR_HEALTH_STALE",
    "connectorHealth.generatedAt"
  );
  const connectorReasons: SocialExecutiveOverviewReasonV1[] = [];
  if (connectorObserved.staleReason) connectorReasons.push(connectorObserved.staleReason);
  const connectorOperationalGap = input.connectorHealth.platforms.some((row) =>
    row.sourceHealth !== "HEALTHY" && row.sourceHealth !== "NOT_APPLICABLE"
  );
  if (connectorOperationalGap) connectorReasons.push("CONNECTOR_HEALTH_NOT_FULLY_OPERATIONAL");
  reasons.push(...connectorReasons);
  components.push(component(
    "CONNECTOR_HEALTH",
    connectorObserved.stale ? "VERIFY_REQUIRED" : connectorOperationalGap ? "PARTIAL" : "CURRENT",
    connectorObserved.observedAt,
    connectorReasons
  ));

  const connectorMap = connectorByPlatform(input.connectorHealth);
  const seenChannel = new Set<string>();
  const channelReasons: SocialExecutiveOverviewReasonV1[] = [];
  const cards = input.channelDrilldowns
    .map((channel) => {
      if (channel.window !== input.window) throw new Error(`channel ${channel.platform}:${channel.accountId} window mismatch`);
      const identity = `${channel.platform}\u0000${channel.accountId}`;
      if (seenChannel.has(identity)) throw new Error(`duplicate channel identity: ${channel.platform}:${channel.accountId}`);
      seenChannel.add(identity);
      return channelCard(channel, connectorMap.get(channel.platform) ?? null, channelReasons);
    })
    .sort((a, b) => a.platform.localeCompare(b.platform) || a.accountId.localeCompare(b.accountId));
  reasons.push(...channelReasons);
  const channelState: SocialExecutiveOverviewComponentStateV1 = channelReasons.includes("CHANNEL_CONNECTOR_TRUTH_MISMATCH") || channelReasons.includes("CHANNEL_CONNECTOR_HEALTH_MISSING")
    ? "VERIFY_REQUIRED"
    : cards.every((card) => card.decisionGrade)
      ? "CURRENT"
      : "PARTIAL";
  components.push(component("CHANNEL_DRILLDOWNS", channelState, null, channelReasons));

  const performanceObserved = componentAge(
    input.performanceReview.evaluatedAt,
    generatedAtMs,
    input.maxEvidenceAgeHours,
    "CONTENT_PERFORMANCE_STALE",
    "performanceReview.evaluatedAt"
  );
  const performanceReasons: SocialExecutiveOverviewReasonV1[] = [];
  if (performanceObserved.staleReason) performanceReasons.push(performanceObserved.staleReason);
  if (input.performanceReview.status !== "READY") performanceReasons.push("CONTENT_PERFORMANCE_NOT_READY");
  reasons.push(...performanceReasons);
  const performanceState: SocialExecutiveOverviewComponentStateV1 = performanceObserved.stale || input.performanceReview.status === "VERIFY_REQUIRED"
    ? "VERIFY_REQUIRED"
    : input.performanceReview.status === "READY"
      ? "CURRENT"
      : "PARTIAL";
  components.push(component("CONTENT_PERFORMANCE", performanceState, performanceObserved.observedAt, performanceReasons));
  const performanceCurrent = performanceState === "CURRENT";

  const businessObserved = componentAge(
    input.businessValueReview.evaluatedAt,
    generatedAtMs,
    input.maxEvidenceAgeHours,
    "BUSINESS_VALUE_STALE",
    "businessValueReview.evaluatedAt"
  );
  const businessReasons: SocialExecutiveOverviewReasonV1[] = [];
  if (businessObserved.staleReason) businessReasons.push(businessObserved.staleReason);
  if (input.businessValueReview.status !== "READY") businessReasons.push("BUSINESS_VALUE_NOT_READY");
  reasons.push(...businessReasons);
  const businessState: SocialExecutiveOverviewComponentStateV1 = businessObserved.stale || input.businessValueReview.status === "VERIFY_REQUIRED"
    ? "VERIFY_REQUIRED"
    : input.businessValueReview.status === "READY"
      ? "CURRENT"
      : "PARTIAL";
  components.push(component("BUSINESS_VALUE", businessState, businessObserved.observedAt, businessReasons));
  const businessCurrent = businessState === "CURRENT";

  const queueObserved = componentAge(
    input.opportunityQueue.generatedAt,
    generatedAtMs,
    input.maxEvidenceAgeHours,
    "OPPORTUNITY_QUEUE_STALE",
    "opportunityQueue.generatedAt"
  );
  const queueReasons: SocialExecutiveOverviewReasonV1[] = [];
  if (queueObserved.staleReason) queueReasons.push(queueObserved.staleReason);
  if (input.opportunityQueue.status !== "READY") queueReasons.push("OPPORTUNITY_QUEUE_NOT_READY");
  reasons.push(...queueReasons);
  const queueState: SocialExecutiveOverviewComponentStateV1 = queueObserved.stale
    ? "VERIFY_REQUIRED"
    : input.opportunityQueue.status === "READY"
      ? "CURRENT"
      : "PARTIAL";
  components.push(component("OPPORTUNITY_QUEUE", queueState, queueObserved.observedAt, queueReasons));
  const queueCurrent = queueState === "CURRENT";

  const alertReasons: SocialExecutiveOverviewReasonV1[] = [];
  let newestAlertAt: string | null = null;
  let alertState: SocialExecutiveOverviewComponentStateV1 = "CURRENT";
  const alertCandidates: SocialExecutiveAlertReviewV1[] = [];
  for (const [index, review] of input.alertReadiness.entries()) {
    const observed = componentAge(
      review.evaluatedAt,
      generatedAtMs,
      input.maxEvidenceAgeHours,
      "ALERT_READINESS_STALE",
      `alertReadiness[${index}].evaluatedAt`
    );
    if (!newestAlertAt || Date.parse(observed.observedAt) > Date.parse(newestAlertAt)) newestAlertAt = observed.observedAt;
    if (observed.staleReason) {
      alertReasons.push(observed.staleReason);
      alertState = "VERIFY_REQUIRED";
    }
    if (review.status === "VERIFY_REQUIRED") {
      alertReasons.push("ALERT_READINESS_NOT_READY");
      alertState = "VERIFY_REQUIRED";
    }
    if (!observed.stale && review.status !== "VERIFY_REQUIRED") {
      for (const item of review.items.filter((row) => row.state === "READY_FOR_ALERT_REVIEW")) {
        alertCandidates.push(alertCandidate(item));
      }
    }
  }
  reasons.push(...alertReasons);
  components.push(component("ALERT_READINESS", alertState, newestAlertAt, alertReasons));

  const status: SocialExecutiveOverviewStatusV1 = components.some((row) => row.state === "VERIFY_REQUIRED")
    ? "VERIFY_REQUIRED"
    : components.some((row) => row.state === "PARTIAL")
      ? "PARTIAL"
      : "READY";

  return freeze<SocialExecutiveOverviewV1>({
    contractVersion: SOCIAL_EXECUTIVE_OVERVIEW_V1_VERSION,
    generatedAt,
    window: input.window,
    status,
    reasons: uniqueReasons(reasons),
    components,
    channelCards: cards,
    audienceTotalAcrossPlatforms: null,
    audienceOverlapKnown: false,
    audienceRollupState: "NOT_ESTABLISHED",
    contentHighlightsByPlatform: performanceCurrent ? topOutperformerPerPlatform(input.performanceReview) : [],
    strongestContentWinnerAcrossPlatforms: null,
    businessValueHighlightsByPlatform: businessCurrent ? businessValuePerPlatform(input.businessValueReview) : [],
    strongestBusinessValueContentAcrossPlatforms: null,
    recommendedActions: queueCurrent ? recommendedActions(input.opportunityQueue, maxRecommendedActions) : [],
    alertReviewCandidates: freeze(alertCandidates.sort((a, b) => a.platform.localeCompare(b.platform) || a.signalId.localeCompare(b.signalId))),
    guardrails: [
      "Platform-native audience totals are never summed into a unique cross-platform audience because overlap is unknown.",
      "Content performance highlights are selected only within each platform from the canonical age/format/amplification-normalized review; no cross-platform winner is inferred.",
      "Business-value highlights preserve tracked/high-intent evidence without creating revenue attribution, causality, or monetary value.",
      "Recommended actions preserve the existing governed queue order and remain experiment proposals with no execution authority.",
      "Alert candidates remain internal review candidates; this overview grants no notification authority.",
      "Stale, future-dated, authority-widened, connector-mismatched, or non-ready evidence is withheld or marked for verification rather than converted to zero or certainty."
    ],
    crossPlatformMetricAggregationPerformed: false,
    crossPlatformPerformanceRankingPerformed: false,
    causalClaim: false,
    attributionClaim: false,
    competitorPerformanceClaim: false,
    relationshipClaim: false,
    endorsementClaim: false,
    notificationAuthority: "NONE",
    postingAuthority: "NONE",
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
