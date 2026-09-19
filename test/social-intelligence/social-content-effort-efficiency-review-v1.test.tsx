import assert from "node:assert/strict";
import test from "node:test";

import {
  compileSocialContentEffortEfficiencyReviewV1,
  type SocialContentEffortEfficiencyReviewInputV1
} from "../../src/lib/social-intelligence/social-content-effort-efficiency-review-v1";
import type {
  SocialContentBusinessValueReviewItemV1,
  SocialContentBusinessValueReviewV1
} from "../../src/lib/social-intelligence/social-content-business-value-review-v1";
import type {
  SocialContentPerformanceItemV1,
  SocialContentPerformanceReviewV1
} from "../../src/lib/social-intelligence/social-content-performance-review-v1";

const evaluatedAt = "2026-09-19T12:00:00.000Z";

function performanceItem(overrides: Partial<SocialContentPerformanceItemV1> = {}): SocialContentPerformanceItemV1 {
  return {
    platform: "INSTAGRAM",
    accountId: "account:keegan-instagram",
    contentId: "content:helmet-progress",
    publishedAt: "2026-09-17T18:00:00.000Z",
    observedAt: "2026-09-19T10:00:00.000Z",
    sourceState: "COMPLETE",
    amplificationType: "ORGANIC",
    ageBucket: "1_7D",
    formatKey: "WIP_VIDEO",
    metric: "SAVES",
    metricValue: 120,
    audienceAtObservation: 10_000,
    observedPerThousandAudience: 12,
    comparableCohortSize: 12,
    comparableMedianPerThousandAudience: 6,
    ratioToComparableMedian: 2,
    classification: "OUTPERFORMING",
    explanation: "Observed saves are above the evidenced within-platform comparable median.",
    contentDnaRef: "dna:helmet-progress",
    evidenceRefs: ["evidence:performance:saves"],
    ...overrides
  };
}

function performanceReview(
  items: readonly SocialContentPerformanceItemV1[] = [performanceItem()],
  overrides: Partial<SocialContentPerformanceReviewV1> = {}
): SocialContentPerformanceReviewV1 {
  return {
    contractVersion: "SocialContentPerformanceReviewV1",
    evaluatedAt: "2026-09-19T11:00:00.000Z",
    status: "READY",
    reasons: [],
    items,
    outperformers: items.filter((item) => item.classification === "OUTPERFORMING"),
    underperformers: items.filter((item) => item.classification === "UNDERPERFORMING"),
    typical: items.filter((item) => item.classification === "TYPICAL"),
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
    guardrails: [],
    ...overrides
  };
}

function businessValueItem(
  overrides: Partial<SocialContentBusinessValueReviewItemV1> = {}
): SocialContentBusinessValueReviewItemV1 {
  return {
    contentRef: "INSTAGRAM:content:helmet-progress",
    platform: "INSTAGRAM",
    accountId: "account:keegan-instagram",
    contentId: "content:helmet-progress",
    signals: ["LOWER_REACH_HIGH_INTENT"],
    businessValueState: "TRACKED_BUSINESS_SIGNAL",
    reachState: "LOWER_THAN_COMPARABLE",
    engagementState: "OUTPERFORMING",
    linkedOutcomeCount: 2,
    directTrackedOutcomeCount: 1,
    outcomeCounts: {
      SITE_SESSION: 1,
      EMAIL_SIGNUP: 0,
      INQUIRY: 1,
      PURCHASE: 0,
      OPPORTUNITY: 0,
      MEDIA_OUTCOME: 0
    },
    highIntentMetrics: ["SAVES"],
    outperformingEngagementMetrics: ["SAVES"],
    reachMetricsReviewed: ["REACH"],
    performanceEvidenceRefs: ["evidence:performance:saves"],
    outcomeEvidenceRefs: ["evidence:outcome:inquiry"],
    interpretation: "Tracked evidence exists without claiming causality or monetary value.",
    causalClaim: false,
    revenueAttributionClaim: false,
    monetaryValue: null,
    competitorPerformanceClaim: false,
    endorsementClaim: false,
    recommendationAuthority: "NONE",
    providerWriteAuthority: "NONE",
    notificationAuthority: "NONE",
    ...overrides
  };
}

function businessValueReview(
  items: readonly SocialContentBusinessValueReviewItemV1[] = [businessValueItem()],
  overrides: Partial<SocialContentBusinessValueReviewV1> = {}
): SocialContentBusinessValueReviewV1 {
  return {
    contractVersion: "SocialContentBusinessValueReviewV1",
    evaluatedAt: "2026-09-19T11:00:00.000Z",
    status: "READY",
    items,
    lowerReachHighIntent: items.filter((item) => item.signals.includes("LOWER_REACH_HIGH_INTENT")),
    vanityRiskReview: [],
    trackedBusinessSignal: items.filter((item) => item.businessValueState === "TRACKED_BUSINESS_SIGNAL"),
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
    writesPerformed: false,
    ...overrides
  };
}

function input(
  overrides: Partial<SocialContentEffortEfficiencyReviewInputV1> = {}
): SocialContentEffortEfficiencyReviewInputV1 {
  return {
    effortObservations: [
      {
        platform: "INSTAGRAM",
        accountId: "account:keegan-instagram",
        contentId: "content:helmet-progress",
        formatKey: "WIP_VIDEO",
        amplificationType: "ORGANIC",
        ageBucket: "1_7D",
        sourceState: "COMPLETE",
        observedAt: "2026-09-19T10:30:00.000Z",
        productionEffortMinutes: 30,
        comparableMedianEffortMinutes: 60,
        comparableCohortSize: 10,
        effortEvidenceRefs: ["evidence:production-effort:helmet"],
        comparableCohortEvidenceRefs: ["evidence:effort-cohort:wip-video"]
      }
    ],
    performanceReview: performanceReview(),
    businessValueReview: businessValueReview(),
    policy: {
      maxEvidenceAgeHours: 48,
      minimumComparableCohortSize: 5,
      lowerEffortRatioAtMost: 0.75,
      higherEffortRatioAtLeast: 1.25
    },
    evaluatedAt,
    ...overrides
  };
}

test("surfaces lower-effort content with tracked business and platform-performance evidence without calling it ROI", () => {
  const result = compileSocialContentEffortEfficiencyReviewV1(input());

  assert.equal(result.status, "READY");
  assert.equal(result.items.length, 1);
  const item = result.items[0]!;
  assert.equal(item.state, "READY");
  assert.equal(item.effortRatioToComparableMedian, 0.5);
  assert.equal(item.effortClass, "LOWER_THAN_COMPARABLE");
  assert.deepEqual(item.outperformingMetrics, ["SAVES"]);
  assert.equal(item.businessValueState, "TRACKED_BUSINESS_SIGNAL");
  assert.equal(item.linkedOutcomeCount, 2);
  assert.ok(item.signals.includes("LOWER_EFFORT_TRACKED_BUSINESS_SIGNAL"));
  assert.ok(item.signals.includes("LOWER_EFFORT_OUTPERFORMING_PLATFORM_SIGNAL"));
  assert.equal(result.lowerEffortWithTrackedBusinessSignal.length, 1);
  assert.equal(result.lowerEffortWithOutperformingPlatformSignal.length, 1);
  assert.equal(item.monetaryRoiClaim, false);
  assert.equal(item.causalClaim, false);
  assert.equal(item.confidence, "NOT_ESTABLISHED");
  assert.equal(item.monetaryValue, null);
  assert.equal(result.crossPlatformEfficiencyComparisonAuthority, "NONE");
  assert.equal(result.recommendationAuthority, "NONE");
  assert.equal(result.postingAuthority, "NONE");
  assert.equal(result.spendAuthority, "NONE");
});

test("keeps higher effort visible for review when business value is not established instead of treating missing evidence as zero", () => {
  const noBusinessSignal = businessValueItem({
    signals: [],
    businessValueState: "NOT_ESTABLISHED",
    linkedOutcomeCount: 0,
    directTrackedOutcomeCount: 0,
    outcomeCounts: null,
    highIntentMetrics: [],
    outcomeEvidenceRefs: []
  });
  const result = compileSocialContentEffortEfficiencyReviewV1(
    input({
      effortObservations: [
        {
          ...input().effortObservations[0]!,
          productionEffortMinutes: 90,
          comparableMedianEffortMinutes: 60
        }
      ],
      businessValueReview: businessValueReview([noBusinessSignal])
    })
  );

  const item = result.items[0]!;
  assert.equal(item.effortClass, "HIGHER_THAN_COMPARABLE");
  assert.equal(item.businessValueState, "NOT_ESTABLISHED");
  assert.ok(item.signals.includes("HIGHER_EFFORT_BUSINESS_VALUE_NOT_ESTABLISHED"));
  assert.equal(result.highEffortReview.length, 1);
  assert.equal(item.monetaryValue, null);
});

test("fails closed when the effort evidence is partial, stale, or has too small a comparison cohort", () => {
  const result = compileSocialContentEffortEfficiencyReviewV1(
    input({
      effortObservations: [
        {
          ...input().effortObservations[0]!,
          sourceState: "PARTIAL",
          observedAt: "2026-09-10T00:00:00.000Z",
          comparableCohortSize: 2
        }
      ]
    })
  );

  assert.equal(result.status, "VERIFY_REQUIRED");
  const item = result.items[0]!;
  assert.equal(item.state, "VERIFY_REQUIRED");
  assert.equal(item.effortClass, "NOT_ESTABLISHED");
  assert.equal(item.effortRatioToComparableMedian, null);
  assert.deepEqual(item.signals, []);
  assert.ok(item.reasons.includes("EFFORT_SOURCE_NOT_COMPLETE"));
  assert.ok(item.reasons.includes("EFFORT_EVIDENCE_TOO_OLD"));
  assert.ok(item.reasons.includes("COMPARABLE_COHORT_TOO_SMALL"));
  assert.equal(result.verificationRequired.length, 1);
});

test("fails closed when the performance cohort identity does not match the effort cohort", () => {
  const mismatchedPerformance = performanceItem({ formatKey: "FINAL_REVEAL" });
  const result = compileSocialContentEffortEfficiencyReviewV1(
    input({ performanceReview: performanceReview([mismatchedPerformance]) })
  );

  const item = result.items[0]!;
  assert.equal(item.state, "VERIFY_REQUIRED");
  assert.ok(item.reasons.includes("PERFORMANCE_COHORT_MISMATCH"));
  assert.equal(item.effortClass, "NOT_ESTABLISHED");
  assert.deepEqual(item.performanceMetricsObserved, []);
});

test("does not join performance or business evidence from another account or platform", () => {
  const wrongAccount = performanceItem({ accountId: "account:other" });
  const result = compileSocialContentEffortEfficiencyReviewV1(
    input({ performanceReview: performanceReview([wrongAccount]) })
  );

  const item = result.items[0]!;
  assert.equal(item.state, "READY");
  assert.deepEqual(item.performanceMetricsObserved, []);
  assert.equal(item.businessValueState, "NOT_ESTABLISHED");
  assert.deepEqual(item.signals, []);
});

test("does not promote stale upstream reviews into current effort intelligence", () => {
  const result = compileSocialContentEffortEfficiencyReviewV1(
    input({
      performanceReview: performanceReview(undefined, { evaluatedAt: "2026-09-10T00:00:00.000Z" })
    })
  );

  const item = result.items[0]!;
  assert.equal(item.state, "VERIFY_REQUIRED");
  assert.ok(item.reasons.includes("PERFORMANCE_EVIDENCE_NOT_READY"));
  assert.equal(item.effortClass, "NOT_ESTABLISHED");
});

test("rejects credential-like evidence references and future upstream evaluation timestamps", () => {
  assert.throws(
    () =>
      compileSocialContentEffortEfficiencyReviewV1(
        input({
          effortObservations: [
            {
              ...input().effortObservations[0]!,
              effortEvidenceRefs: ["access_token=secret"]
            }
          ]
        })
      ),
    /credential-like material/
  );

  assert.throws(
    () =>
      compileSocialContentEffortEfficiencyReviewV1(
        input({
          businessValueReview: businessValueReview(undefined, {
            evaluatedAt: "2026-09-20T00:00:00.000Z"
          })
        })
      ),
    /cannot be after evaluatedAt/
  );
});

test("returns NO_EVIDENCE without inventing recommendations or values when no effort observations are supplied", () => {
  const result = compileSocialContentEffortEfficiencyReviewV1(input({ effortObservations: [] }));

  assert.equal(result.status, "NO_EVIDENCE");
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.evidenceRefs, []);
  assert.equal(result.causalClaim, false);
  assert.equal(result.revenueAttributionClaim, false);
  assert.equal(result.monetaryRoiClaim, false);
  assert.equal(result.recommendationAuthority, "NONE");
  assert.equal(result.providerWriteAuthority, "NONE");
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
  assert.ok(Object.isFrozen(result));
});
