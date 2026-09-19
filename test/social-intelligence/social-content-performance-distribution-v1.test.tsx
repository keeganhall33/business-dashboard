import assert from "node:assert/strict";
import test from "node:test";

import {
  compileSocialContentPerformanceDistributionV1
} from "../../src/lib/social-intelligence/social-content-performance-distribution-v1";
import {
  compileSocialContentPerformanceReviewV1,
  type SocialContentPerformanceCandidateInputV1,
  type SocialContentPerformanceReviewV1
} from "../../src/lib/social-intelligence/social-content-performance-review-v1";

const reviewPolicy = {
  maxEvidenceAgeHours: 96,
  minimumComparableCohortSize: 3,
  outperformingRatioAtLeast: 1.5,
  underperformingRatioAtMost: 0.67
} as const;

const distributionPolicy = {
  maxReviewAgeHours: 24,
  minimumDistributionSize: 3
} as const;

function candidate(
  contentId: string,
  metricValue: number,
  overrides: Partial<SocialContentPerformanceCandidateInputV1> = {}
): SocialContentPerformanceCandidateInputV1 {
  return {
    platform: "INSTAGRAM",
    accountId: "keegan-hall",
    contentId,
    publishedAt: "2026-09-17T12:00:00.000Z",
    observedAt: "2026-09-19T00:00:00.000Z",
    sourceState: "COMPLETE",
    amplificationType: "ORGANIC",
    ageBucket: "1_7D",
    formatKey: "REEL",
    metric: "REACH",
    metricValue,
    audienceAtObservation: 10_000,
    comparableCohortSize: 12,
    comparableMedianPerThousandAudience: 30,
    contentDnaRef: `dna:${contentId}`,
    metricEvidenceRefs: [`metric:${contentId}`],
    audienceEvidenceRefs: [`audience:${contentId}`],
    comparableCohortEvidenceRefs: ["cohort:instagram:reel:organic:1_7d"],
    ...overrides
  };
}

function readyReview(candidates: readonly SocialContentPerformanceCandidateInputV1[]): SocialContentPerformanceReviewV1 {
  return compileSocialContentPerformanceReviewV1({
    candidates,
    policy: reviewPolicy,
    evaluatedAt: "2026-09-19T01:00:00.000Z"
  });
}

test("builds quartile distributions from exact comparable content cohorts", () => {
  const review = readyReview([
    candidate("one", 100),
    candidate("two", 200),
    candidate("three", 300),
    candidate("four", 400),
    candidate("five", 500)
  ]);

  const result = compileSocialContentPerformanceDistributionV1({
    review,
    generatedAt: "2026-09-19T02:00:00.000Z",
    policy: distributionPolicy
  });

  assert.equal(result.status, "READY");
  assert.equal(result.distributions.length, 1);
  const distribution = result.distributions[0];
  assert.equal(distribution?.itemCount, 5);
  assert.equal(distribution?.minimumPerThousandAudience, 10);
  assert.equal(distribution?.firstQuartilePerThousandAudience, 20);
  assert.equal(distribution?.medianPerThousandAudience, 30);
  assert.equal(distribution?.thirdQuartilePerThousandAudience, 40);
  assert.equal(distribution?.maximumPerThousandAudience, 50);
  assert.equal(distribution?.interquartileRangePerThousandAudience, 20);
  assert.equal(distribution?.distributionMethod, "LINEAR_INTERPOLATED_QUARTILES");
  assert.equal(result.crossPlatformAggregationPerformed, false);
  assert.equal(result.crossPlatformPerformanceRankingPerformed, false);
  assert.equal(result.causalClaim, false);
  assert.equal(result.attributionClaim, false);
  assert.equal(result.competitorPerformanceClaim, false);
  assert.equal(result.recommendationAuthority, "NONE");
});

test("keeps platform, account, age, format, amplification and metric cohorts separate", () => {
  const review = readyReview([
    candidate("ig-1", 300),
    candidate("ig-2", 400),
    candidate("ig-3", 500),
    candidate("yt-1", 800, {
      platform: "YOUTUBE",
      accountId: "keegan-youtube",
      ageBucket: "8_30D",
      amplificationType: "PAID",
      formatKey: "SHORT",
      metric: "VIEWS",
      audienceAtObservation: 20_000,
      comparableMedianPerThousandAudience: 20,
      comparableCohortEvidenceRefs: ["cohort:youtube:short:paid:8_30d"]
    }),
    candidate("yt-2", 1_000, {
      platform: "YOUTUBE",
      accountId: "keegan-youtube",
      ageBucket: "8_30D",
      amplificationType: "PAID",
      formatKey: "SHORT",
      metric: "VIEWS",
      audienceAtObservation: 20_000,
      comparableMedianPerThousandAudience: 20,
      comparableCohortEvidenceRefs: ["cohort:youtube:short:paid:8_30d"]
    }),
    candidate("yt-3", 1_200, {
      platform: "YOUTUBE",
      accountId: "keegan-youtube",
      ageBucket: "8_30D",
      amplificationType: "PAID",
      formatKey: "SHORT",
      metric: "VIEWS",
      audienceAtObservation: 20_000,
      comparableMedianPerThousandAudience: 20,
      comparableCohortEvidenceRefs: ["cohort:youtube:short:paid:8_30d"]
    })
  ]);

  const result = compileSocialContentPerformanceDistributionV1({
    review,
    generatedAt: "2026-09-19T02:00:00.000Z",
    policy: distributionPolicy
  });

  assert.equal(result.status, "READY");
  assert.equal(result.distributions.length, 2);
  assert.deepEqual(
    result.distributions.map((row) => [row.platform, row.accountId, row.metric, row.ageBucket, row.formatKey, row.amplificationType]),
    [
      ["INSTAGRAM", "keegan-hall", "REACH", "1_7D", "REEL", "ORGANIC"],
      ["YOUTUBE", "keegan-youtube", "VIEWS", "8_30D", "SHORT", "PAID"]
    ]
  );
  assert.match(result.guardrails.join(" "), /unlike platform metrics/i);
});

test("surfaces insufficient cohorts instead of inventing a distribution", () => {
  const review = readyReview([
    candidate("reel-1", 300),
    candidate("reel-2", 400),
    candidate("photo-1", 200, { formatKey: "PHOTO", comparableCohortEvidenceRefs: ["cohort:instagram:photo:organic:1_7d"] })
  ]);

  const result = compileSocialContentPerformanceDistributionV1({
    review,
    generatedAt: "2026-09-19T02:00:00.000Z",
    policy: distributionPolicy
  });

  assert.equal(result.status, "NO_DISTRIBUTIONS");
  assert.deepEqual(result.reasons, ["INSUFFICIENT_GROUP_SIZE"]);
  assert.equal(result.distributions.length, 0);
  assert.equal(result.insufficientGroups.length, 2);
  assert.deepEqual(result.insufficientGroups.map((row) => row.itemCount), [1, 2]);
  assert.deepEqual(result.evidenceRefs, []);
});

test("returns partial truth when some exact cohorts are large enough and others are not", () => {
  const review = readyReview([
    candidate("reel-1", 300),
    candidate("reel-2", 400),
    candidate("reel-3", 500),
    candidate("photo-1", 200, { formatKey: "PHOTO", comparableCohortEvidenceRefs: ["cohort:instagram:photo:organic:1_7d"] })
  ]);

  const result = compileSocialContentPerformanceDistributionV1({
    review,
    generatedAt: "2026-09-19T02:00:00.000Z",
    policy: distributionPolicy
  });

  assert.equal(result.status, "PARTIAL");
  assert.deepEqual(result.reasons, ["INSUFFICIENT_GROUP_SIZE"]);
  assert.equal(result.distributions.length, 1);
  assert.equal(result.insufficientGroups.length, 1);
  assert.equal(result.distributions[0]?.formatKey, "REEL");
  assert.equal(result.insufficientGroups[0]?.formatKey, "PHOTO");
});

test("fails closed when the upstream review is not ready, stale or future-dated", () => {
  const partialReview = compileSocialContentPerformanceReviewV1({
    candidates: [candidate("valid", 300), candidate("partial", 300, { sourceState: "PARTIAL" })],
    policy: reviewPolicy,
    evaluatedAt: "2026-09-19T01:00:00.000Z"
  });
  assert.equal(partialReview.status, "VERIFY_REQUIRED");

  const partial = compileSocialContentPerformanceDistributionV1({
    review: partialReview,
    generatedAt: "2026-09-19T02:00:00.000Z",
    policy: distributionPolicy
  });
  assert.equal(partial.status, "VERIFY_REQUIRED");
  assert.deepEqual(partial.reasons, ["UPSTREAM_NOT_READY"]);
  assert.deepEqual(partial.distributions, []);

  const review = readyReview([candidate("one", 300), candidate("two", 400), candidate("three", 500)]);
  const stale = compileSocialContentPerformanceDistributionV1({
    review,
    generatedAt: "2026-09-21T02:00:00.000Z",
    policy: distributionPolicy
  });
  assert.equal(stale.status, "VERIFY_REQUIRED");
  assert.deepEqual(stale.reasons, ["REVIEW_TOO_OLD"]);

  const future = compileSocialContentPerformanceDistributionV1({
    review,
    generatedAt: "2026-09-18T02:00:00.000Z",
    policy: distributionPolicy
  });
  assert.equal(future.status, "VERIFY_REQUIRED");
  assert.deepEqual(future.reasons, ["REVIEW_FROM_FUTURE"]);
});

test("rejects widened upstream authority, malformed policy and duplicate exact content identity", () => {
  const review = readyReview([candidate("one", 300), candidate("two", 400), candidate("three", 500)]);
  const widened = structuredClone(review) as SocialContentPerformanceReviewV1 & { recommendationAuthority: string };
  (widened as unknown as { recommendationAuthority: string }).recommendationAuthority = "EXECUTE";
  assert.throws(() => compileSocialContentPerformanceDistributionV1({
    review: widened as SocialContentPerformanceReviewV1,
    generatedAt: "2026-09-19T02:00:00.000Z",
    policy: distributionPolicy
  }), /widens interpretation or action authority/);

  assert.throws(() => compileSocialContentPerformanceDistributionV1({
    review,
    generatedAt: "2026-09-19T02:00:00.000Z",
    policy: { ...distributionPolicy, minimumDistributionSize: 2 }
  }), /must be at least 3/);

  const duplicated = structuredClone(review) as unknown as { items: unknown[] } & SocialContentPerformanceReviewV1;
  duplicated.items.push(structuredClone(review.items[0]));
  assert.throws(() => compileSocialContentPerformanceDistributionV1({
    review: duplicated,
    generatedAt: "2026-09-19T02:00:00.000Z",
    policy: distributionPolicy
  }), /duplicate distribution item/);
});

test("is deterministic, preserves inputs and deeply freezes distribution outputs", () => {
  const review = readyReview([candidate("one", 300), candidate("two", 400), candidate("three", 500)]);
  const input = {
    review,
    generatedAt: "2026-09-19T02:00:00.000Z",
    policy: distributionPolicy
  } as const;
  const before = structuredClone(input);
  const first = compileSocialContentPerformanceDistributionV1(input);
  const second = compileSocialContentPerformanceDistributionV1(input);

  assert.deepEqual(input, before);
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.distributions));
  assert.ok(Object.isFrozen(first.distributions[0]));
  assert.ok(Object.isFrozen(first.distributions[0]?.classificationCounts));
  assert.ok(Object.isFrozen(first.distributions[0]?.evidenceRefs));
  assert.throws(() => {
    (first.distributions as unknown as unknown[]).push({});
  });
});
