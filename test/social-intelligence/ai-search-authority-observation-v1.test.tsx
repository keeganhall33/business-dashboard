import assert from "node:assert/strict";
import test from "node:test";

import {
  compileAiSearchAuthorityEvaluationV1,
  type AiSearchAuthorityEvaluationInputV1,
  type AiSearchAuthorityObservationInputV1,
  type AiSearchExpectedQueryInputV1
} from "../../src/lib/social-intelligence/ai-search-authority-observation-v1";

const asOf = "2026-09-18T18:00:00Z";

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
  overrides: Partial<AiSearchAuthorityObservationInputV1> = {}
): AiSearchAuthorityObservationInputV1 {
  return {
    observationId: `obs:${engine}:${queryRef}`,
    engine,
    queryRef,
    queryClass: "ARTIST_DISCOVERY",
    targetEntityRef: "person:keegan-hall",
    observedAt: "2026-09-18T16:00:00Z",
    capturedAt: "2026-09-18T16:05:00Z",
    resultState,
    citedSourceRefs: resultState === "MENTIONED_WITH_CITATION" ? [`citation:${queryRef}`] : [],
    evidenceRefs: [`evidence:${engine}:${queryRef}`],
    ...overrides
  };
}

function input(overrides: Partial<AiSearchAuthorityEvaluationInputV1> = {}): AiSearchAuthorityEvaluationInputV1 {
  return {
    asOf,
    window: {
      startAt: "2026-09-18T00:00:00Z",
      endAt: "2026-09-18T17:00:00Z"
    },
    maxObservationAgeDays: 7,
    expectedQueries: [
      plan("OPENAI_CHATGPT", "artist-discovery-1"),
      plan("OPENAI_CHATGPT", "artist-discovery-2"),
      plan("PERPLEXITY", "artist-discovery-1"),
      plan("PERPLEXITY", "artist-discovery-2")
    ],
    observations: [
      observation("OPENAI_CHATGPT", "artist-discovery-1", "MENTIONED_WITH_CITATION"),
      observation("OPENAI_CHATGPT", "artist-discovery-2", "NOT_MENTIONED"),
      observation("PERPLEXITY", "artist-discovery-1", "MENTIONED"),
      observation("PERPLEXITY", "artist-discovery-2", "MENTIONED_WITH_CITATION")
    ],
    ...overrides
  };
}

test("reports observed mention and citation rates only across a complete fixed query set", () => {
  const result = compileAiSearchAuthorityEvaluationV1(input());

  assert.equal(result.status, "READY");
  assert.equal(result.expectedQueryCount, 4);
  assert.equal(result.currentObservationCount, 4);
  assert.deepEqual(result.missingQueryKeys, []);
  assert.equal(result.overall.mentionCount, 3);
  assert.equal(result.overall.citationCount, 2);
  assert.equal(result.overall.mentionRatePct, 75);
  assert.equal(result.overall.citationRatePct, 50);

  const chatgpt = result.engines.find((row) => row.engine === "OPENAI_CHATGPT");
  assert.ok(chatgpt);
  assert.equal(chatgpt.state, "COMPLETE_OBSERVED_WINDOW");
  assert.equal(chatgpt.mentionRatePct, 50);
  assert.equal(chatgpt.citationRatePct, 50);

  assert.equal(result.authorityScore, null);
  assert.equal(result.rankingClaimAllowed, false);
  assert.equal(result.competitorClaimAllowed, false);
  assert.equal(result.attributionClaimAllowed, false);
  assert.equal(result.causalClaimAllowed, false);
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
  assert.match(result.guardrails.join(" "), /not establish ranking, endorsement, competitor performance, relationship, attribution, causality/i);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.engines), true);
});

test("withholds rates instead of zero-filling when a planned observation is missing", () => {
  const base = input();
  const result = compileAiSearchAuthorityEvaluationV1({
    ...base,
    observations: base.observations.slice(0, 3)
  });

  assert.equal(result.status, "PARTIAL");
  assert.equal(result.currentObservationCount, 3);
  assert.deepEqual(result.missingQueryKeys, ["PERPLEXITY:artist-discovery-2"]);
  assert.equal(result.overall.mentionCount, null);
  assert.equal(result.overall.citationCount, null);
  assert.equal(result.overall.mentionRatePct, null);
  assert.equal(result.overall.citationRatePct, null);

  const perplexity = result.engines.find((row) => row.engine === "PERPLEXITY");
  assert.ok(perplexity);
  assert.equal(perplexity.state, "INCOMPLETE");
  assert.equal(perplexity.mentionRatePct, null);
  assert.equal(perplexity.citationRatePct, null);
  assert.match(perplexity.limitation, /withheld/i);
});

test("applies only the caller-supplied freshness policy and suppresses stale rows from completeness", () => {
  const result = compileAiSearchAuthorityEvaluationV1({
    asOf,
    window: {
      startAt: "2026-08-01T00:00:00Z",
      endAt: "2026-09-18T17:00:00Z"
    },
    maxObservationAgeDays: 7,
    expectedQueries: [plan("OPENAI_CHATGPT", "artist-discovery-1")],
    observations: [
      observation("OPENAI_CHATGPT", "artist-discovery-1", "MENTIONED", {
        observedAt: "2026-09-01T12:00:00Z",
        capturedAt: "2026-09-01T12:05:00Z"
      })
    ]
  });

  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.currentObservationCount, 0);
  assert.deepEqual(result.staleObservationIds, ["obs:OPENAI_CHATGPT:artist-discovery-1"]);
  assert.deepEqual(result.missingQueryKeys, ["OPENAI_CHATGPT:artist-discovery-1"]);
  assert.equal(result.overall.mentionRatePct, null);
  assert.match(result.issues.join(" "), /caller-supplied freshness policy/i);
});

test("requires exact planned identity and rejects duplicate or unplanned observations", () => {
  const base = input();
  assert.throws(
    () =>
      compileAiSearchAuthorityEvaluationV1({
        ...base,
        observations: [
          ...base.observations,
          observation("OPENAI_CHATGPT", "artist-discovery-1", "MENTIONED", { observationId: "duplicate-query" })
        ]
      }),
    /duplicate observation for planned query/i
  );

  assert.throws(
    () =>
      compileAiSearchAuthorityEvaluationV1({
        ...base,
        observations: [observation("GOOGLE_GEMINI", "not-in-plan", "MENTIONED")]
      }),
    /unplanned observation/i
  );

  assert.throws(
    () =>
      compileAiSearchAuthorityEvaluationV1({
        ...base,
        observations: [
          observation("OPENAI_CHATGPT", "artist-discovery-1", "MENTIONED", {
            targetEntityRef: "person:someone-else"
          })
        ]
      }),
    /targetEntityRef does not match plan/i
  );
});

test("requires direct evidence for citation observations and rejects citation inference", () => {
  assert.throws(
    () =>
      compileAiSearchAuthorityEvaluationV1({
        ...input(),
        expectedQueries: [plan("OPENAI_CHATGPT", "artist-discovery-1")],
        observations: [
          observation("OPENAI_CHATGPT", "artist-discovery-1", "MENTIONED_WITH_CITATION", {
            citedSourceRefs: []
          })
        ]
      }),
    /requires citedSourceRefs/i
  );

  assert.throws(
    () =>
      compileAiSearchAuthorityEvaluationV1({
        ...input(),
        expectedQueries: [plan("OPENAI_CHATGPT", "artist-discovery-1")],
        observations: [
          observation("OPENAI_CHATGPT", "artist-discovery-1", "MENTIONED", {
            citedSourceRefs: ["citation:unsupported"]
          })
        ]
      }),
    /cannot attach citedSourceRefs/i
  );
});

test("fails closed on bad chronology, future windows, or observations outside the declared window", () => {
  assert.throws(
    () =>
      compileAiSearchAuthorityEvaluationV1({
        ...input(),
        window: { startAt: "2026-09-19T00:00:00Z", endAt: "2026-09-20T00:00:00Z" }
      }),
    /window.endAt cannot be after asOf/i
  );

  assert.throws(
    () =>
      compileAiSearchAuthorityEvaluationV1({
        ...input(),
        expectedQueries: [plan("OPENAI_CHATGPT", "artist-discovery-1")],
        observations: [
          observation("OPENAI_CHATGPT", "artist-discovery-1", "MENTIONED", {
            observedAt: "2026-09-17T23:59:59Z"
          })
        ]
      }),
    /inside the declared evaluation window/i
  );

  assert.throws(
    () =>
      compileAiSearchAuthorityEvaluationV1({
        ...input(),
        expectedQueries: [plan("OPENAI_CHATGPT", "artist-discovery-1")],
        observations: [
          observation("OPENAI_CHATGPT", "artist-discovery-1", "MENTIONED", {
            capturedAt: "2026-09-18T19:00:00Z"
          })
        ]
      }),
    /capturedAt cannot be after asOf/i
  );
});

test("rejects raw prompt/query/answer text so durable authority evidence stays privacy-bounded", () => {
  const unsafePlan = {
    ...plan("OPENAI_CHATGPT", "artist-discovery-1"),
    queryText: "Who is the best pencil artist?"
  } as AiSearchExpectedQueryInputV1;
  assert.throws(
    () =>
      compileAiSearchAuthorityEvaluationV1({
        ...input(),
        expectedQueries: [unsafePlan],
        observations: []
      }),
    /queryText is prohibited/i
  );

  const unsafeObservation = {
    ...observation("OPENAI_CHATGPT", "artist-discovery-1", "MENTIONED"),
    responseText: "A generated answer containing user-visible text."
  } as AiSearchAuthorityObservationInputV1;
  assert.throws(
    () =>
      compileAiSearchAuthorityEvaluationV1({
        ...input(),
        expectedQueries: [plan("OPENAI_CHATGPT", "artist-discovery-1")],
        observations: [unsafeObservation]
      }),
    /responseText is prohibited/i
  );
});
