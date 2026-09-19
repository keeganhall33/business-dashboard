import type {
  SocialHistoryWindowV1,
  SocialMetricKeyV1,
  SocialPlatformV1
} from "./social-canonical-v1";
import type {
  SocialChannelDrilldownV1,
  SocialChannelMetricStateV1
} from "./social-channel-drilldown-v1";
import type {
  SocialConnectorHealthPlatformV1,
  SocialConnectorHealthReviewV1
} from "./social-connector-health-review-v1";
import type {
  SocialContentPerformanceReviewV1
} from "./social-content-performance-review-v1";
import type {
  SocialContentBusinessValueReviewV1
} from "./social-content-business-value-review-v1";
import type {
  SocialContentOpportunityPriorityV1,
  SocialContentOpportunityQueueV1
} from "./social-content-opportunity-queue-v1";
import type {
  SocialMaterialAlertReadinessV1
} from "./social-material-alert-readiness-v1";

export const SOCIAL_EXECUTIVE_OVERVIEW_V1_VERSION = "SocialExecutiveOverviewV1" as const;
export const SOCIAL_EXECUTIVE_OVERVIEW_MAX_CHANNELS_V1 = 20;
export const SOCIAL_EXECUTIVE_OVERVIEW_MAX_ALERT_REVIEWS_V1 = 20;
export const SOCIAL_EXECUTIVE_OVERVIEW_MAX_ACTIONS_V1 = 5;

export type SocialExecutiveOverviewStatusV1 = "READY" | "PARTIAL" | "VERIFY_REQUIRED";
export type SocialExecutiveOverviewComponentStateV1 = "CURRENT" | "PARTIAL" | "VERIFY_REQUIRED";
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

export type SocialExecutiveOverviewComponentV1 = Readonly<{
  component: "CONNECTOR_HEALTH" | "CHANNEL_DRILLDOWNS" | "CONTENT_PERFORMANCE" | "BUSINESS_VALUE" | "OPPORTUNITY_QUEUE" | "ALERT_READINESS";
  state: SocialExecutiveOverviewComponentStateV1;
  observedAt: string | null;
  reasons: readonly SocialExecutiveOverviewReasonV1[];
}>;

export type SocialExecutiveAudienceMetricV1 = Readonly<{
  metric: "AUDIENCE_TOTAL" | "NET_NEW_AUDIENCE";
  value: number | null;
  priorValue: number | null;
  absoluteDelta: number | null;
  percentageDelta: number | null;
  direction: "UP" | "DOWN" | "FLAT" | "UNKNOWN";
  state: SocialChannelMetricStateV1;
  decisionGrade: boolean;
  evidenceRefs: readonly string[];
}>;

export type SocialExecutiveChannelCardV1 = Readonly<{
  platform: SocialPlatformV1;
  accountId: string;
  handle: string | null;
  window: SocialHistoryWindowV1;
  availability: "READY" | "PARTIAL" | "NEEDS_CONNECTION" | "NEEDS_IMPLEMENTATION" | "UNAVAILABLE";
  sourceState: string;
  sourceFreshness: "FRESH" | "STALE" | "NEVER_SYNCED";
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
  metric: SocialMetricKeyV1;
  classification: "OUTPERFORMING";
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
  businessValueState: "TRACKED_BUSINESS_SIGNAL" | "HIGH_INTENT_PLATFORM_SIGNAL";
  directTrackedOutcomeCount: number;
  linkedOutcomeCount: number;
  highIntentMetrics: readonly SocialMetricKeyV1[];
  evidenceRefs: readonly string[];
  crossPlatformWinnerClaim: false;
  causalClaim: false;
  revenueAttributionClaim: false;
  monetaryValue: null;
}>;

export type SocialExecutiveRecommendedActionV1 = Readonly<{
  opportunityId: string;
  rank: number;
  priority: SocialContentOpportunityPriorityV1;
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

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function requireIso(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!value || Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function uniqueReasons(values: readonly SocialExecutiveOverviewReasonV1[]): SocialExecutiveOverviewReasonV1[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function evidenceAge(
  observedAt: string,
  generatedAtMs: number,
  maxAgeHours: number,
  field: string
): { observedAt: string; stale: boolean } {
  const normalized = requireIso(observedAt, field);
  const observedMs = Date.parse(normalized);
  if (observedMs > generatedAtMs) throw new Error(`${field} cannot be in the future`);
  return { observedAt: normalized, stale: generatedAtMs - observedMs > maxAgeHours * 3_600_000 };
}

function assertAuthority(input: SocialExecutiveOverviewInputV1): void {
  if (input.connectorHealth.contractVersion !== "SocialConnectorHealthReviewV1") throw new Error("connectorHealth contractVersion is invalid");
  if (input.connectorHealth.externalAccessPerformed !== false || input.connectorHealth.writesPerformed !== false) throw new Error("connectorHealth widens action authority");
  for (const row of input.connectorHealth.platforms) {
    if (row.readOnly !== true || row.writesPerformed !== false) throw new Error("connectorHealth platform widens action authority");
  }
  for (const channel of input.channelDrilldowns) {
    if (channel.contractVersion !== "SocialChannelDrilldownV1") throw new Error("channelDrilldown contractVersion is invalid");
    if (channel.crossPlatformAggregationPerformed !== false || channel.causalAttributionClaimed !== false || channel.externalAccessPerformed !== false || channel.writesPerformed !== false) {
      throw new Error("channelDrilldown widens interpretation or action authority");
    }
  }
  const performance = input.performanceReview;
  if (performance.contractVersion !== "SocialContentPerformanceReviewV1") throw new Error("performanceReview contractVersion is invalid");
  if (performance.interpretation !== "WITHIN_PLATFORM_ACCOUNT_AGE_FORMAT_AMPLIFICATION_BASELINE_ONLY" || performance.causalClaim !== false || performance.attributionClaim !== false || performance.competitorPerformanceClaim !== false || performance.endorsementClaim !== false || performance.crossPlatformPerformanceComparisonAuthority !== "NONE" || performance.recommendationAuthority !== "NONE" || performance.providerWriteAuthority !== "NONE" || performance.notificationAuthority !== "NONE" || performance.externalAccessPerformed !== false || performance.writesPerformed !== false) {
    throw new Error("performanceReview widens interpretation or action authority");
  }
  const business = input.businessValueReview;
  if (business.contractVersion !== "SocialContentBusinessValueReviewV1") throw new Error("businessValueReview contractVersion is invalid");
  if (business.causalClaim !== false || business.revenueAttributionClaim !== false || business.monetaryValue !== null || business.competitorPerformanceClaim !== false || business.endorsementClaim !== false || business.recommendationAuthority !== "NONE" || business.providerWriteAuthority !== "NONE" || business.notificationAuthority !== "NONE" || business.externalAccessPerformed !== false || business.writesPerformed !== false) {
    throw new Error("businessValueReview widens interpretation or action authority");
  }
  const queue = input.opportunityQueue;
  if (queue.contractVersion !== "SocialContentOpportunityQueueV1") throw new Error("opportunityQueue contractVersion is invalid");
  if (queue.postingAuthority !== "NONE" || queue.externalAccessPerformed !== false || queue.writesPerformed !== false || queue.opportunities.some((item) => item.executionAuthority !== "NONE" || item.publicPostingRequiresApproval !== true || item.confidence !== null)) {
    throw new Error("opportunityQueue widens action authority or confidence");
  }
  for (const review of input.alertReadiness) {
    if (review.contractVersion !== "SocialMaterialAlertReadinessV1") throw new Error("alertReadiness contractVersion is invalid");
    if (review.notificationAuthority !== "NONE" || review.externalAccessPerformed !== false || review.writesPerformed !== false || review.items.some((item) => item.eligibleForNotification !== false)) {
      throw new Error("alertReadiness widens action authority");
    }
  }
}

function audienceMetric(channel: SocialChannelDrilldownV1, key: "AUDIENCE_TOTAL" | "NET_NEW_AUDIENCE"): SocialExecutiveAudienceMetricV1 {
  const row = channel.metrics.find((metric) => metric.key === key);
  if (!row) {
    return deepFreeze({ metric: key, value: null, priorValue: null, absoluteDelta: null, percentageDelta: null, direction: "UNKNOWN", state: "UNKNOWN", decisionGrade: false, evidenceRefs: [] });
  }
  return deepFreeze({
    metric: key,
    value: row.value,
    priorValue: row.priorValue,
    absoluteDelta: row.absoluteDelta,
    percentageDelta: row.percentageDelta,
    direction: row.direction,
    state: row.state,
    decisionGrade: row.decisionGrade,
    evidenceRefs: unique(row.evidenceRefs)
  });
}

function component(name: SocialExecutiveOverviewComponentV1["component"], state: SocialExecutiveOverviewComponentStateV1, observedAt: string | null, reasons: readonly SocialExecutiveOverviewReasonV1[]): SocialExecutiveOverviewComponentV1 {
  return deepFreeze({ component: name, state, observedAt, reasons: uniqueReasons(reasons) });
}

export function compileSocialExecutiveOverviewV1(input: SocialExecutiveOverviewInputV1): SocialExecutiveOverviewV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.channelDrilldowns) || input.channelDrilldowns.length > SOCIAL_EXECUTIVE_OVERVIEW_MAX_CHANNELS_V1) throw new Error("channelDrilldowns are invalid");
  if (!Array.isArray(input.alertReadiness) || input.alertReadiness.length > SOCIAL_EXECUTIVE_OVERVIEW_MAX_ALERT_REVIEWS_V1) throw new Error("alertReadiness is invalid");
  if (!Number.isFinite(input.maxEvidenceAgeHours) || input.maxEvidenceAgeHours <= 0) throw new Error("maxEvidenceAgeHours must be a finite positive number");
  const maxActions = input.maxRecommendedActions ?? 3;
  if (!Number.isInteger(maxActions) || maxActions < 1 || maxActions > SOCIAL_EXECUTIVE_OVERVIEW_MAX_ACTIONS_V1) throw new Error("maxRecommendedActions is invalid");

  const generatedAt = requireIso(input.generatedAt, "generatedAt");
  const generatedAtMs = Date.parse(generatedAt);
  assertAuthority(input);

  const reasons: SocialExecutiveOverviewReasonV1[] = [];
  const components: SocialExecutiveOverviewComponentV1[] = [];

  const connectorAge = evidenceAge(input.connectorHealth.generatedAt, generatedAtMs, input.maxEvidenceAgeHours, "connectorHealth.generatedAt");
  const connectorReasons: SocialExecutiveOverviewReasonV1[] = [];
  if (connectorAge.stale) connectorReasons.push("CONNECTOR_HEALTH_STALE");
  if (input.connectorHealth.platforms.some((row) => row.sourceHealth !== "HEALTHY" && row.sourceHealth !== "NOT_APPLICABLE")) connectorReasons.push("CONNECTOR_HEALTH_NOT_FULLY_OPERATIONAL");
  reasons.push(...connectorReasons);
  components.push(component("CONNECTOR_HEALTH", connectorAge.stale ? "VERIFY_REQUIRED" : connectorReasons.length ? "PARTIAL" : "CURRENT", connectorAge.observedAt, connectorReasons));

  const connectorByPlatform = new Map<SocialPlatformV1, SocialConnectorHealthPlatformV1>();
  for (const row of input.connectorHealth.platforms) {
    if (connectorByPlatform.has(row.platform)) throw new Error(`duplicate connector health platform: ${row.platform}`);
    connectorByPlatform.set(row.platform, row);
  }

  const channelReasons: SocialExecutiveOverviewReasonV1[] = [];
  const seenChannels = new Set<string>();
  const channelCards: SocialExecutiveChannelCardV1[] = [];
  for (const channel of input.channelDrilldowns) {
    if (channel.window !== input.window) throw new Error(`channel ${channel.platform}:${channel.accountId} window mismatch`);
    const identity = `${channel.platform}\u0000${channel.accountId}`;
    if (seenChannels.has(identity)) throw new Error(`duplicate channel identity: ${channel.platform}:${channel.accountId}`);
    seenChannels.add(identity);
    const connector = connectorByPlatform.get(channel.platform) ?? null;
    const channelCurrent = channel.availability === "READY" && channel.sourceHealth.freshness === "FRESH";
    const connectorCurrent = connector !== null && connector.canonicalDataState === "CURRENT" && connector.liveFirstPartyDataProven === true;
    if (!connector) channelReasons.push("CHANNEL_CONNECTOR_HEALTH_MISSING");
    else if (channelCurrent !== connectorCurrent) channelReasons.push("CHANNEL_CONNECTOR_TRUTH_MISMATCH");
    const decisionGrade = channelCurrent && connectorCurrent && connector?.sourceHealth === "HEALTHY";
    if (!decisionGrade) channelReasons.push("CHANNEL_NOT_DECISION_GRADE");
    channelCards.push(deepFreeze({
      platform: channel.platform,
      accountId: channel.accountId,
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
      uniqueAudienceClaim: false as const
    }));
  }
  channelCards.sort((a, b) => a.platform.localeCompare(b.platform) || a.accountId.localeCompare(b.accountId));
  reasons.push(...channelReasons);
  const channelState: SocialExecutiveOverviewComponentStateV1 = channelReasons.includes("CHANNEL_CONNECTOR_HEALTH_MISSING") || channelReasons.includes("CHANNEL_CONNECTOR_TRUTH_MISMATCH") ? "VERIFY_REQUIRED" : channelCards.every((card) => card.decisionGrade) ? "CURRENT" : "PARTIAL";
  components.push(component("CHANNEL_DRILLDOWNS", channelState, null, channelReasons));

  const performanceAge = evidenceAge(input.performanceReview.evaluatedAt, generatedAtMs, input.maxEvidenceAgeHours, "performanceReview.evaluatedAt");
  const performanceReasons: SocialExecutiveOverviewReasonV1[] = [];
  if (performanceAge.stale) performanceReasons.push("CONTENT_PERFORMANCE_STALE");
  if (input.performanceReview.status !== "READY") performanceReasons.push("CONTENT_PERFORMANCE_NOT_READY");
  const performanceState: SocialExecutiveOverviewComponentStateV1 = performanceAge.stale || input.performanceReview.status === "VERIFY_REQUIRED" ? "VERIFY_REQUIRED" : input.performanceReview.status === "READY" ? "CURRENT" : "PARTIAL";
  reasons.push(...performanceReasons);
  components.push(component("CONTENT_PERFORMANCE", performanceState, performanceAge.observedAt, performanceReasons));

  const contentHighlightsByPlatform: SocialExecutiveContentHighlightV1[] = [];
  if (performanceState === "CURRENT") {
    const platforms = [...new Set(input.performanceReview.outperformers.map((row) => row.platform))].sort();
    for (const platform of platforms) {
      const top = input.performanceReview.outperformers.filter((row) => row.platform === platform).sort((a, b) => b.ratioToComparableMedian - a.ratioToComparableMedian || a.contentId.localeCompare(b.contentId))[0];
      if (!top) continue;
      contentHighlightsByPlatform.push(deepFreeze({
        platform: top.platform,
        accountId: top.accountId,
        contentId: top.contentId,
        metric: top.metric,
        classification: "OUTPERFORMING" as const,
        ratioToComparableMedian: top.ratioToComparableMedian,
        evidenceRefs: unique(top.evidenceRefs),
        interpretation: "WITHIN_PLATFORM_ACCOUNT_AGE_FORMAT_AMPLIFICATION_BASELINE_ONLY" as const,
        crossPlatformWinnerClaim: false as const,
        causalClaim: false as const,
        attributionClaim: false as const
      }));
    }
  }

  const businessAge = evidenceAge(input.businessValueReview.evaluatedAt, generatedAtMs, input.maxEvidenceAgeHours, "businessValueReview.evaluatedAt");
  const businessReasons: SocialExecutiveOverviewReasonV1[] = [];
  if (businessAge.stale) businessReasons.push("BUSINESS_VALUE_STALE");
  if (input.businessValueReview.status !== "READY") businessReasons.push("BUSINESS_VALUE_NOT_READY");
  const businessState: SocialExecutiveOverviewComponentStateV1 = businessAge.stale || input.businessValueReview.status === "VERIFY_REQUIRED" ? "VERIFY_REQUIRED" : input.businessValueReview.status === "READY" ? "CURRENT" : "PARTIAL";
  reasons.push(...businessReasons);
  components.push(component("BUSINESS_VALUE", businessState, businessAge.observedAt, businessReasons));

  const businessValueHighlightsByPlatform: SocialExecutiveBusinessValueHighlightV1[] = [];
  if (businessState === "CURRENT") {
    const established = input.businessValueReview.items.filter((row) => row.businessValueState !== "NOT_ESTABLISHED");
    const platforms = [...new Set(established.map((row) => row.platform))].sort();
    for (const platform of platforms) {
      const top = established.filter((row) => row.platform === platform).sort((a, b) => b.directTrackedOutcomeCount - a.directTrackedOutcomeCount || b.linkedOutcomeCount - a.linkedOutcomeCount || a.contentRef.localeCompare(b.contentRef))[0];
      if (!top || top.businessValueState === "NOT_ESTABLISHED") continue;
      businessValueHighlightsByPlatform.push(deepFreeze({
        platform: top.platform,
        accountId: top.accountId,
        contentId: top.contentId,
        contentRef: top.contentRef,
        businessValueState: top.businessValueState,
        directTrackedOutcomeCount: top.directTrackedOutcomeCount,
        linkedOutcomeCount: top.linkedOutcomeCount,
        highIntentMetrics: [...top.highIntentMetrics],
        evidenceRefs: unique([...top.performanceEvidenceRefs, ...top.outcomeEvidenceRefs]),
        crossPlatformWinnerClaim: false as const,
        causalClaim: false as const,
        revenueAttributionClaim: false as const,
        monetaryValue: null
      }));
    }
  }

  const queueAge = evidenceAge(input.opportunityQueue.generatedAt, generatedAtMs, input.maxEvidenceAgeHours, "opportunityQueue.generatedAt");
  const queueReasons: SocialExecutiveOverviewReasonV1[] = [];
  if (queueAge.stale) queueReasons.push("OPPORTUNITY_QUEUE_STALE");
  if (input.opportunityQueue.status !== "READY") queueReasons.push("OPPORTUNITY_QUEUE_NOT_READY");
  const queueState: SocialExecutiveOverviewComponentStateV1 = queueAge.stale ? "VERIFY_REQUIRED" : input.opportunityQueue.status === "READY" ? "CURRENT" : "PARTIAL";
  reasons.push(...queueReasons);
  components.push(component("OPPORTUNITY_QUEUE", queueState, queueAge.observedAt, queueReasons));

  const recommendedActions: SocialExecutiveRecommendedActionV1[] = queueState === "CURRENT" ? [...input.opportunityQueue.opportunities]
    .sort((a, b) => a.rank - b.rank || a.opportunityId.localeCompare(b.opportunityId))
    .slice(0, maxActions)
    .map((item) => deepFreeze({
      opportunityId: item.opportunityId,
      rank: item.rank,
      priority: item.priority,
      targetPlatform: item.targetPlatform,
      sourcePlatform: item.sourcePlatform,
      observedMechanism: item.observedMechanism,
      experimentPlan: item.experimentPlan,
      successMetricPlan: item.successMetricPlan,
      evidenceRefs: unique(item.firstPartyEvidenceRefs),
      requiresApprovalForPosting: true as const,
      executionAuthority: "NONE" as const,
      confidence: null,
      causalClaim: false as const,
      revenueAttributionClaim: false as const,
      competitorPerformanceClaim: false as const
    })) : [];

  const alertReasons: SocialExecutiveOverviewReasonV1[] = [];
  const alertReviewCandidates: SocialExecutiveAlertReviewV1[] = [];
  let newestAlertAt: string | null = null;
  let alertState: SocialExecutiveOverviewComponentStateV1 = "CURRENT";
  for (const [index, review] of input.alertReadiness.entries()) {
    const age = evidenceAge(review.evaluatedAt, generatedAtMs, input.maxEvidenceAgeHours, `alertReadiness[${index}].evaluatedAt`);
    if (!newestAlertAt || Date.parse(age.observedAt) > Date.parse(newestAlertAt)) newestAlertAt = age.observedAt;
    if (age.stale) {
      alertReasons.push("ALERT_READINESS_STALE");
      alertState = "VERIFY_REQUIRED";
    }
    if (review.status === "VERIFY_REQUIRED") {
      alertReasons.push("ALERT_READINESS_NOT_READY");
      alertState = "VERIFY_REQUIRED";
    }
    if (!age.stale && review.status !== "VERIFY_REQUIRED") {
      for (const item of review.items) {
        if (item.state !== "READY_FOR_ALERT_REVIEW") continue;
        alertReviewCandidates.push(deepFreeze({
          signalId: item.signalId,
          platform: item.platform,
          accountId: item.accountId,
          metric: item.metric,
          window: item.window,
          direction: item.direction,
          independentSupportingSourceCount: item.independentSupportingSourceCount,
          evidenceRefs: unique(item.evidenceRefs),
          eligibleForNotification: false as const,
          notificationAuthority: "NONE" as const,
          causalClaim: false as const,
          attributionClaim: false as const,
          competitorPerformanceClaim: false as const,
          relationshipClaim: false as const,
          endorsementClaim: false as const
        }));
      }
    }
  }
  reasons.push(...alertReasons);
  components.push(component("ALERT_READINESS", alertState, newestAlertAt, alertReasons));
  alertReviewCandidates.sort((a, b) => a.platform.localeCompare(b.platform) || a.signalId.localeCompare(b.signalId));

  const status: SocialExecutiveOverviewStatusV1 = components.some((row) => row.state === "VERIFY_REQUIRED") ? "VERIFY_REQUIRED" : components.some((row) => row.state === "PARTIAL") ? "PARTIAL" : "READY";

  return deepFreeze({
    contractVersion: SOCIAL_EXECUTIVE_OVERVIEW_V1_VERSION,
    generatedAt,
    window: input.window,
    status,
    reasons: uniqueReasons(reasons),
    components,
    channelCards,
    audienceTotalAcrossPlatforms: null,
    audienceOverlapKnown: false as const,
    audienceRollupState: "NOT_ESTABLISHED" as const,
    contentHighlightsByPlatform,
    strongestContentWinnerAcrossPlatforms: null,
    businessValueHighlightsByPlatform,
    strongestBusinessValueContentAcrossPlatforms: null,
    recommendedActions,
    alertReviewCandidates,
    guardrails: [
      "Platform-native audience totals are never summed into a unique cross-platform audience because overlap is unknown.",
      "Content performance highlights are selected only within each platform from the canonical age/format/amplification-normalized review; no cross-platform winner is inferred.",
      "Business-value highlights preserve tracked/high-intent evidence without creating revenue attribution, causality, or monetary value.",
      "Recommended actions preserve the existing governed queue order and remain experiment proposals with no execution authority.",
      "Alert candidates remain internal review candidates; this overview grants no notification authority.",
      "Stale, future-dated, authority-widened, connector-mismatched, or non-ready evidence is withheld or marked for verification rather than converted to zero or certainty."
    ],
    crossPlatformMetricAggregationPerformed: false as const,
    crossPlatformPerformanceRankingPerformed: false as const,
    causalClaim: false as const,
    attributionClaim: false as const,
    competitorPerformanceClaim: false as const,
    relationshipClaim: false as const,
    endorsementClaim: false as const,
    notificationAuthority: "NONE" as const,
    postingAuthority: "NONE" as const,
    externalAccessPerformed: false as const,
    writesPerformed: false as const
  });
}
