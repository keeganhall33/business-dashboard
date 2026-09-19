import assert from "node:assert/strict";
import test from "node:test";

import {
  compileSocialPaidSupportCandidateReviewV1,
  type SocialPaidSupportCandidatePolicyV1
} from "../../src/lib/social-intelligence/social-paid-support-candidate-review-v1";
import type {
  SocialContentBusinessValueReviewItemV1,
  SocialContentBusinessValueReviewV1
} from "../../src/lib/social-intelligence/social-content-business-value-review-v1";
import type {
  SocialContentPerformanceItemV1,
  SocialContentPerformanceReviewV1
} from "../../src/lib/social-intelligence/social-content-performance-review-v1";

const EVALUATED_AT = "2026-09-19T06:00:00.000Z";
const policy: SocialPaidSupportCandidatePolicyV1 = {
  maxPerformanceAgeHours: 24,
  maxBusinessValueAgeHours: 24,
  minimumDirectTrackedOutcomeCount: 1,
  minimumOutperformingHighIntentMetrics: 1
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

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
    observedAt: "2026-09-19T04:30:00.000Z",
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
  return {
    contractVersion: "SocialContentPerformanceReviewV1",
    evaluatedAt: "2026-09-19T05:00:00.000Z",
    status: items.length ? "READY" : "NO_COMPARABLE_CONTENT",
    reasons: [],
    items,
    outperformers: items.filter((item) => item.classification === "OUTPERFORMING"),
    underperformers: items.filter((item) => item.classification === "UNDERPERFORMING"),
    typical: items.filter((item) => item.classification === "TYPICAL"),
    evidenceRefs: unique(items.flatMap((item) => item.evidenceRefs)),
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

function businessItem(
  rows: readonly SocialContentPerformanceItemV1[],
  overrides: Partial<SocialContentBusinessValueReviewItemV1> = {}
): SocialContentBusinessValueReviewItemV1 {
  const first = rows[0]!;
  const highIntentMetrics = unique(rows
    .filter((row) => ["LINK_CLICKS", "PROFILE_VISITS", "SAVES"].includes(row.metric) && row.classification === "OUTPERFORMING")
    .map((row) => row.metric)) as SocialContentBusinessValueReviewItemV1["highIntentMetrics"];
  return {
    contentRef: `${first.platform}:${first.contentId}`,
    platform: first.platform,
    accountId: first.accountId,
    contentId: first.contentId,
    signals: [],
    businessValueState: highIntentMetrics.length ? "HIGH_INTENT_PLATFORM_SIGNAL" : "NOT_ESTABLISHED",
    reachState: "TYPICAL",
    engagementState: "NOT_OUTPERFORMING",
    linkedOutcomeCount: 0,
    directTrackedOutcomeCount: 0,
    outcomeCounts: null,
    highIntentMetrics,
    outperformingEngagementMetrics: [],
    reachMetricsReviewed: rows
      .filter((row) => row.metric === "REACH" || row.metric === "VIEWS")
      .map((row) => row.metric) as SocialContentBusinessValueReviewItemV1["reachMetricsReviewed"],
    performanceEvidenceRefs: unique(rows.flatMap((row) => row.evidenceRefs)),
    outcomeEvidenceRefs: [],
    interpretation: "Evidence-bounded business-value review item.",
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

function businessReview(
  items: readonly SocialContentBusinessValueReviewItemV1[],
  overrides: Partial<SocialContentBusinessValueReviewV1> = {}
): SocialContentBusinessValueReviewV1 {
  return {
    contractVersion: "SocialContentBusinessValueReviewV1",
    evaluatedAt: "2026-09-19T05:15:00.000Z",
    status: items.length ? "READY" : "NO_EVIDENCE",
    items,
    lowerReachHighIntent: [],
    vanityRiskReview: [],
    trackedBusinessSignal: items.filter((item) => item.businessValueState === "TRACKED_BUSINESS_SIGNAL"),
    evidenceRefs: unique(items.flatMap((item) => [...item.performanceEvidenceRefs, ...item.outcomeEvidenceRefs])),
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

function compile(
  rows: readonly SocialContentPerformanceItemV1[],
  businessItems: readonly SocialContentBusinessValueReviewItemV1[],
  overrides: Partial<Parameters<typeof compileSocialPaidSupportCandidateReviewV1>[0]> = {}
) {
  return compileSocialPaidSupportCandidateReviewV1({
    performanceReview: performanceReview(rows),
    businessValueReview: businessReview(businessItems),
    policy,
    evaluatedAt: EVALUATED_AT,
    ...overrides
  });
}

test("surfaces organic content with direct tracked business evidence as the strongest paid-support review candidate", () => {
  const rows = [
    performanceItem("collector-inquiry", "REACH", "TYPICAL"),
    performanceItem("collector-inquiry", "LINK_CLICKS", "OUTPERFORMING")
  ];
  const item = businessItem(rows, {
    businessValueState: "TRACKED_BUSINESS_SIGNAL",
    linkedOutcomeCount: 1,
    directTrackedOutcomeCount: 1,
    outcomeEvidenceRefs: ["outcome:collector-inquiry", "tracking:collector-inquiry"]
  });

  const result = compile(rows, [item]);

  assert.equal(result.status, "READY");
  assert.equal(result.candidates.length, 1);
  const candidate = result.candidates[0]!;
  assert.equal(candidate.contentRef, "INSTAGRAM:collector-inquiry");
  assert.equal(candidate.amplificationState, "ORGANIC");
  assert.equal(candidate.evidenceTier, "DIRECT_TRACKED_BUSINESS_SIGNAL");
  assert.equal(candidate.disposition, "PAID_SUPPORT_REVIEW_CANDIDATE");
  assert.equal(candidate.expectedLift, null);
  assert.equal(candidate.confidence, null);
  assert.equal(candidate.causalClaim, false);
  assert.equal(candidate.revenueAttributionClaim, false);
  assert.equal(candidate.monetaryValue, null);
  assert.equal(candidate.paidMediaExecutionAuthority, "NONE");
  assert.equal(candidate.providerWriteAuthority, "NONE");
  assert.equal(candidate.humanApprovalRequiredBeforePaidMediaExecution, true);
  assert.match(candidate.interpretation, /internal paid-support test review/i);
});

test("allows an organic high-intent candidate without inventing downstream attribution", () => {
  const rows = [
    performanceItem("high-intent", "PROFILE_VISITS", "OUTPERFORMING"),
    performanceItem("high-intent", "SAVES", "OUTPERFORMING")
  ];
  const item = businessItem(rows);

  const result = compile(rows, [item]);

  assert.equal(result.candidates.length, 1);
  const candidate = result.candidates[0]!;
  assert.equal(candidate.evidenceTier, "HIGH_INTENT_PLATFORM_SIGNAL");
  assert.deepEqual(candidate.outperformingHighIntentMetrics, ["PROFILE_VISITS", "SAVES"]);
  assert.equal(candidate.linkedOutcomeCount, 0);
  assert.equal(candidate.revenueAttributionClaim, false);
  assert.match(candidate.interpretation, /not a prediction of paid-media performance/i);
});

test("withholds association-only downstream evidence when no qualifying direct or high-intent signal exists", () => {
  const rows = [performanceItem("association-only", "REACH", "TYPICAL")];
  const item = businessItem(rows, {
    businessValueState: "TRACKED_BUSINESS_SIGNAL",
    linkedOutcomeCount: 1,
    directTrackedOutcomeCount: 0,
    outcomeEvidenceRefs: ["outcome:association-only", "association:association-only"]
  });

  const result = compile(rows, [item]);

  assert.equal(result.candidates.length, 0);
  assert.equal(result.withheld.length, 1);
  assert.equal(result.withheld[0]?.disposition, "NOT_CANDIDATE");
  assert.ok(result.withheld[0]?.exclusionReasons.includes("SUPPORTED_ASSOCIATION_ONLY"));
  assert.match(result.withheld[0]?.interpretation ?? "", /association-only/i);
});

test("withholds paid, mixed, unknown, or conflicting amplification instead of treating prior support as organic evidence", () => {
  const paidRows = [performanceItem("paid-content", "LINK_CLICKS", "OUTPERFORMING", { amplificationType: "PAID" })];
  const mixedRows = [
    performanceItem("mixed-content", "LINK_CLICKS", "OUTPERFORMING", { amplificationType: "ORGANIC" }),
    performanceItem("mixed-content", "SAVES", "OUTPERFORMING", { amplificationType: "MIXED" })
  ];
  const rows = [...paidRows, ...mixedRows];
  const items = [businessItem(paidRows), businessItem(mixedRows)];

  const result = compile(rows, items);

  assert.equal(result.candidates.length, 0);
  assert.equal(result.withheld.length, 2);
  assert.ok(result.withheld.every((item) => item.exclusionReasons.includes("NON_ORGANIC_OR_CONFLICTED_AMPLIFICATION")));
  assert.ok(result.withheld.every((item) => item.amplificationState === "NON_ORGANIC_OR_CONFLICTED"));
});

test("fails closed on source verification, stale evidence, and future-dated source projections", () => {
  const rows = [performanceItem("source-gate", "LINK_CLICKS", "OUTPERFORMING")];
  const item = businessItem(rows);

  const verify = compileSocialPaidSupportCandidateReviewV1({
    performanceReview: performanceReview(rows, { status: "VERIFY_REQUIRED", reasons: ["SOURCE_NOT_COMPLETE"] }),
    businessValueReview: businessReview([item]),
    policy,
    evaluatedAt: EVALUATED_AT
  });
  assert.equal(verify.status, "VERIFY_REQUIRED");
  assert.deepEqual(verify.candidates, []);

  const stale = compileSocialPaidSupportCandidateReviewV1({
    performanceReview: performanceReview(rows, { evaluatedAt: "2026-09-17T00:00:00.000Z" }),
    businessValueReview: businessReview([item]),
    policy,
    evaluatedAt: EVALUATED_AT
  });
  assert.equal(stale.status, "VERIFY_REQUIRED");
  assert.match(stale.limitations.join(" "), /older than/i);

  const future = compileSocialPaidSupportCandidateReviewV1({
    performanceReview: performanceReview(rows),
    businessValueReview: businessReview([item], { evaluatedAt: "2026-09-20T00:00:00.000Z" }),
    policy,
    evaluatedAt: EVALUATED_AT
  });
  assert.equal(future.status, "VERIFY_REQUIRED");
  assert.match(future.limitations.join(" "), /future/i);
});

test("preserves no-evidence state instead of manufacturing a candidate", () => {
  const result = compileSocialPaidSupportCandidateReviewV1({
    performanceReview: performanceReview([]),
    businessValueReview: businessReview([]),
    policy,
    evaluatedAt: EVALUATED_AT
  });

  assert.equal(result.status, "NO_EVIDENCE");
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.withheld, []);
  assert.deepEqual(result.evidenceRefs, []);
});

test("rejects forged source joins, widened authority, unsafe raw provider text, and invalid policy", () => {
  const rows = [performanceItem("integrity", "LINK_CLICKS", "OUTPERFORMING")];
  const item = businessItem(rows);

  const driftedItem = { ...item, highIntentMetrics: [] } as SocialContentBusinessValueReviewItemV1;
  assert.throws(() => compile(rows, [driftedItem]), /high-intent metric drift/);

  const widened = businessReview([item], {
    providerWriteAuthority: "WRITE" as unknown as "NONE"
  });
  assert.throws(() => compileSocialPaidSupportCandidateReviewV1({
    performanceReview: performanceReview(rows),
    businessValueReview: widened,
    policy,
    evaluatedAt: EVALUATED_AT
  }), /widens interpretation or action authority/);

  const unsafe = {
    performanceReview: performanceReview(rows),
    businessValueReview: businessReview([item]),
    policy,
    evaluatedAt: EVALUATED_AT,
    rawPayload: "private provider response"
  } as unknown as Parameters<typeof compileSocialPaidSupportCandidateReviewV1>[0];
  assert.throws(() => compileSocialPaidSupportCandidateReviewV1(unsafe), /rawPayload is prohibited/);

  assert.throws(() => compileSocialPaidSupportCandidateReviewV1({
    performanceReview: performanceReview(rows),
    businessValueReview: businessReview([item]),
    policy: { ...policy, minimumDirectTrackedOutcomeCount: 0 },
    evaluatedAt: EVALUATED_AT
  }), /positive integer/);
});

test("orders stronger evidence first, is deterministic, preserves caller input, and deep-freezes output", () => {
  const directRows = [performanceItem("direct", "REACH", "TYPICAL")];
  const direct = businessItem(directRows, {
    businessValueState: "TRACKED_BUSINESS_SIGNAL",
    linkedOutcomeCount: 1,
    directTrackedOutcomeCount: 1,
    outcomeEvidenceRefs: ["outcome:direct", "tracking:direct"]
  });
  const intentRows = [performanceItem("intent", "LINK_CLICKS", "OUTPERFORMING")];
  const intent = businessItem(intentRows);
  const rows = [...intentRows, ...directRows];
  const input = {
    performanceReview: performanceReview(rows),
    businessValueReview: businessReview([intent, direct]),
    policy,
    evaluatedAt: EVALUATED_AT
  } as const;
  const before = structuredClone(input);

  const first = compileSocialPaidSupportCandidateReviewV1(input);
  const second = compileSocialPaidSupportCandidateReviewV1(input);

  assert.deepEqual(input, before);
  assert.deepEqual(first, second);
  assert.deepEqual(first.candidates.map((item) => item.contentId), ["direct", "intent"]);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.candidates));
  assert.ok(Object.isFrozen(first.candidates[0]));
  assert.ok(Object.isFrozen(first.candidates[0]?.performanceEvidenceRefs));
  assert.throws(() => {
    (first.candidates as unknown as unknown[]).push({});
  });
});
