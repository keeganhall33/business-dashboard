import assert from "node:assert/strict";
import test from "node:test";

import {
  compileAiSearchAuthorityEvaluationV1,
  type AiSearchAuthorityEvaluationV1,
  type AiSearchAuthorityObservationInputV1,
  type AiSearchExpectedQueryInputV1
} from "../../src/lib/social-intelligence/ai-search-authority-observation-v1";
import {
  compileAiSearchAuthorityChangeReviewV1,
  type AiSearchAuthorityChangeReviewInputV1
} from "../../src/lib/social-intelligence/ai-search-authority-change-review-v1";

function plan(
  engine: AiSearchExpectedQueryInputV1["engine"],
  queryRef: string,
  overrides: Partial<AiSearchExpectedQueryInputV1> = {}
): AiSearchExpectedQueryInputV1 {
  return {
    engine,
    queryRef,
    queryClass: "ARTIST_DISCOVERY",
    targetEntityRef: "person:keegan-hall",
    planEvidenceRefs: [`plan:${engine}:${queryRef}`],
    ...overrides
  };
}

function observation(
  engine: AiSearchAuthorityObservationInputV1["engine"],
  queryRef: string,
  resultState: AiSearchAuthorityObservationInputV1["resultState"],
  observedAt: string,
  overrides: Partial<AiSearchAuthorityObservationInputV1> = {}
): AiSearchAuthorityObservationInputV1 {
  return {
    observationId: `obs:${observedAt}:${engine}:${queryRef}`,
    engine,
    queryRef,
    queryClass: "ARTIST_DISCOVERY",
    targetEntityRef: "person:keegan-hall",
    observedAt,
    capturedAt: observedAt,
    resultState,
    citedSourceRefs: resultState === "MENTIONED_WITH_CITATION" ? [`source:${queryRef}:a`] : [],
    evidenceRefs: [`evidence:${observedAt}:${engine}:${queryRef}`],
    ...overrides
  };
}

function evaluation(
  period: "previous" | "current",
  states: readonly AiSearchAuthorityObservationInputV1["resultState"][],
  overrides: Partial<Parameters<typeof compileAiSearchAuthorityEvaluationV1>[0]> = {}
): AiSearchAuthorityEvaluationV1 {
  const previous = period === "previous";
  const window = previous
    ? { startAt: "2026-09-16T00:00:00Z", endAt: "2026-09-17T00:00:00Z" }
    : { startAt: "2026-09-17T00:00:00Z", endAt: "2026-09-18T00:00:00Z" };
  const observedAt = previous ? "2026-09-16T12:00:00Z" : "2026-09-17T12:00:00Z";
  const expectedQueries = [
    plan("OPENAI_CHATGPT", "artist-1"),
    plan("OPENAI_CHATGPT", "artist-2"),
    plan("PERPLEXITY", "artist-1")
  ];
  const observations = expectedQueries.map((row, index) =>
    observation(row.engine, row.queryRef, states[index] ?? "NOT_MENTIONED", observedAt)
  );

  return compileAiSearchAuthorityEvaluationV1({
    asOf: previous ? "2026-09-17T01:00:00Z" : "2026-09-18T01:00:00Z",
    window,
    maxObservationAgeDays: 7,
    expectedQueries,
    observations,
    ...overrides
  });
}

function input(overrides: Partial<AiSearchAuthorityChangeReviewInputV1> = {}): AiSearchAuthorityChangeReviewInputV1 {
  return {
    previous: evaluation("previous", ["NOT_MENTIONED", "MENTIONED_WITH_CITATION", "MENTIONED_WITH_CITATION"]),
    current: evaluation("current", ["MENTIONED_WITH_CITATION", "MENTIONED", "MENTIONED_WITH_CITATION"], {
      observations: [
        observation("OPENAI_CHATGPT", "artist-1", "MENTIONED_WITH_CITATION", "2026-09-17T12:00:00Z"),
        observation("OPENAI_CHATGPT", "artist-2", "MENTIONED", "2026-09-17T12:00:00Z"),
        observation("PERPLEXITY", "artist-1", "MENTIONED_WITH_CITATION", "2026-09-17T12:00:00Z", {
          citedSourceRefs: ["source:artist-1:b"]
        })
      ]
    }),
    evaluatedAt: "2026-09-18T02:00:00Z",
    policy: {
      maxCurrentEvaluationAgeHours: 6,
      maxGapHours: 1
    },
    ...overrides
  };
}

test("surfaces only directly observed fixed-query AI answer changes for internal review", () => {
  const result = compileAiSearchAuthorityChangeReviewV1(input());

  assert.equal(result.status, "READY");
  assert.equal(result.attentionState, "READY_FOR_INTERNAL_ALERT_REVIEW");
  assert.equal(result.queryCount, 3);
  assert.deepEqual(
    result.changes.map((row) => [row.engine, row.queryRef, row.kind]),
    [
      ["OPENAI_CHATGPT", "artist-1", "CITATION_GAIN"],
      ["OPENAI_CHATGPT", "artist-1", "MENTION_GAIN"],
      ["OPENAI_CHATGPT", "artist-2", "CITATION_LOSS"],
      ["PERPLEXITY", "artist-1", "CITED_SOURCE_SET_CHANGED"]
    ]
  );
  assert.deepEqual(result.observedOverallDelta, {
    mentionCount: 1,
    citationCount: 0,
    mentionRatePct: 33.333,
    citationRatePct: 0
  });
  assert.ok(result.evidenceRefs.length >= 6);
  assert.equal(result.confidence, null);
  assert.equal(result.authorityScore, null);
  assert.equal(result.causality, "NOT_ESTABLISHED");
  assert.equal(result.attribution, "NOT_ESTABLISHED");
  assert.equal(result.notificationAuthority, "NONE");
  assert.equal(result.providerWriteAuthority, "NONE");
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
  assert.equal(result.changes.every((row) => !row.rankingClaim && !row.competitorPerformanceClaim), true);
  assert.equal(result.changes.every((row) => !row.endorsementClaim && !row.relationshipClaim), true);
});

test("reports no observed change without manufacturing an alert or score", () => {
  const previous = evaluation("previous", ["MENTIONED", "NOT_MENTIONED", "MENTIONED_WITH_CITATION"]);
  const current = evaluation("current", ["MENTIONED", "NOT_MENTIONED", "MENTIONED_WITH_CITATION"]);
  const result = compileAiSearchAuthorityChangeReviewV1(input({ previous, current }));

  assert.equal(result.status, "READY");
  assert.equal(result.attentionState, "NO_OBSERVED_CHANGE");
  assert.deepEqual(result.changes, []);
  assert.deepEqual(result.observedOverallDelta, {
    mentionCount: 0,
    citationCount: 0,
    mentionRatePct: 0,
    citationRatePct: 0
  });
  assert.equal(result.notificationAuthority, "NONE");
});

test("fails closed when either canonical evaluation is incomplete", () => {
  const baseCurrent = evaluation("current", ["MENTIONED", "MENTIONED", "MENTIONED"]);
  const incompleteCurrent = {
    ...baseCurrent,
    status: "PARTIAL",
    expectedQueryCount: 3,
    currentObservationCount: 2,
    missingQueryKeys: ["PERPLEXITY:artist-1"],
    observations: baseCurrent.observations.slice(0, 2),
    overall: {
      mentionCount: null,
      citationCount: null,
      mentionRatePct: null,
      citationRatePct: null
    }
  } as AiSearchAuthorityEvaluationV1;

  const result = compileAiSearchAuthorityChangeReviewV1(input({ current: incompleteCurrent }));

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.equal(result.attentionState, "VERIFY_REQUIRED");
  assert.equal(result.queryCount, null);
  assert.deepEqual(result.changes, []);
  assert.ok(result.reasons.includes("CURRENT_EVALUATION_NOT_READY"));
  assert.deepEqual(result.evidenceRefs, []);
  assert.deepEqual(result.observedOverallDelta, {
    mentionCount: null,
    citationCount: null,
    mentionRatePct: null,
    citationRatePct: null
  });
});

test("revalidates freshness at alert-review time rather than trusting an old CURRENT label", () => {
  const result = compileAiSearchAuthorityChangeReviewV1(
    input({
      evaluatedAt: "2026-09-19T12:00:00Z",
      policy: { maxCurrentEvaluationAgeHours: 6, maxGapHours: 1 }
    })
  );

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.ok(result.reasons.includes("CURRENT_EVALUATION_TOO_OLD"));
  assert.deepEqual(result.changes, []);
  assert.equal(result.attentionState, "VERIFY_REQUIRED");
});

test("requires the exact same query and target identity across comparison windows", () => {
  const differentTarget = evaluation("current", ["MENTIONED", "MENTIONED", "MENTIONED"], {
    expectedQueries: [
      plan("OPENAI_CHATGPT", "artist-1", { targetEntityRef: "person:someone-else" }),
      plan("OPENAI_CHATGPT", "artist-2"),
      plan("PERPLEXITY", "artist-1")
    ],
    observations: [
      observation("OPENAI_CHATGPT", "artist-1", "MENTIONED", "2026-09-17T12:00:00Z", {
        targetEntityRef: "person:someone-else"
      }),
      observation("OPENAI_CHATGPT", "artist-2", "MENTIONED", "2026-09-17T12:00:00Z"),
      observation("PERPLEXITY", "artist-1", "MENTIONED", "2026-09-17T12:00:00Z")
    ]
  });
  const identityResult = compileAiSearchAuthorityChangeReviewV1(input({ current: differentTarget }));
  assert.equal(identityResult.status, "VERIFY_REQUIRED");
  assert.ok(identityResult.reasons.includes("QUERY_IDENTITY_MISMATCH"));

  const differentQuerySet = compileAiSearchAuthorityEvaluationV1({
    asOf: "2026-09-18T01:00:00Z",
    window: { startAt: "2026-09-17T00:00:00Z", endAt: "2026-09-18T00:00:00Z" },
    maxObservationAgeDays: 7,
    expectedQueries: [plan("OPENAI_CHATGPT", "different-query")],
    observations: [observation("OPENAI_CHATGPT", "different-query", "MENTIONED", "2026-09-17T12:00:00Z")]
  });
  const setResult = compileAiSearchAuthorityChangeReviewV1(input({ current: differentQuerySet }));
  assert.equal(setResult.status, "VERIFY_REQUIRED");
  assert.ok(setResult.reasons.includes("QUERY_SET_MISMATCH"));
  assert.deepEqual(setResult.changes, []);
});

test("requires comparable chronological windows and caller-owned gap limits", () => {
  const longerCurrent = compileAiSearchAuthorityEvaluationV1({
    asOf: "2026-09-18T13:00:00Z",
    window: { startAt: "2026-09-17T00:00:00Z", endAt: "2026-09-18T12:00:00Z" },
    maxObservationAgeDays: 7,
    expectedQueries: [plan("OPENAI_CHATGPT", "artist-1")],
    observations: [observation("OPENAI_CHATGPT", "artist-1", "MENTIONED", "2026-09-17T12:00:00Z")]
  });
  const shortPrevious = compileAiSearchAuthorityEvaluationV1({
    asOf: "2026-09-17T01:00:00Z",
    window: { startAt: "2026-09-16T00:00:00Z", endAt: "2026-09-17T00:00:00Z" },
    maxObservationAgeDays: 7,
    expectedQueries: [plan("OPENAI_CHATGPT", "artist-1")],
    observations: [observation("OPENAI_CHATGPT", "artist-1", "NOT_MENTIONED", "2026-09-16T12:00:00Z")]
  });
  const durationResult = compileAiSearchAuthorityChangeReviewV1(
    input({
      previous: shortPrevious,
      current: longerCurrent,
      evaluatedAt: "2026-09-18T14:00:00Z",
      policy: { maxCurrentEvaluationAgeHours: 6, maxGapHours: 1 }
    })
  );
  assert.equal(durationResult.status, "VERIFY_REQUIRED");
  assert.ok(durationResult.reasons.includes("WINDOW_DURATION_MISMATCH"));

  const delayedCurrent = compileAiSearchAuthorityEvaluationV1({
    asOf: "2026-09-18T13:00:00Z",
    window: { startAt: "2026-09-17T12:00:00Z", endAt: "2026-09-18T12:00:00Z" },
    maxObservationAgeDays: 7,
    expectedQueries: [plan("OPENAI_CHATGPT", "artist-1")],
    observations: [observation("OPENAI_CHATGPT", "artist-1", "MENTIONED", "2026-09-18T00:00:00Z")]
  });
  const gapResult = compileAiSearchAuthorityChangeReviewV1(
    input({
      previous: shortPrevious,
      current: delayedCurrent,
      evaluatedAt: "2026-09-18T14:00:00Z",
      policy: { maxCurrentEvaluationAgeHours: 6, maxGapHours: 1 }
    })
  );
  assert.equal(gapResult.status, "VERIFY_REQUIRED");
  assert.ok(gapResult.reasons.includes("WINDOW_GAP_TOO_LARGE"));
});

test("rejects raw query or answer text and remains deeply immutable", () => {
  const unsafe = {
    ...input(),
    answerText: "Generated answer body that must not enter the durable comparison contract."
  } as AiSearchAuthorityChangeReviewInputV1;
  assert.throws(() => compileAiSearchAuthorityChangeReviewV1(unsafe), /answerText is prohibited/i);

  const result = compileAiSearchAuthorityChangeReviewV1(input());
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.changes), true);
  assert.equal(Object.isFrozen(result.changes[0]), true);
  assert.equal(Object.isFrozen(result.guardrails), true);
  assert.match(result.guardrails.join(" "), /do not establish search ranking, authority, recommendation, endorsement, competitor performance, relationship, attribution, causality/i);
});
