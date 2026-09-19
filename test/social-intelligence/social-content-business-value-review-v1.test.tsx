import assert from "node:assert/strict";
import test from "node:test";

import {
  compileSocialContentBusinessValueReviewV1
} from "../../src/lib/social-intelligence/social-content-business-value-review-v1";
import type {
  SocialBusinessOutcomeLinkageV1,
  SocialBusinessOutcomeLinkageRowV1,
  SocialContentBusinessOutcomeSummaryV1
} from "../../src/lib/social-intelligence/social-business-outcome-linkage-v1";
import type {
  SocialContentPerformanceItemV1,
  SocialContentPerformanceReviewV1
} from "../../src/lib/social-intelligence/social-content-performance-review-v1";

const EVALUATED_AT = "2026-09-19T02:30:00.000Z";

function performanceItem(
  contentId: string,
  metric: SocialContentPerformanceItemV1["metric"],
  classification: SocialContentPerformanceItemV1["classification"],
  overrides: Partial<SocialContentPerformanceItemV1> = {}
): SocialContentPerformanceItemV1 {
  const ratio = classification === "OUTPERFORMING" ? 1.8 : classification === "UNDERPERFORMING" ? 0.5 : 1;
  return {
    platform: "INSTAGRAM",
    accountId: "keegan-hall",
    contentId,
    publishedAt: "2026-09-17T12:00:00.000Z",
    observedAt: "2026-09-19T01:00:00.000Z",
    sourceState: "COMPLETE",
    amplificationType: "ORGANIC",
    ageBucket: "1_7D",
    formatKey: "REEL",
    metric,
    metricValue: 100,
    audienceAtObservation: 10_000,
    observedPerThousandAudience: 10,
    comparableCohortSize: 12,
    comparableMedianPerThousandAudience: 10 / ratio,
    ratioToComparableMedian: ratio,
    classification,
    explanation: `${metric} evidenced comparison`,
    contentDnaRef: `dna:${contentId}`,
    evidenceRefs: [`performance:${contentId}:${metric}`],
    ...overrides
  };
}

function performanceReview(
  items: readonly SocialContentPerformanceItemV1[],
  overrides: Partial<SocialContentPerformanceReviewV1> = {}
): SocialContentPerformanceReviewV1 {
  const outperformers = items.filter((item) => item.classification === "OUTPERFORMING");
  const underperformers = items.filter((item) => item.classification === "UNDERPERFORMING");
  const typical = items.filter((item) => item.classification === "TYPICAL");
  return {
    contractVersion: "SocialContentPerformanceReviewV1",
    evaluatedAt: "2026-09-19T02:00:00.000Z",
    status: items.length ? "READY" : "NO_COMPARABLE_CONTENT",
    reasons: [],
    items,
    outperformers,
    underperformers,
    typical,
    evidenceRefs: [...new Set(items.flatMap((item) => item.evidenceRefs))].sort(),
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
    guardrails: [],
    ...overrides
  };
}

function zeroOutcomeCounts(): SocialContentBusinessOutcomeSummaryV1["outcomeCounts"] {
  return {
    SITE_SESSION: 0,
    EMAIL_SIGNUP: 0,
    INQUIRY: 0,
    PURCHASE: 0,
    OPPORTUNITY: 0,
    MEDIA_OUTCOME: 0
  };
}

function directOutcome(
  contentId: string,
  kind: SocialBusinessOutcomeLinkageRowV1["kind"] = "INQUIRY"
): { row: SocialBusinessOutcomeLinkageRowV1; summary: SocialContentBusinessOutcomeSummaryV1 } {
  const ref = `INSTAGRAM:${contentId}`;
  const evidenceRefs = [`outcome:${contentId}`, `tracking:${contentId}`];
  const outcomeCounts = { ...zeroOutcomeCounts(), [kind]: 1 };
  const row: SocialBusinessOutcomeLinkageRowV1 = {
    outcomeId: `outcome-${contentId}`,
    kind,
    source: "CRM",
    sourceRecordRef: `crm:${contentId}`,
    occurredAt: "2026-09-18T18:00:00.000Z",
    observedAt: "2026-09-19T01:30:00.000Z",
    completeThroughAt: "2026-09-19T01:30:00.000Z",
    truthState: "KNOWN",
    socialContentRef: ref,
    platform: "INSTAGRAM",
    contentId,
    linkBasis: "EXACT_TRACKING_REF",
    attributionRef: `utm:${contentId}`,
    upstreamAttributionConfidence: "DIRECT",
    disposition: "DIRECT_LINK",
    attributionClass: "DIRECT_TRACKED",
    evidenceRefs,
    verificationReasons: [],
    causalClaim: false,
    revenueAttributionClaim: false,
    monetaryValue: null
  };
  const summary: SocialContentBusinessOutcomeSummaryV1 = {
    socialContentRef: ref,
    platform: "INSTAGRAM",
    contentId,
    linkedOutcomeCount: 1,
    directTrackedOutcomeCount: 1,
    outcomeCounts,
    strongestAttributionClass: "DIRECT_TRACKED",
    evidenceRefs,
    causalClaim: false,
    revenueAttributionClaim: false,
    monetaryValue: null
  };
  return { row, summary };
}

function outcomeLinkage(
  linked: readonly ReturnType<typeof directOutcome>[] = [],
  overrides: Partial<SocialBusinessOutcomeLinkageV1> = {}
): SocialBusinessOutcomeLinkageV1 {
  return {
    contractVersion: "SocialBusinessOutcomeLinkageV1",
    generatedAt: "2026-09-19T02:00:00.000Z",
    rows: linked.map(({ row }) => row),
    byContent: linked.map(({ summary }) => summary),
    limitations: [],
    externalAccessPerformed: false,
    writesPerformed: false,
    ...overrides
  };
}

function compile(
  review: SocialContentPerformanceReviewV1,
  linkage: SocialBusinessOutcomeLinkageV1 = outcomeLinkage()
) {
  return compileSocialContentBusinessValueReviewV1({
    performanceReview: review,
    outcomeLinkage: linkage,
    evaluatedAt: EVALUATED_AT,
    maxPerformanceAgeHours: 24,
    maxOutcomeLinkageAgeHours: 24
  });
}

test("preserves lower-reach content with outperforming high-intent platform evidence", () => {
  const result = compile(performanceReview([
    performanceItem("collector-intent", "REACH", "UNDERPERFORMING"),
    performanceItem("collector-intent", "LINK_CLICKS", "OUTPERFORMING")
  ]));

  assert.equal(result.status, "READY");
  assert.equal(result.lowerReachHighIntent.length, 1);
  const item = result.lowerReachHighIntent[0]!;
  assert.equal(item.businessValueState, "HIGH_INTENT_PLATFORM_SIGNAL");
  assert.equal(item.reachState, "LOWER_THAN_COMPARABLE");
  assert.deepEqual(item.highIntentMetrics, ["LINK_CLICKS"]);
  assert.ok(item.signals.includes("LOWER_REACH_HIGH_INTENT"));
  assert.match(item.interpretation, /lower comparable reach\/view performance/i);
  assert.equal(item.causalClaim, false);
  assert.equal(item.revenueAttributionClaim, false);
  assert.equal(item.monetaryValue, null);
  assert.equal(item.recommendationAuthority, "NONE");
});

test("preserves lower-reach content when exact tracked downstream evidence exists", () => {
  const linked = directOutcome("direct-business");
  const result = compile(
    performanceReview([performanceItem("direct-business", "VIEWS", "UNDERPERFORMING")]),
    outcomeLinkage([linked])
  );

  const item = result.lowerReachHighIntent[0]!;
  assert.equal(item.businessValueState, "TRACKED_BUSINESS_SIGNAL");
  assert.equal(item.linkedOutcomeCount, 1);
  assert.equal(item.directTrackedOutcomeCount, 1);
  assert.equal(item.outcomeCounts?.INQUIRY, 1);
  assert.deepEqual(item.outcomeEvidenceRefs, ["outcome:direct-business", "tracking:direct-business"]);
  assert.ok(result.trackedBusinessSignal.some((candidate) => candidate.contentRef === "INSTAGRAM:direct-business"));
  assert.equal(result.revenueAttributionClaim, false);
});

test("flags high engagement without inventing low business value from absent downstream evidence", () => {
  const result = compile(performanceReview([
    performanceItem("viral-no-business-proof", "SHARES", "OUTPERFORMING"),
    performanceItem("viral-no-business-proof", "REACH", "OUTPERFORMING")
  ]));

  assert.equal(result.vanityRiskReview.length, 1);
  const item = result.vanityRiskReview[0]!;
  assert.equal(item.businessValueState, "NOT_ESTABLISHED");
  assert.ok(item.signals.includes("HIGH_ENGAGEMENT_WITHOUT_TRACKED_BUSINESS_EVIDENCE"));
  assert.match(item.interpretation, /business value remains unestablished/i);
  assert.doesNotMatch(item.interpretation, /low business value/i);
  assert.equal(item.linkedOutcomeCount, 0);
});

test("distinguishes high engagement with tracked business association", () => {
  const linked = directOutcome("engagement-and-business", "PURCHASE");
  const result = compile(
    performanceReview([performanceItem("engagement-and-business", "COMMENTS", "OUTPERFORMING")]),
    outcomeLinkage([linked])
  );

  const item = result.items[0]!;
  assert.ok(item.signals.includes("HIGH_ENGAGEMENT_WITH_TRACKED_BUSINESS_SIGNAL"));
  assert.equal(item.businessValueState, "TRACKED_BUSINESS_SIGNAL");
  assert.equal(item.outcomeCounts?.PURCHASE, 1);
  assert.match(item.interpretation, /does not establish causality or revenue impact/i);
});

test("fails closed when canonical source projections require verification, are stale, or are future-dated", () => {
  const item = performanceItem("source-gate", "REACH", "TYPICAL");
  const needsVerification = compile(performanceReview([item], {
    status: "VERIFY_REQUIRED",
    reasons: ["SOURCE_NOT_COMPLETE"]
  }));
  assert.equal(needsVerification.status, "VERIFY_REQUIRED");
  assert.deepEqual(needsVerification.items, []);

  const stale = compileSocialContentBusinessValueReviewV1({
    performanceReview: performanceReview([item], { evaluatedAt: "2026-09-17T00:00:00.000Z" }),
    outcomeLinkage: outcomeLinkage([], { generatedAt: "2026-09-17T00:00:00.000Z" }),
    evaluatedAt: EVALUATED_AT,
    maxPerformanceAgeHours: 24,
    maxOutcomeLinkageAgeHours: 24
  });
  assert.equal(stale.status, "VERIFY_REQUIRED");
  assert.deepEqual(stale.items, []);
  assert.match(stale.limitations.join(" "), /older than/i);

  const future = compileSocialContentBusinessValueReviewV1({
    performanceReview: performanceReview([item], { evaluatedAt: "2026-09-20T00:00:00.000Z" }),
    outcomeLinkage: outcomeLinkage(),
    evaluatedAt: EVALUATED_AT,
    maxPerformanceAgeHours: 24,
    maxOutcomeLinkageAgeHours: 24
  });
  assert.equal(future.status, "VERIFY_REQUIRED");
  assert.deepEqual(future.items, []);
  assert.match(future.limitations.join(" "), /future/i);
});

test("preserves UNKNOWN when no comparable performance evidence exists", () => {
  const result = compile(performanceReview([]));
  assert.equal(result.status, "NO_EVIDENCE");
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.lowerReachHighIntent, []);
  assert.deepEqual(result.vanityRiskReview, []);
  assert.deepEqual(result.evidenceRefs, []);
});

test("rejects forged canonical summaries, widened authority, and inconsistent classification partitions", () => {
  const item = performanceItem("integrity", "REACH", "TYPICAL");
  const linked = directOutcome("integrity");

  const forgedSummary = {
    ...linked.summary,
    linkedOutcomeCount: 2
  } as SocialContentBusinessOutcomeSummaryV1;
  assert.throws(() => compile(
    performanceReview([item]),
    outcomeLinkage([], { rows: [linked.row], byContent: [forgedSummary] })
  ), /linked count drift/);

  const widened = {
    ...performanceReview([item]),
    recommendationAuthority: "EXECUTE"
  } as unknown as SocialContentPerformanceReviewV1;
  assert.throws(() => compile(widened), /widens interpretation or action authority/);

  const partitionDrift = {
    ...performanceReview([item]),
    typical: []
  } as SocialContentPerformanceReviewV1;
  assert.throws(() => compile(partitionDrift), /classification partition/);
});

test("rejects ambiguous account identity and unsafe raw provider text", () => {
  const ambiguous = performanceReview([
    performanceItem("same-content", "REACH", "TYPICAL", { accountId: "account-a" }),
    performanceItem("same-content", "LINK_CLICKS", "OUTPERFORMING", { accountId: "account-b" })
  ]);
  assert.throws(() => compile(ambiguous), /ambiguous account identity/);

  const unsafe = {
    performanceReview: performanceReview([performanceItem("unsafe", "REACH", "TYPICAL")]),
    outcomeLinkage: outcomeLinkage(),
    evaluatedAt: EVALUATED_AT,
    maxPerformanceAgeHours: 24,
    maxOutcomeLinkageAgeHours: 24,
    rawPayload: "private provider body"
  } as unknown as Parameters<typeof compileSocialContentBusinessValueReviewV1>[0];
  assert.throws(() => compileSocialContentBusinessValueReviewV1(unsafe), /rawPayload is prohibited/);
});

test("is deterministic, preserves caller input, and deeply freezes output", () => {
  const input = {
    performanceReview: performanceReview([
      performanceItem("deep-freeze", "REACH", "UNDERPERFORMING"),
      performanceItem("deep-freeze", "PROFILE_VISITS", "OUTPERFORMING")
    ]),
    outcomeLinkage: outcomeLinkage(),
    evaluatedAt: EVALUATED_AT,
    maxPerformanceAgeHours: 24,
    maxOutcomeLinkageAgeHours: 24
  } as const;
  const before = structuredClone(input);
  const first = compileSocialContentBusinessValueReviewV1(input);
  const second = compileSocialContentBusinessValueReviewV1(input);

  assert.deepEqual(input, before);
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.items));
  assert.ok(Object.isFrozen(first.items[0]));
  assert.ok(Object.isFrozen(first.items[0]?.signals));
  assert.throws(() => {
    (first.items as unknown as unknown[]).push({});
  });
});
