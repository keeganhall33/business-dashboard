import assert from "node:assert/strict";
import test from "node:test";

import {
  compileSocialAcquisitionCohortOutcomeReviewV1,
  type SocialAcquisitionCohortOutcomeReviewInputV1,
} from "@/lib/social-intelligence/social-acquisition-cohort-outcome-review-v1";

const generatedAt = "2026-09-19T12:00:00.000Z";
const maxEvidenceAgeMs = 1000 * 60 * 60 * 24 * 30;

function cohort(overrides: Partial<SocialAcquisitionCohortOutcomeReviewInputV1["cohorts"][number]> = {}) {
  return {
    cohortId: "cohort:ig:post-1:2026-09",
    platform: "INSTAGRAM" as const,
    accountRef: "social-account:instagram:keegan",
    sourceKind: "EXACT_CONTENT_REF" as const,
    sourceRef: "INSTAGRAM:post-1",
    acquiredStart: "2026-09-01T00:00:00.000Z",
    acquiredEnd: "2026-09-02T00:00:00.000Z",
    initialMemberCount: 100,
    observedAt: "2026-09-03T12:00:00.000Z",
    completeThroughAt: "2026-09-02T00:00:00.000Z",
    truthState: "KNOWN" as const,
    evidenceRefs: ["evidence:cohort:post-1"],
    ...overrides,
  };
}

function retention(
  overrides: Partial<SocialAcquisitionCohortOutcomeReviewInputV1["retentionObservations"][number]> = {},
) {
  return {
    retentionObservationId: "retention:1",
    cohortId: "cohort:ig:post-1:2026-09",
    windowStart: "2026-09-03T00:00:00.000Z",
    windowEnd: "2026-09-08T00:00:00.000Z",
    eligibleMemberCount: 100,
    engagedMemberCount: 45,
    observedAt: "2026-09-09T12:00:00.000Z",
    completeThroughAt: "2026-09-08T00:00:00.000Z",
    truthState: "KNOWN" as const,
    evidenceRefs: ["evidence:retention:1"],
    ...overrides,
  };
}

function secondRetention(
  overrides: Partial<SocialAcquisitionCohortOutcomeReviewInputV1["retentionObservations"][number]> = {},
) {
  return retention({
    retentionObservationId: "retention:2",
    windowStart: "2026-09-09T00:00:00.000Z",
    windowEnd: "2026-09-15T00:00:00.000Z",
    eligibleMemberCount: 96,
    engagedMemberCount: 36,
    observedAt: "2026-09-16T12:00:00.000Z",
    completeThroughAt: "2026-09-15T00:00:00.000Z",
    evidenceRefs: ["evidence:retention:2"],
    ...overrides,
  });
}

function outcome(
  overrides: Partial<SocialAcquisitionCohortOutcomeReviewInputV1["outcomeObservations"][number]> = {},
) {
  return {
    outcomeObservationId: "outcome:1",
    cohortId: "cohort:ig:post-1:2026-09",
    kind: "INQUIRY" as const,
    windowStart: "2026-09-03T00:00:00.000Z",
    windowEnd: "2026-09-15T00:00:00.000Z",
    memberCount: 3,
    eventCount: 3,
    linkBasis: "EXACT_COHORT_MEMBERSHIP" as const,
    attributionClass: "DIRECT_TRACKED" as const,
    observedAt: "2026-09-16T12:00:00.000Z",
    completeThroughAt: "2026-09-15T00:00:00.000Z",
    truthState: "KNOWN" as const,
    evidenceRefs: ["evidence:outcome:1"],
    ...overrides,
  };
}

function compile(overrides: Partial<SocialAcquisitionCohortOutcomeReviewInputV1> = {}) {
  return compileSocialAcquisitionCohortOutcomeReviewV1({
    generatedAt,
    maxEvidenceAgeMs,
    cohorts: [cohort()],
    retentionObservations: [retention(), secondRetention()],
    outcomeObservations: [outcome()],
    ...overrides,
  });
}

test("surfaces a cohort learning review only with repeated retention and exact downstream evidence", () => {
  const result = compile();

  assert.equal(result.status, "READY");
  assert.equal(result.cohorts[0].status, "READY_FOR_COHORT_LEARNING_REVIEW");
  assert.equal(result.cohorts[0].persistentEngagementEvidence, "OBSERVED_ACROSS_MULTIPLE_WINDOWS");
  assert.equal(result.cohorts[0].businessOutcomeEvidence, "DIRECT_TRACKED_PRESENT");
  assert.equal(result.cohorts[0].qualifiedDirectOutcomeObservationCount, 1);
  assert.equal(result.cohorts[0].latestObservedRetentionRatio, 36 / 96);
  assert.equal(result.cohorts[0].learningCandidate, "COHORT_QUALITY_REVIEW");
  assert.equal(result.cohorts[0].causalClaim, false);
  assert.equal(result.cohorts[0].revenueAttributionClaim, false);
  assert.equal(result.authority.durableLearningPromotionAllowed, false);
  assert.equal(result.authority.futurePriorUpdateAllowed, false);
  assert.equal(result.authority.publicPostingAllowed, false);
  assert.equal(result.authority.paidAmplificationAllowed, false);
});

test("keeps one retention window observational instead of claiming persistence", () => {
  const result = compile({ retentionObservations: [retention()] });

  assert.equal(result.status, "PARTIAL");
  assert.equal(result.cohorts[0].status, "OBSERVATIONAL_ONLY");
  assert.equal(result.cohorts[0].persistentEngagementEvidence, "SINGLE_WINDOW_ONLY");
  assert.equal(result.cohorts[0].learningCandidate, "NONE");
});

test("keeps aggregate outcome associations as context only", () => {
  const result = compile({
    outcomeObservations: [
      outcome({
        linkBasis: "AGGREGATE_ASSOCIATION",
        attributionClass: "SUPPORTED_ASSOCIATION",
      }),
    ],
  });

  assert.equal(result.cohorts[0].status, "OBSERVATIONAL_ONLY");
  assert.equal(result.cohorts[0].businessOutcomeEvidence, "ASSOCIATION_ONLY");
  assert.equal(result.cohorts[0].qualifiedDirectOutcomeObservationCount, 0);
  assert.equal(result.cohorts[0].qualifiedAssociatedOutcomeObservationCount, 1);
  assert.equal(result.cohorts[0].outcomeObservations[0].decisionUse, "CONTEXT_ONLY");
});

test("does not treat site sessions as qualified business outcomes", () => {
  const result = compile({ outcomeObservations: [outcome({ kind: "SITE_SESSION" })] });

  assert.equal(result.cohorts[0].qualifiedDirectOutcomeObservationCount, 0);
  assert.equal(result.cohorts[0].businessOutcomeEvidence, "NOT_ESTABLISHED");
  assert.equal(result.cohorts[0].status, "OBSERVATIONAL_ONLY");
});

test("fails closed on stale, partial, or future cohort evidence", () => {
  const stale = compile({
    maxEvidenceAgeMs: 1000 * 60 * 60 * 24 * 2,
  });
  assert.equal(stale.cohorts[0].status, "VERIFY_REQUIRED");
  assert.ok(stale.cohorts[0].verificationReasons.some((reason) => reason.includes("STALE_OBSERVATION")));

  const partial = compile({ cohorts: [cohort({ truthState: "PARTIAL" })] });
  assert.equal(partial.cohorts[0].status, "VERIFY_REQUIRED");
  assert.ok(partial.cohorts[0].verificationReasons.includes("COHORT_PARTIAL"));

  const future = compile({ cohorts: [cohort({ observedAt: "2026-09-20T12:00:00.000Z", completeThroughAt: "2026-09-02T00:00:00.000Z" })] });
  assert.equal(future.cohorts[0].status, "VERIFY_REQUIRED");
  assert.ok(future.cohorts[0].verificationReasons.includes("COHORT_FUTURE_OBSERVATION"));
});

test("rejects attribution semantics that overclaim exact cohort linkage", () => {
  const result = compile({
    outcomeObservations: [
      outcome({
        linkBasis: "EXACT_COHORT_MEMBERSHIP",
        attributionClass: "SUPPORTED_ASSOCIATION",
      }),
    ],
  });

  assert.equal(result.cohorts[0].status, "VERIFY_REQUIRED");
  assert.ok(result.cohorts[0].verificationReasons.includes("OUTCOME_EXACT_MEMBERSHIP_REQUIRES_DIRECT_TRACKING"));
});

test("blocks overlapping retention windows from becoming persistence evidence", () => {
  const result = compile({
    retentionObservations: [
      retention(),
      secondRetention({ windowStart: "2026-09-07T00:00:00.000Z" }),
    ],
  });

  assert.equal(result.cohorts[0].status, "VERIFY_REQUIRED");
  assert.ok(result.cohorts[0].verificationReasons.includes("RETENTION_WINDOWS_OVERLAP"));
  assert.equal(result.cohorts[0].learningCandidate, "NONE");
});

test("rejects observations bound to an unknown cohort identity", () => {
  const result = compile({
    retentionObservations: [retention({ cohortId: "cohort:unknown" })],
  });

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.ok(result.verificationReasons.includes("RETENTION_UNKNOWN_COHORT:cohort:unknown"));
});

test("rejects raw personal contact data at the cohort boundary", () => {
  assert.throws(
    () => compile({ cohorts: [cohort({ accountRef: "keegan@example.com" })] }),
    /raw personal contact data/,
  );
});

test("rejects counts that could manufacture cohort membership", () => {
  assert.throws(
    () => compile({ retentionObservations: [retention({ eligibleMemberCount: 101 })] }),
    /exceeds initial cohort/,
  );
  assert.throws(
    () => compile({ outcomeObservations: [outcome({ memberCount: 101, eventCount: 101 })] }),
    /exceeds initial cohort/,
  );
});

test("is deterministic, deeply immutable, and preserves caller input", () => {
  const input: SocialAcquisitionCohortOutcomeReviewInputV1 = {
    generatedAt,
    maxEvidenceAgeMs,
    cohorts: [cohort()],
    retentionObservations: [retention(), secondRetention()],
    outcomeObservations: [outcome()],
  };
  const before = structuredClone(input);
  const first = compileSocialAcquisitionCohortOutcomeReviewV1(input);
  const second = compileSocialAcquisitionCohortOutcomeReviewV1(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.cohorts), true);
  assert.equal(Object.isFrozen(first.cohorts[0]), true);
  assert.equal(Object.isFrozen(first.cohorts[0].retentionObservations), true);
  assert.equal(Object.isFrozen(first.authority), true);
});
