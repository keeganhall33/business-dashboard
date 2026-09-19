import assert from "node:assert/strict";
import test from "node:test";

import {
  compileSocialContentPerformanceReviewV1,
  type SocialContentPerformanceCandidateInputV1
} from "../../src/lib/social-intelligence/social-content-performance-review-v1";

const policy = {
  maxEvidenceAgeHours: 72,
  minimumComparableCohortSize: 5,
  outperformingRatioAtLeast: 1.5,
  underperformingRatioAtMost: 0.67
} as const;

function candidate(
  contentId: string,
  metricValue: number,
  comparableMedianPerThousandAudience = 50,
  overrides: Partial<SocialContentPerformanceCandidateInputV1> = {}
): SocialContentPerformanceCandidateInputV1 {
  return {
    platform: "INSTAGRAM",
    accountId: "keegan-hall",
    contentId,
    publishedAt: "2026-09-17T12:00:00.000Z",
    observedAt: "2026-09-18T12:00:00.000Z",
    sourceState: "COMPLETE",
    amplificationType: "ORGANIC",
    ageBucket: "1_7D",
    formatKey: "REEL",
    metric: "REACH",
    metricValue,
    audienceAtObservation: 10_000,
    comparableCohortSize: 12,
    comparableMedianPerThousandAudience,
    contentDnaRef: `content-dna:${contentId}`,
    metricEvidenceRefs: [`metric:${contentId}`],
    audienceEvidenceRefs: [`audience:${contentId}`],
    comparableCohortEvidenceRefs: ["cohort:instagram:reel:1_7d:organic"],
    ...overrides
  };
}

test("ranks three evidenced winners and three evidenced underperformers against comparable within-platform baselines", () => {
  const result = compileSocialContentPerformanceReviewV1({
    candidates: [
      candidate("winner-1", 1_000),
      candidate("winner-2", 900),
      candidate("winner-3", 800),
      candidate("under-1", 300),
      candidate("under-2", 250),
      candidate("under-3", 200)
    ],
    policy,
    evaluatedAt: "2026-09-19T00:00:00.000Z"
  });

  assert.equal(result.status, "READY");
  assert.deepEqual(result.outperformers.map((row) => row.contentId), ["winner-1", "winner-2", "winner-3"]);
  assert.deepEqual(result.underperformers.map((row) => row.contentId), ["under-3", "under-2", "under-1"]);
  assert.equal(result.outperformers[0]?.observedPerThousandAudience, 100);
  assert.equal(result.outperformers[0]?.ratioToComparableMedian, 2);
  assert.match(result.outperformers[0]?.explanation ?? "", /same INSTAGRAM account, age bucket, format, and amplification class/);
  assert.equal(result.causalClaim, false);
  assert.equal(result.attributionClaim, false);
  assert.equal(result.competitorPerformanceClaim, false);
  assert.equal(result.crossPlatformPerformanceComparisonAuthority, "NONE");
  assert.equal(result.recommendationAuthority, "NONE");
});

test("keeps paid, mixed, platform and age semantics explicit instead of claiming cross-platform comparability", () => {
  const result = compileSocialContentPerformanceReviewV1({
    candidates: [
      candidate("instagram-organic", 800),
      candidate("youtube-paid", 1_200, 60, {
        platform: "YOUTUBE",
        accountId: "keegan-youtube",
        amplificationType: "PAID",
        ageBucket: "8_30D",
        formatKey: "SHORT",
        audienceAtObservation: 20_000,
        comparableCohortEvidenceRefs: ["cohort:youtube:short:8_30d:paid"]
      })
    ],
    policy,
    evaluatedAt: "2026-09-19T00:00:00.000Z"
  });

  assert.equal(result.status, "READY");
  assert.equal(result.interpretation, "WITHIN_PLATFORM_ACCOUNT_AGE_FORMAT_AMPLIFICATION_BASELINE_ONLY");
  assert.equal(result.items[0]?.platform, "INSTAGRAM");
  assert.equal(result.items[1]?.platform, "YOUTUBE");
  assert.match(result.guardrails.join(" "), /no cross-platform performance ranking/i);
});

test("fails closed on stale, partial, future, under-sized or evidence-free candidates", () => {
  const result = compileSocialContentPerformanceReviewV1({
    candidates: [
      candidate("valid", 800),
      candidate("partial", 800, 50, { sourceState: "PARTIAL" }),
      candidate("stale", 800, 50, { observedAt: "2026-09-01T12:00:00.000Z" }),
      candidate("future", 800, 50, { publishedAt: "2026-09-20T12:00:00.000Z", observedAt: "2026-09-20T13:00:00.000Z" }),
      candidate("small-cohort", 800, 50, { comparableCohortSize: 2 }),
      candidate("missing-evidence", 800, 50, { metricEvidenceRefs: [] })
    ],
    policy,
    evaluatedAt: "2026-09-19T00:00:00.000Z"
  });

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.deepEqual(result.items.map((row) => row.contentId), ["valid"]);
  assert.deepEqual(result.reasons, [
    "COMPARABLE_COHORT_TOO_SMALL",
    "CONTENT_FROM_FUTURE",
    "EVIDENCE_FROM_FUTURE",
    "EVIDENCE_TOO_OLD",
    "MISSING_REQUIRED_EVIDENCE",
    "SOURCE_NOT_COMPLETE"
  ]);
  assert.ok(result.evidenceRefs.every((ref) => !ref.includes("partial") && !ref.includes("stale") && !ref.includes("future") && !ref.includes("small-cohort") && !ref.includes("missing-evidence")));
});

test("preserves UNKNOWN from absent candidates instead of manufacturing performance", () => {
  const result = compileSocialContentPerformanceReviewV1({
    candidates: [],
    policy,
    evaluatedAt: "2026-09-19T00:00:00.000Z"
  });

  assert.equal(result.status, "NO_COMPARABLE_CONTENT");
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.outperformers, []);
  assert.deepEqual(result.underperformers, []);
  assert.deepEqual(result.evidenceRefs, []);
});

test("rejects malformed comparison policy, duplicate accepted identities and unsafe raw provider text", () => {
  assert.throws(() => compileSocialContentPerformanceReviewV1({
    candidates: [candidate("one", 800)],
    policy: { ...policy, underperformingRatioAtMost: 2 },
    evaluatedAt: "2026-09-19T00:00:00.000Z"
  }), /must be below/);

  assert.throws(() => compileSocialContentPerformanceReviewV1({
    candidates: [candidate("duplicate", 800), candidate("duplicate", 900)],
    policy,
    evaluatedAt: "2026-09-19T00:00:00.000Z"
  }), /duplicate comparable content item/);

  const unsafe = {
    candidates: [{ ...candidate("unsafe", 800), rawPayload: "private provider body" }],
    policy,
    evaluatedAt: "2026-09-19T00:00:00.000Z"
  } as unknown as Parameters<typeof compileSocialContentPerformanceReviewV1>[0];
  assert.throws(() => compileSocialContentPerformanceReviewV1(unsafe), /rawPayload is prohibited/);
});

test("is deterministic, preserves caller input and deep-freezes returned review", () => {
  const input = {
    candidates: [candidate("winner", 800), candidate("under", 200)],
    policy,
    evaluatedAt: "2026-09-19T00:00:00.000Z"
  } as const;
  const before = structuredClone(input);
  const first = compileSocialContentPerformanceReviewV1(input);
  const second = compileSocialContentPerformanceReviewV1(input);

  assert.deepEqual(input, before);
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.items));
  assert.ok(Object.isFrozen(first.items[0]));
  assert.ok(Object.isFrozen(first.items[0]?.evidenceRefs));
  assert.throws(() => {
    (first.items as SocialContentPerformanceCandidateInputV1[]).push(candidate("mutation", 800));
  });
});
