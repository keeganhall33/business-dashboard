import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCanonicalSocialAccountSnapshotV1,
  type CanonicalSocialAccountSnapshotV1,
  type SocialContentInputV1
} from "../../src/lib/social-intelligence/social-canonical-v1";
import {
  compileSocialContentPerformanceReviewV1,
  type SocialContentPerformanceCandidateInputV1,
  type SocialContentPerformanceReviewV1
} from "../../src/lib/social-intelligence/social-content-performance-review-v1";
import {
  compileSocialContentFatigueReviewV1,
  type SocialContentFatiguePolicyV1
} from "../../src/lib/social-intelligence/social-content-fatigue-review-v1";

const generatedAt = "2026-09-19T12:00:00.000Z";
const performancePolicy = {
  maxEvidenceAgeHours: 72,
  minimumComparableCohortSize: 5,
  outperformingRatioAtLeast: 1.5,
  underperformingRatioAtMost: 0.67
} as const;
const fatiguePolicy: SocialContentFatiguePolicyV1 = {
  maxReviewAgeHours: 12,
  maxSnapshotAgeHours: 24,
  minimumItemsPerWindow: 3,
  minimumRecentItemsBelowPriorMedian: 2,
  recentToPriorMedianRatioAtMost: 0.75,
  maximumPriorToRecentGapDays: 7
};

const published = [
  "2026-09-08T12:00:00.000Z",
  "2026-09-09T12:00:00.000Z",
  "2026-09-10T12:00:00.000Z",
  "2026-09-11T12:00:00.000Z",
  "2026-09-12T12:00:00.000Z",
  "2026-09-13T12:00:00.000Z"
] as const;

function content(id: string, publishedAt: string, overrides: Partial<SocialContentInputV1> = {}): SocialContentInputV1 {
  return {
    contentId: id,
    publishedAt,
    format: "REEL",
    subject: "Michael Jordan",
    project: "Last Shot",
    theme: "drawing process",
    hook: "look closer",
    collaborationContext: null,
    amplificationType: "ORGANIC",
    metrics: {
      REACH: { value: 1_000, evidenceRefs: [`metric:${id}`] }
    },
    ...overrides
  };
}

function snapshot(
  ratios: readonly number[],
  overrides: Partial<Parameters<typeof compileCanonicalSocialAccountSnapshotV1>[0]> = {}
): CanonicalSocialAccountSnapshotV1 {
  return compileCanonicalSocialAccountSnapshotV1({
    platform: "INSTAGRAM",
    accountId: "keegan-hall",
    retrievedAt: "2026-09-19T09:00:00.000Z",
    sourceCoverage: {
      requestedState: "CONNECTED_AND_INGESTING",
      lastSuccessfulSyncAt: "2026-09-19T09:00:00.000Z",
      metricCoverage: ["REACH"]
    },
    periods: [],
    content: ratios.map((_, index) => content(`post-${index + 1}`, published[index]!)),
    ...overrides
  }, generatedAt, 48);
}

function performanceCandidate(
  id: string,
  publishedAt: string,
  ratio: number,
  overrides: Partial<SocialContentPerformanceCandidateInputV1> = {}
): SocialContentPerformanceCandidateInputV1 {
  return {
    platform: "INSTAGRAM",
    accountId: "keegan-hall",
    contentId: id,
    publishedAt,
    observedAt: "2026-09-19T08:00:00.000Z",
    sourceState: "COMPLETE",
    amplificationType: "ORGANIC",
    ageBucket: "8_30D",
    formatKey: "REEL",
    metric: "REACH",
    metricValue: ratio * 1_000,
    audienceAtObservation: 10_000,
    comparableCohortSize: 12,
    comparableMedianPerThousandAudience: 100,
    contentDnaRef: `dna:${id}`,
    metricEvidenceRefs: [`metric:${id}`],
    audienceEvidenceRefs: [`metric:${id}`],
    comparableCohortEvidenceRefs: ["cohort:instagram:reel:8_30d:organic"],
    ...overrides
  };
}

function performanceReview(ratios: readonly number[]): SocialContentPerformanceReviewV1 {
  return compileSocialContentPerformanceReviewV1({
    candidates: ratios.map((ratio, index) => performanceCandidate(`post-${index + 1}`, published[index]!, ratio)),
    policy: performancePolicy,
    evaluatedAt: "2026-09-19T10:00:00.000Z"
  });
}

function compile(ratios: readonly number[], snapshotOverride?: CanonicalSocialAccountSnapshotV1) {
  return compileSocialContentFatigueReviewV1({
    generatedAt,
    performanceReview: performanceReview(ratios),
    snapshots: [snapshotOverride ?? snapshot(ratios)],
    dimensions: ["SUBJECT"],
    policy: fatiguePolicy
  });
}

test("surfaces repeated normalized decline only as a fatigue review candidate", () => {
  const result = compile([1.8, 1.6, 1.7, 0.8, 0.7, 0.6]);

  assert.equal(result.status, "READY");
  assert.equal(result.patterns.length, 1);
  assert.equal(result.candidates.length, 1);
  const candidate = result.candidates[0]!;
  assert.equal(candidate.dimension, "SUBJECT");
  assert.equal(candidate.value, "Michael Jordan");
  assert.equal(candidate.prior.medianRatioToComparableBaseline, 1.7);
  assert.equal(candidate.recent.medianRatioToComparableBaseline, 0.7);
  assert.equal(candidate.recentToPriorMedianRatio, 0.412);
  assert.equal(candidate.recentItemsBelowPriorMedian, 3);
  assert.equal(candidate.classification, "FATIGUE_REVIEW_CANDIDATE");
  assert.equal(candidate.alertReviewCandidate, true);
  assert.equal(candidate.causalClaim, false);
  assert.equal(candidate.attributionClaim, false);
  assert.equal(candidate.competitorPerformanceClaim, false);
  assert.equal(candidate.endorsementClaim, false);
  assert.equal(candidate.relationshipClaim, false);
  assert.equal(candidate.confidence, null);
  assert.equal(candidate.expectedPerformance, null);
  assert.equal(result.notificationAuthority, "NONE");
  assert.equal(result.recommendationAuthority, "NONE");
  assert.equal(result.postingAuthority, "NONE");
  assert.equal(result.providerWriteAuthority, "NONE");
});

test("keeps stable repeated content out of the fatigue candidate queue", () => {
  const result = compile([1.1, 1.0, 1.2, 1.0, 1.1, 1.05]);

  assert.equal(result.status, "READY");
  assert.equal(result.patterns.length, 1);
  assert.equal(result.patterns[0]?.classification, "NO_MATERIAL_DECLINE");
  assert.equal(result.patterns[0]?.alertReviewCandidate, false);
  assert.deepEqual(result.candidates, []);
});

test("requires enough repeated comparable content instead of manufacturing a fatigue signal", () => {
  const ratios = [1.5, 1.4, 0.8, 0.7];
  const shortPublished = published.slice(0, ratios.length);
  const shortSnapshot = compileCanonicalSocialAccountSnapshotV1({
    platform: "INSTAGRAM",
    accountId: "keegan-hall",
    retrievedAt: "2026-09-19T09:00:00.000Z",
    sourceCoverage: {
      requestedState: "CONNECTED_AND_INGESTING",
      lastSuccessfulSyncAt: "2026-09-19T09:00:00.000Z",
      metricCoverage: ["REACH"]
    },
    periods: [],
    content: ratios.map((_, index) => content(`post-${index + 1}`, shortPublished[index]!))
  }, generatedAt, 48);
  const shortPerformance = compileSocialContentPerformanceReviewV1({
    candidates: ratios.map((ratio, index) => performanceCandidate(`post-${index + 1}`, shortPublished[index]!, ratio)),
    policy: performancePolicy,
    evaluatedAt: "2026-09-19T10:00:00.000Z"
  });

  const result = compileSocialContentFatigueReviewV1({
    generatedAt,
    performanceReview: shortPerformance,
    snapshots: [shortSnapshot],
    dimensions: ["SUBJECT"],
    policy: fatiguePolicy
  });

  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(result.reasons, ["INSUFFICIENT_REPEATED_CONTENT"]);
  assert.deepEqual(result.patterns, []);
  assert.deepEqual(result.candidates, []);
});

test("fails closed when canonical snapshot truth is stale even if the upstream performance review is ready", () => {
  const ratios = [1.8, 1.6, 1.7, 0.8, 0.7, 0.6];
  const stale = compileCanonicalSocialAccountSnapshotV1({
    platform: "INSTAGRAM",
    accountId: "keegan-hall",
    retrievedAt: "2026-09-17T09:00:00.000Z",
    sourceCoverage: {
      requestedState: "CONNECTED_AND_INGESTING",
      lastSuccessfulSyncAt: "2026-09-17T09:00:00.000Z",
      metricCoverage: ["REACH"]
    },
    periods: [],
    content: ratios.map((_, index) => content(`post-${index + 1}`, published[index]!))
  }, generatedAt, 168);

  const result = compile(ratios, stale);
  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.deepEqual(result.reasons, ["SNAPSHOT_TOO_OLD"]);
  assert.deepEqual(result.patterns, []);
  assert.deepEqual(result.candidates, []);
});

test("fails closed on canonical content or evidence binding drift", () => {
  const ratios = [1.8, 1.6, 1.7, 0.8, 0.7, 0.6];
  const missingContent = snapshot(ratios, {
    content: ratios.slice(0, 5).map((_, index) => content(`post-${index + 1}`, published[index]!))
  });
  const missingResult = compile(ratios, missingContent);
  assert.equal(missingResult.status, "VERIFY_REQUIRED");
  assert.deepEqual(missingResult.reasons, ["CONTENT_BINDING_MISMATCH"]);

  const evidenceDrift = snapshot(ratios, {
    content: ratios.map((_, index) => content(`post-${index + 1}`, published[index]!, {
      metrics: { REACH: { value: 1_000, evidenceRefs: [`different:${index + 1}`] } }
    }))
  });
  const evidenceResult = compile(ratios, evidenceDrift);
  assert.equal(evidenceResult.status, "VERIFY_REQUIRED");
  assert.deepEqual(evidenceResult.reasons, ["EVIDENCE_BINDING_MISMATCH"]);
});

test("does not combine exact cohort identities or accept widened upstream authority", () => {
  const ratios = [1.8, 1.6, 1.7, 0.8, 0.7, 0.6];
  const baseSnapshot = snapshot(ratios);
  const mixedPerformance = compileSocialContentPerformanceReviewV1({
    candidates: ratios.map((ratio, index) => performanceCandidate(`post-${index + 1}`, published[index]!, ratio, {
      amplificationType: index >= 3 ? "PAID" : "ORGANIC",
      comparableCohortEvidenceRefs: [index >= 3 ? "cohort:paid" : "cohort:organic"]
    })),
    policy: performancePolicy,
    evaluatedAt: "2026-09-19T10:00:00.000Z"
  });
  const mixed = compileSocialContentFatigueReviewV1({
    generatedAt,
    performanceReview: mixedPerformance,
    snapshots: [baseSnapshot],
    dimensions: ["SUBJECT"],
    policy: fatiguePolicy
  });
  assert.equal(mixed.status, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(mixed.candidates, []);

  const widened = {
    ...performanceReview(ratios),
    notificationAuthority: "SEND"
  } as unknown as SocialContentPerformanceReviewV1;
  const widenedResult = compileSocialContentFatigueReviewV1({
    generatedAt,
    performanceReview: widened,
    snapshots: [baseSnapshot],
    dimensions: ["SUBJECT"],
    policy: fatiguePolicy
  });
  assert.equal(widenedResult.status, "VERIFY_REQUIRED");
  assert.deepEqual(widenedResult.reasons, ["UPSTREAM_AUTHORITY_WIDENED"]);
});

test("is deterministic, preserves caller input, and deep freezes the review", () => {
  const ratios = [1.8, 1.6, 1.7, 0.8, 0.7, 0.6];
  const input = {
    generatedAt,
    performanceReview: performanceReview(ratios),
    snapshots: [snapshot(ratios)],
    dimensions: ["SUBJECT"] as const,
    policy: fatiguePolicy
  };
  const before = structuredClone(input);
  const first = compileSocialContentFatigueReviewV1(input);
  const second = compileSocialContentFatigueReviewV1(input);

  assert.deepEqual(input, before);
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.patterns));
  assert.ok(Object.isFrozen(first.patterns[0]));
  assert.ok(Object.isFrozen(first.patterns[0]?.prior));
  assert.ok(Object.isFrozen(first.patterns[0]?.evidenceRefs));
  assert.throws(() => {
    (first.patterns as unknown as unknown[]).push({});
  });
});
