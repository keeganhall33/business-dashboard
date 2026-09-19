import assert from "node:assert/strict";
import test from "node:test";

import {
  compileAiSearchAuthorityEvaluationV1,
  type AiSearchAuthorityEvaluationV1,
  type AiSearchAuthorityObservationInputV1,
  type AiSearchExpectedQueryInputV1
} from "../../src/lib/social-intelligence/ai-search-authority-observation-v1";
import {
  compileAiSearchAuthorityPersistenceReviewV1,
  type AiSearchAuthorityPersistenceReviewInputV1
} from "../../src/lib/social-intelligence/ai-search-authority-persistence-review-v1";

function plan(queryRef: string): AiSearchExpectedQueryInputV1 {
  return {
    engine: "OPENAI_CHATGPT",
    queryRef,
    queryClass: "ARTIST_DISCOVERY",
    targetEntityRef: "person:keegan-hall",
    planEvidenceRefs: [`plan:${queryRef}`]
  };
}

function observation(
  queryRef: string,
  resultState: AiSearchAuthorityObservationInputV1["resultState"],
  observedAt: string,
  overrides: Partial<AiSearchAuthorityObservationInputV1> = {}
): AiSearchAuthorityObservationInputV1 {
  return {
    observationId: `obs:${observedAt}:${queryRef}`,
    engine: "OPENAI_CHATGPT",
    queryRef,
    queryClass: "ARTIST_DISCOVERY",
    targetEntityRef: "person:keegan-hall",
    observedAt,
    capturedAt: observedAt,
    resultState,
    citedSourceRefs: resultState === "MENTIONED_WITH_CITATION" ? [`source:${queryRef}`] : [],
    evidenceRefs: [`evidence:${observedAt}:${queryRef}`],
    ...overrides
  };
}

function evaluation(
  day: number,
  states: readonly AiSearchAuthorityObservationInputV1["resultState"][],
  overrides: Partial<Parameters<typeof compileAiSearchAuthorityEvaluationV1>[0]> = {}
): AiSearchAuthorityEvaluationV1 {
  const startDay = String(day).padStart(2, "0");
  const endDay = String(day + 1).padStart(2, "0");
  const observedAt = `2026-09-${startDay}T12:00:00Z`;
  const expectedQueries = [plan("artist-1"), plan("artist-2")];
  return compileAiSearchAuthorityEvaluationV1({
    asOf: `2026-09-${endDay}T01:00:00Z`,
    window: {
      startAt: `2026-09-${startDay}T00:00:00Z`,
      endAt: `2026-09-${endDay}T00:00:00Z`
    },
    maxObservationAgeDays: 7,
    expectedQueries,
    observations: expectedQueries.map((row, index) =>
      observation(row.queryRef, states[index] ?? "NOT_MENTIONED", observedAt)
    ),
    ...overrides
  });
}

function input(
  evaluations: readonly AiSearchAuthorityEvaluationV1[],
  overrides: Partial<AiSearchAuthorityPersistenceReviewInputV1> = {}
): AiSearchAuthorityPersistenceReviewInputV1 {
  return {
    evaluations,
    evaluatedAt: "2026-09-19T02:00:00Z",
    policy: {
      minStableWindows: 2,
      maxLatestEvaluationAgeHours: 25,
      maxGapHours: 0
    },
    ...overrides
  };
}

test("surfaces only persistent fixed-query AI-search changes for internal alert review", () => {
  const result = compileAiSearchAuthorityPersistenceReviewV1(
    input([
      evaluation(15, ["NOT_MENTIONED", "MENTIONED_WITH_CITATION"]),
      evaluation(16, ["MENTIONED", "MENTIONED"]),
      evaluation(17, ["MENTIONED", "MENTIONED"]),
      evaluation(18, ["MENTIONED", "MENTIONED"])
    ])
  );

  assert.equal(result.status, "READY");
  assert.equal(result.attentionState, "READY_FOR_INTERNAL_ALERT_REVIEW");
  assert.equal(result.queryCount, 2);
  assert.deepEqual(
    result.signals.map((row) => [row.queryRef, row.kind, row.stableWindowCount]),
    [
      ["artist-1", "PERSISTENT_MENTION_GAIN", 3],
      ["artist-2", "PERSISTENT_CITATION_LOSS", 3]
    ]
  );
  assert.equal(result.signals.every((row) => row.interpretation === "DIRECTLY_OBSERVED_PERSISTENT_FIXED_QUERY_CHANGE"), true);
  assert.equal(result.signals.every((row) => row.evidenceRefs.length >= 3), true);
  assert.equal(result.confidence, null);
  assert.equal(result.authorityScore, null);
  assert.equal(result.causality, "NOT_ESTABLISHED");
  assert.equal(result.attribution, "NOT_ESTABLISHED");
  assert.equal(result.notificationAuthority, "NONE");
  assert.equal(result.providerWriteAuthority, "NONE");
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
  assert.equal(result.signals.every((row) => !row.competitorPerformanceClaim && !row.endorsementClaim), true);
  assert.equal(result.signals.every((row) => !row.relationshipClaim && !row.rankingClaim), true);
});

test("does not promote a one-window fluctuation into a persistent signal", () => {
  const result = compileAiSearchAuthorityPersistenceReviewV1(
    input([
      evaluation(16, ["NOT_MENTIONED", "NOT_MENTIONED"]),
      evaluation(17, ["NOT_MENTIONED", "NOT_MENTIONED"]),
      evaluation(18, ["MENTIONED", "NOT_MENTIONED"])
    ])
  );

  assert.equal(result.status, "READY");
  assert.equal(result.attentionState, "NO_PERSISTENT_CHANGE");
  assert.deepEqual(result.signals, []);
  assert.ok(result.evidenceRefs.length >= 6);
});

test("tracks the latest stable transition rather than manufacturing a lifetime trend", () => {
  const result = compileAiSearchAuthorityPersistenceReviewV1(
    input([
      evaluation(15, ["NOT_MENTIONED", "NOT_MENTIONED"]),
      evaluation(16, ["MENTIONED", "NOT_MENTIONED"]),
      evaluation(17, ["NOT_MENTIONED", "NOT_MENTIONED"]),
      evaluation(18, ["NOT_MENTIONED", "NOT_MENTIONED"])
    ])
  );

  assert.equal(result.status, "READY");
  assert.deepEqual(result.signals.map((row) => row.kind), ["PERSISTENT_MENTION_LOSS"]);
  assert.equal(result.signals[0]?.transitionObservationId.includes("2026-09-17"), true);
  assert.equal(result.signals[0]?.stableWindowCount, 2);
});

test("fails closed when there are too few windows to prove persistence", () => {
  const result = compileAiSearchAuthorityPersistenceReviewV1(
    input([evaluation(17, ["NOT_MENTIONED", "NOT_MENTIONED"]), evaluation(18, ["MENTIONED", "NOT_MENTIONED"])])
  );

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.equal(result.attentionState, "VERIFY_REQUIRED");
  assert.ok(result.reasons.includes("INSUFFICIENT_WINDOWS"));
  assert.deepEqual(result.signals, []);
  assert.equal(result.queryCount, null);
});

test("fails closed when any canonical evaluation is incomplete", () => {
  const base = evaluation(17, ["MENTIONED", "NOT_MENTIONED"]);
  const incomplete = {
    ...base,
    status: "PARTIAL",
    currentObservationCount: 1,
    missingQueryKeys: ["OPENAI_CHATGPT:artist-2"],
    observations: base.observations.slice(0, 1),
    overall: { mentionCount: null, citationCount: null, mentionRatePct: null, citationRatePct: null }
  } as AiSearchAuthorityEvaluationV1;

  const result = compileAiSearchAuthorityPersistenceReviewV1(
    input([
      evaluation(16, ["NOT_MENTIONED", "NOT_MENTIONED"]),
      incomplete,
      evaluation(18, ["MENTIONED", "NOT_MENTIONED"])
    ])
  );

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.ok(result.reasons.includes("PAIRWISE_COMPARISON_NOT_READY"));
  assert.ok(result.sequenceIssues.some((issue) => issue.includes("EVALUATION_NOT_READY") || issue.includes("INTEGRITY")));
  assert.deepEqual(result.signals, []);
  assert.deepEqual(result.evidenceRefs, []);
});

test("requires the same query identity and comparable chronology across the sequence", () => {
  const mismatched = evaluation(17, ["MENTIONED", "NOT_MENTIONED"], {
    expectedQueries: [
      { ...plan("artist-1"), targetEntityRef: "person:someone-else" },
      plan("artist-2")
    ],
    observations: [
      observation("artist-1", "MENTIONED", "2026-09-17T12:00:00Z", { targetEntityRef: "person:someone-else" }),
      observation("artist-2", "NOT_MENTIONED", "2026-09-17T12:00:00Z")
    ]
  });

  const result = compileAiSearchAuthorityPersistenceReviewV1(
    input([
      evaluation(16, ["NOT_MENTIONED", "NOT_MENTIONED"]),
      mismatched,
      evaluation(18, ["MENTIONED", "NOT_MENTIONED"])
    ])
  );

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.ok(result.reasons.includes("PAIRWISE_COMPARISON_NOT_READY"));
  assert.ok(result.sequenceIssues.some((issue) => issue.includes("QUERY_IDENTITY_MISMATCH")));
  assert.deepEqual(result.signals, []);
});

test("revalidates latest freshness instead of trusting old CURRENT labels", () => {
  const result = compileAiSearchAuthorityPersistenceReviewV1(
    input(
      [
        evaluation(15, ["NOT_MENTIONED", "NOT_MENTIONED"]),
        evaluation(16, ["MENTIONED", "NOT_MENTIONED"]),
        evaluation(17, ["MENTIONED", "NOT_MENTIONED"])
      ],
      {
        evaluatedAt: "2026-09-20T12:00:00Z",
        policy: { minStableWindows: 2, maxLatestEvaluationAgeHours: 6, maxGapHours: 0 }
      }
    )
  );

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.ok(result.reasons.includes("LATEST_EVALUATION_TOO_OLD"));
  assert.deepEqual(result.signals, []);
});

test("rejects unsafe policy bounds and raw prompt/answer material through canonical validation", () => {
  assert.throws(
    () => compileAiSearchAuthorityPersistenceReviewV1(input([], { policy: { minStableWindows: 1, maxLatestEvaluationAgeHours: 6, maxGapHours: 0 } })),
    /minStableWindows/
  );

  const unsafe = {
    ...evaluation(17, ["MENTIONED", "NOT_MENTIONED"]),
    observations: [
      { ...evaluation(17, ["MENTIONED", "NOT_MENTIONED"]).observations[0], answerText: "raw model output" },
      evaluation(17, ["MENTIONED", "NOT_MENTIONED"]).observations[1]
    ]
  } as AiSearchAuthorityEvaluationV1;

  assert.throws(
    () =>
      compileAiSearchAuthorityPersistenceReviewV1(
        input([evaluation(16, ["NOT_MENTIONED", "NOT_MENTIONED"]), unsafe, evaluation(18, ["MENTIONED", "NOT_MENTIONED"])])
      ),
    /prohibited/
  );
});
