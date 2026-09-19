import assert from "node:assert/strict";
import test from "node:test";

import {
  compileSocialExecutiveOverviewV1
} from "../../src/lib/social-intelligence/social-executive-overview-v1";
import type {
  SocialChannelDrilldownV1,
  SocialChannelMetricV1
} from "../../src/lib/social-intelligence/social-channel-drilldown-v1";
import type { SocialConnectorHealthReviewV1 } from "../../src/lib/social-intelligence/social-connector-health-review-v1";
import type {
  SocialContentPerformanceItemV1,
  SocialContentPerformanceReviewV1
} from "../../src/lib/social-intelligence/social-content-performance-review-v1";
import type { SocialContentBusinessValueReviewV1 } from "../../src/lib/social-intelligence/social-content-business-value-review-v1";
import type { SocialContentOpportunityQueueV1 } from "../../src/lib/social-intelligence/social-content-opportunity-queue-v1";
import type { SocialMaterialAlertReadinessV1 } from "../../src/lib/social-intelligence/social-material-alert-readiness-v1";
import type { SocialMetricKeyV1, SocialPlatformV1 } from "../../src/lib/social-intelligence/social-canonical-v1";

const generatedAt = "2026-09-19T10:00:00Z";
const observedAt = "2026-09-19T09:30:00Z";

function metric(
  key: SocialMetricKeyV1,
  value: number | null,
  options: Partial<SocialChannelMetricV1> = {}
): SocialChannelMetricV1 {
  return {
    key,
    label: key,
    unit: "COUNT",
    definitionNote: "Within-platform provider metric.",
    coverageDeclared: true,
    state: value == null ? "UNKNOWN" : "CURRENT",
    value,
    priorValue: value == null ? null : Math.max(0, value - 10),
    absoluteDelta: value == null ? null : 10,
    percentageDelta: value == null ? null : 2,
    direction: value == null ? "UNKNOWN" : "UP",
    decisionGrade: value !== null,
    evidenceRefs: value == null ? [] : [`metric:${key}`],
    ...options
  };
}

function channel(platform: SocialPlatformV1, accountId: string, audience = 1000): SocialChannelDrilldownV1 {
  return {
    contractVersion: "SocialChannelDrilldownV1",
    snapshotId: `social:${platform.toLowerCase()}:${accountId}:2026-09-19T09:00:00.000Z`,
    platform,
    accountId,
    handle: `@${accountId}`,
    window: "30D",
    availability: "READY",
    currentPeriod: {
      periodId: `${platform}:30d:current`,
      startAt: "2026-08-20T00:00:00.000Z",
      endAt: "2026-09-19T00:00:00.000Z"
    },
    sourceHealth: {
      state: "CONNECTED_AND_INGESTING",
      freshness: "FRESH",
      lastSuccessfulSyncAt: observedAt,
      metricCoverage: ["AUDIENCE_TOTAL", "NET_NEW_AUDIENCE"],
      limitations: []
    },
    metrics: [metric("AUDIENCE_TOTAL", audience), metric("NET_NEW_AUDIENCE", 25)],
    audienceTrend: {
      points: [],
      summary: {
        direction: "UNKNOWN",
        startValue: null,
        endValue: null,
        absoluteChange: null,
        percentageChange: null,
        velocityPerDay: null,
        accelerationPerDaySquared: null
      },
      decisionGrade: false
    },
    recentContent: [],
    warnings: [],
    evidenceRefs: [`channel:${platform}:${accountId}`],
    crossPlatformAggregationPerformed: false,
    causalAttributionClaimed: false,
    externalAccessPerformed: false,
    writesPerformed: false
  } as SocialChannelDrilldownV1;
}

function connectorHealth(
  overrides: Partial<SocialConnectorHealthReviewV1> = {}
): SocialConnectorHealthReviewV1 {
  return {
    contractVersion: "SocialConnectorHealthReviewV1",
    generatedAt: observedAt,
    platforms: ["INSTAGRAM", "YOUTUBE"].map((platform) => ({
      platform: platform as SocialPlatformV1,
      connectorId: `connector:${platform}`,
      sourceHealth: "HEALTHY" as const,
      canonicalDataState: "CURRENT" as const,
      readiness: "LIVE_PROVEN" as const,
      liveFirstPartyDataProven: true,
      latestCanonicalProofAt: observedAt,
      latestProviderRunId: `run:${platform}`,
      latestProviderRunAt: observedAt,
      latestProviderRunState: "SUCCESS" as const,
      retryAfterAt: null,
      issues: [],
      limitations: [],
      evidenceRefs: [`connector:${platform}:proof`],
      needsKeeganAction: false,
      needsEngineeringAction: false,
      readOnly: true as const,
      writesPerformed: false as const
    })),
    healthyPlatforms: ["INSTAGRAM", "YOUTUBE"],
    degradedPlatforms: [],
    blockedPlatforms: [],
    platformsNeedingKeeganAction: [],
    platformsNeedingEngineeringAction: [],
    liveFirstPartyPlatforms: ["INSTAGRAM", "YOUTUBE"],
    connectorRegistry: {} as never,
    externalAccessPerformed: false,
    writesPerformed: false,
    ...overrides
  };
}

function performanceItem(
  platform: SocialPlatformV1,
  contentId: string,
  ratio: number
): SocialContentPerformanceItemV1 {
  return {
    platform,
    accountId: `${platform.toLowerCase()}-account`,
    contentId,
    publishedAt: "2026-09-15T12:00:00.000Z",
    observedAt,
    sourceState: "COMPLETE",
    amplificationType: "ORGANIC",
    ageBucket: "1_7D",
    formatKey: "process reel",
    metric: "SAVES",
    metricValue: 50,
    audienceAtObservation: 1000,
    observedPerThousandAudience: 50,
    comparableCohortSize: 8,
    comparableMedianPerThousandAudience: 20,
    ratioToComparableMedian: ratio,
    classification: "OUTPERFORMING",
    explanation: "Observed above the within-platform comparable median.",
    contentDnaRef: null,
    evidenceRefs: [`performance:${platform}:${contentId}`]
  };
}

function performanceReview(
  status: SocialContentPerformanceReviewV1["status"] = "READY",
  evaluatedAt = observedAt
): SocialContentPerformanceReviewV1 {
  const items = [
    performanceItem("INSTAGRAM", "ig-1", 1.5),
    performanceItem("INSTAGRAM", "ig-2", 2.2),
    performanceItem("YOUTUBE", "yt-1", 1.8)
  ];
  return {
    contractVersion: "SocialContentPerformanceReviewV1",
    evaluatedAt,
    status,
    reasons: [],
    items,
    outperformers: items,
    underperformers: [],
    typical: [],
    evidenceRefs: items.flatMap((item) => item.evidenceRefs),
    interpretation: "WITHIN_PLATFORM_ACCOUNT_AGE_FORMAT_AMPLIFICATION_BASELINE_ONLY",
    causalClaim: false,
    attributionClaim: false,
    competitorPerformanceClaim: false,
    endorsementClaim: false,
    crossPlatformPerformanceComparisonAuthority: "NONE",
    recommendationAuthority: "NONE",
    providerWriteAuthority: "NONE",
    notificationAuthority: "NONE",
    externalAccessPerformed: false,
    writesPerformed: false,
    guardrails: []
  };
}

function businessValueReview(
  status: SocialContentBusinessValueReviewV1["status"] = "READY",
  evaluatedAt = observedAt
): SocialContentBusinessValueReviewV1 {
  const items = [
    {
      contentRef: "INSTAGRAM:ig-1",
      platform: "INSTAGRAM" as const,
      accountId: "instagram-account",
      contentId: "ig-1",
      signals: ["HIGH_ENGAGEMENT_WITH_TRACKED_BUSINESS_SIGNAL" as const],
      businessValueState: "TRACKED_BUSINESS_SIGNAL" as const,
      reachState: "TYPICAL" as const,
      engagementState: "OUTPERFORMING" as const,
      linkedOutcomeCount: 2,
      directTrackedOutcomeCount: 1,
      outcomeCounts: null,
      highIntentMetrics: ["LINK_CLICKS" as const],
      outperformingEngagementMetrics: ["SAVES" as const],
      reachMetricsReviewed: ["REACH" as const],
      performanceEvidenceRefs: ["business:ig-1:performance"],
      outcomeEvidenceRefs: ["business:ig-1:outcome"],
      interpretation: "Tracked outcome evidence exists; causality is not established.",
      causalClaim: false as const,
      revenueAttributionClaim: false as const,
      monetaryValue: null,
      competitorPerformanceClaim: false as const,
      endorsementClaim: false as const,
      recommendationAuthority: "NONE" as const,
      providerWriteAuthority: "NONE" as const,
      notificationAuthority: "NONE" as const
    },
    {
      contentRef: "YOUTUBE:yt-1",
      platform: "YOUTUBE" as const,
      accountId: "youtube-account",
      contentId: "yt-1",
      signals: ["LOWER_REACH_HIGH_INTENT" as const],
      businessValueState: "HIGH_INTENT_PLATFORM_SIGNAL" as const,
      reachState: "LOWER_THAN_COMPARABLE" as const,
      engagementState: "UNASSESSED" as const,
      linkedOutcomeCount: 0,
      directTrackedOutcomeCount: 0,
      outcomeCounts: null,
      highIntentMetrics: ["SAVES" as const],
      outperformingEngagementMetrics: [],
      reachMetricsReviewed: ["VIEWS" as const],
      performanceEvidenceRefs: ["business:yt-1:performance"],
      outcomeEvidenceRefs: [],
      interpretation: "High-intent platform signal only.",
      causalClaim: false as const,
      revenueAttributionClaim: false as const,
      monetaryValue: null,
      competitorPerformanceClaim: false as const,
      endorsementClaim: false as const,
      recommendationAuthority: "NONE" as const,
      providerWriteAuthority: "NONE" as const,
      notificationAuthority: "NONE" as const
    }
  ];
  return {
    contractVersion: "SocialContentBusinessValueReviewV1",
    evaluatedAt,
    status,
    items,
    lowerReachHighIntent: [items[1]],
    vanityRiskReview: [],
    trackedBusinessSignal: [items[0]],
    evidenceRefs: items.flatMap((item) => [...item.performanceEvidenceRefs, ...item.outcomeEvidenceRefs]),
    limitations: [],
    causalClaim: false,
    revenueAttributionClaim: false,
    monetaryValue: null,
    competitorPerformanceClaim: false,
    endorsementClaim: false,
    recommendationAuthority: "NONE",
    providerWriteAuthority: "NONE",
    notificationAuthority: "NONE",
    externalAccessPerformed: false,
    writesPerformed: false
  } as SocialContentBusinessValueReviewV1;
}

function opportunityQueue(
  status: SocialContentOpportunityQueueV1["status"] = "READY",
  at = observedAt
): SocialContentOpportunityQueueV1 {
  const opportunities = [1, 2, 3].map((rank) => ({
    opportunityId: `opportunity-${rank}`,
    rank,
    priority: rank === 1 ? "DIRECT_TRACKED_BUSINESS_SIGNAL" as const : "HIGH_INTENT_FIRST_PARTY_SIGNAL" as const,
    sourcePlatform: "INSTAGRAM" as const,
    targetPlatform: rank === 3 ? "YOUTUBE" as const : "INSTAGRAM" as const,
    sourceDimension: "FORMAT" as const,
    observedMechanism: `mechanism-${rank}`,
    sourcePatternRelativeToMedian: 1.5,
    supportingContentRefs: [`content:${rank}`],
    firstPartyEvidenceRefs: [`opportunity:${rank}:evidence`],
    linkedOutcomeCount: rank === 1 ? 1 : 0,
    directTrackedOutcomeCount: rank === 1 ? 1 : 0,
    highIntentSupportingContentCount: 1,
    targetSuccessMetric: "LINK_CLICKS" as const,
    formatDirection: "process reel",
    hookDirection: null,
    subjectDirection: null,
    experimentPlan: `test-${rank}`,
    successMetricPlan: "Measure link clicks in a fixed window.",
    peerContext: [],
    confidence: null,
    confidenceReason: "NOT_ESTIMATED_FROM_THIS_EVIDENCE" as const,
    causalClaim: false as const,
    revenueAttributionClaim: false as const,
    competitorPerformanceClaim: false as const,
    publicPostingRequiresApproval: true as const,
    executionAuthority: "NONE" as const
  }));
  return {
    contractVersion: "SocialContentOpportunityQueueV1",
    generatedAt: at,
    status,
    opportunities,
    suppressions: [],
    limitations: [],
    rankingPolicy: [],
    postingAuthority: "NONE",
    externalAccessPerformed: false,
    writesPerformed: false
  };
}

function alertReadiness(
  status: SocialMaterialAlertReadinessV1["status"] = "READY_FOR_REVIEW",
  at = observedAt
): SocialMaterialAlertReadinessV1 {
  return {
    contractVersion: "SocialMaterialAlertReadinessV1",
    evaluatedAt: at,
    status,
    items: [{
      signalId: "signal:instagram:saves-up",
      stateKey: "state:instagram:saves-up",
      platform: "INSTAGRAM",
      accountId: "instagram-account",
      metric: "SAVES",
      window: "30D",
      direction: "UP",
      state: "READY_FOR_ALERT_REVIEW",
      reasons: [],
      supportingCorroborationIds: ["support-1", "support-2"],
      contradictingCorroborationIds: [],
      contextOnlyCorroborationIds: [],
      independentSupportingSourceCount: 2,
      evidenceRefs: ["alert:saves-up"],
      causalClaim: false,
      attributionClaim: false,
      competitorPerformanceClaim: false,
      relationshipClaim: false,
      endorsementClaim: false,
      eligibleForNotification: false
    }],
    guardrails: [],
    notificationAuthority: "NONE",
    externalAccessPerformed: false,
    writesPerformed: false
  };
}

function baseInput() {
  return {
    generatedAt,
    window: "30D" as const,
    channelDrilldowns: [channel("INSTAGRAM", "instagram-account", 10_000), channel("YOUTUBE", "youtube-account", 5_000)],
    connectorHealth: connectorHealth(),
    performanceReview: performanceReview(),
    businessValueReview: businessValueReview(),
    opportunityQueue: opportunityQueue(),
    alertReadiness: [alertReadiness()],
    maxEvidenceAgeHours: 24,
    maxRecommendedActions: 2
  };
}

test("builds a compact executive view without inventing a unique cross-platform audience or winner", () => {
  const result = compileSocialExecutiveOverviewV1(baseInput());

  assert.equal(result.status, "READY");
  assert.equal(result.channelCards.length, 2);
  assert.equal(result.channelCards.every((card) => card.decisionGrade), true);
  assert.equal(result.channelCards.find((card) => card.platform === "INSTAGRAM")?.audience.value, 10_000);
  assert.equal(result.audienceTotalAcrossPlatforms, null);
  assert.equal(result.audienceOverlapKnown, false);
  assert.equal(result.audienceRollupState, "NOT_ESTABLISHED");
  assert.equal(result.contentHighlightsByPlatform.length, 2);
  assert.equal(result.contentHighlightsByPlatform.find((item) => item.platform === "INSTAGRAM")?.contentId, "ig-2");
  assert.equal(result.strongestContentWinnerAcrossPlatforms, null);
  assert.equal(result.businessValueHighlightsByPlatform.length, 2);
  assert.equal(result.strongestBusinessValueContentAcrossPlatforms, null);
  assert.deepEqual(result.recommendedActions.map((item) => item.opportunityId), ["opportunity-1", "opportunity-2"]);
  assert.equal(result.recommendedActions.every((item) => item.executionAuthority === "NONE" && item.requiresApprovalForPosting), true);
  assert.deepEqual(result.alertReviewCandidates.map((item) => item.signalId), ["signal:instagram:saves-up"]);
  assert.equal(result.alertReviewCandidates[0].eligibleForNotification, false);
  assert.equal(result.notificationAuthority, "NONE");
  assert.equal(result.postingAuthority, "NONE");
  assert.equal(result.crossPlatformMetricAggregationPerformed, false);
  assert.equal(result.crossPlatformPerformanceRankingPerformed, false);
  assert.equal(result.causalClaim, false);
  assert.equal(result.attributionClaim, false);
  assert.equal(result.competitorPerformanceClaim, false);
  assert.equal(result.writesPerformed, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.channelCards), true);
});

test("preserves an unavailable audience metric as unknown instead of silently converting it to zero", () => {
  const input = baseInput();
  const instagram = channel("INSTAGRAM", "instagram-account", 10_000);
  instagram.metrics = [
    metric("AUDIENCE_TOTAL", null),
    metric("NET_NEW_AUDIENCE", 25)
  ];
  const result = compileSocialExecutiveOverviewV1({ ...input, channelDrilldowns: [instagram, input.channelDrilldowns[1]] });
  const card = result.channelCards.find((item) => item.platform === "INSTAGRAM");
  assert.ok(card);
  assert.equal(card.audience.value, null);
  assert.equal(card.audience.state, "UNKNOWN");
  assert.equal(card.audience.decisionGrade, false);
});

test("fails closed when a ready channel conflicts with connector live-proof truth", () => {
  const input = baseInput();
  const health = connectorHealth();
  health.platforms = health.platforms.map((row) => row.platform === "INSTAGRAM" ? {
    ...row,
    sourceHealth: "UNPROVEN",
    canonicalDataState: "UNPROVEN",
    readiness: "AUTHORIZED_NOT_PROVEN",
    liveFirstPartyDataProven: false
  } : row);

  const result = compileSocialExecutiveOverviewV1({ ...input, connectorHealth: health });
  const card = result.channelCards.find((item) => item.platform === "INSTAGRAM");
  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.ok(result.reasons.includes("CHANNEL_CONNECTOR_TRUTH_MISMATCH"));
  assert.equal(card?.decisionGrade, false);
  assert.equal(card?.liveFirstPartyDataProven, false);
});

test("withholds recommended actions when the governed opportunity queue is stale", () => {
  const input = baseInput();
  const staleQueue = opportunityQueue("READY", "2026-09-17T00:00:00Z");
  const result = compileSocialExecutiveOverviewV1({ ...input, opportunityQueue: staleQueue });

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.ok(result.reasons.includes("OPPORTUNITY_QUEUE_STALE"));
  assert.deepEqual(result.recommendedActions, []);
});

test("propagates upstream verification-required performance truth and withholds highlights", () => {
  const input = baseInput();
  const result = compileSocialExecutiveOverviewV1({
    ...input,
    performanceReview: performanceReview("VERIFY_REQUIRED")
  });

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.ok(result.reasons.includes("CONTENT_PERFORMANCE_NOT_READY"));
  assert.deepEqual(result.contentHighlightsByPlatform, []);
});

test("does not project alert candidates from a verification-required alert review", () => {
  const input = baseInput();
  const result = compileSocialExecutiveOverviewV1({
    ...input,
    alertReadiness: [alertReadiness("VERIFY_REQUIRED")]
  });

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.ok(result.reasons.includes("ALERT_READINESS_NOT_READY"));
  assert.deepEqual(result.alertReviewCandidates, []);
});

test("rejects future-dated component evidence", () => {
  const input = baseInput();
  assert.throws(
    () => compileSocialExecutiveOverviewV1({
      ...input,
      performanceReview: performanceReview("READY", "2026-09-20T00:00:00Z")
    }),
    /performanceReview\.evaluatedAt cannot be in the future/i
  );
});

test("rejects authority widening instead of letting the executive layer bless it", () => {
  const input = baseInput();
  const widened = {
    ...input.opportunityQueue,
    postingAuthority: "AUTONOMOUS"
  } as unknown as SocialContentOpportunityQueueV1;
  assert.throws(
    () => compileSocialExecutiveOverviewV1({ ...input, opportunityQueue: widened }),
    /opportunityQueue widens action authority/i
  );
});

test("rejects duplicate canonical channel identity", () => {
  const input = baseInput();
  assert.throws(
    () => compileSocialExecutiveOverviewV1({
      ...input,
      channelDrilldowns: [channel("INSTAGRAM", "instagram-account"), channel("INSTAGRAM", "instagram-account")]
    }),
    /duplicate channel identity/i
  );
});
