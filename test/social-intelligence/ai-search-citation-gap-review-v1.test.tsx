import assert from "node:assert/strict";
import test from "node:test";

import {
  compileAiSearchAuthorityEvaluationV1,
  type AiSearchAuthorityEvaluationV1,
  type AiSearchAuthorityObservationInputV1,
  type AiSearchExpectedQueryInputV1,
  type AiSearchQueryClassV1
} from "../../src/lib/social-intelligence/ai-search-authority-observation-v1";
import {
  compileAiSearchCitationGapReviewV1,
  type AiSearchCitationGapReviewInputV1
} from "../../src/lib/social-intelligence/ai-search-citation-gap-review-v1";

const AS_OF = "2026-09-19T06:00:00Z";
const EVALUATED_AT = "2026-09-19T06:30:00Z";
const WINDOW = {
  startAt: "2026-09-18T00:00:00Z",
  endAt: "2026-09-19T05:30:00Z"
} as const;

type QuerySpec = Readonly<{
  engine: AiSearchExpectedQueryInputV1["engine"];
  queryRef: string;
  queryClass?: AiSearchQueryClassV1;
  resultState: AiSearchAuthorityObservationInputV1["resultState"];
  citedSourceRefs?: readonly string[];
  evidenceRefs?: readonly string[];
}>;

function evaluation(
  entityRef: string,
  queries: readonly QuerySpec[],
  overrides: Partial<{
    asOf: string;
    window: { startAt: string; endAt: string };
  }> = {}
): AiSearchAuthorityEvaluationV1 {
  const expectedQueries: AiSearchExpectedQueryInputV1[] = queries.map((query) => ({
    engine: query.engine,
    queryRef: query.queryRef,
    queryClass: query.queryClass ?? "ARTIST_DISCOVERY",
    targetEntityRef: entityRef,
    planEvidenceRefs: [`plan:${entityRef}:${query.engine}:${query.queryRef}`]
  }));
  const observations: AiSearchAuthorityObservationInputV1[] = queries.map((query) => ({
    observationId: `obs:${entityRef}:${query.engine}:${query.queryRef}`,
    engine: query.engine,
    queryRef: query.queryRef,
    queryClass: query.queryClass ?? "ARTIST_DISCOVERY",
    targetEntityRef: entityRef,
    observedAt: "2026-09-19T05:00:00Z",
    capturedAt: "2026-09-19T05:05:00Z",
    resultState: query.resultState,
    citedSourceRefs: query.citedSourceRefs ?? [],
    evidenceRefs: query.evidenceRefs ?? [`evidence:${entityRef}:${query.engine}:${query.queryRef}`]
  }));

  return compileAiSearchAuthorityEvaluationV1({
    asOf: overrides.asOf ?? AS_OF,
    window: overrides.window ?? WINDOW,
    maxObservationAgeDays: 7,
    expectedQueries,
    observations
  });
}

function twoQueryEvaluation(
  entityRef: string,
  q1: QuerySpec,
  q2: QuerySpec
): AiSearchAuthorityEvaluationV1 {
  return evaluation(entityRef, [q1, q2]);
}

function reviewInput(
  target: AiSearchAuthorityEvaluationV1,
  peers: readonly AiSearchAuthorityEvaluationV1[],
  overrides: Partial<AiSearchCitationGapReviewInputV1> = {}
): AiSearchCitationGapReviewInputV1 {
  return {
    target,
    peers: peers.map((peer) => ({ evaluation: peer })),
    policy: {
      maxEvaluationAgeHours: 24,
      minDistinctPeerEntitiesForGap: Math.min(2, peers.length)
    },
    evaluatedAt: EVALUATED_AT,
    ...overrides
  };
}

const q1Base = {
  engine: "OPENAI_CHATGPT" as const,
  queryRef: "artist-discovery-1"
};
const q2Base = {
  engine: "PERPLEXITY" as const,
  queryRef: "artist-discovery-2"
};

test("surfaces only repeated peer citation gaps across the exact fixed query universe", () => {
  const target = twoQueryEvaluation(
    "person:keegan-hall",
    { ...q1Base, resultState: "MENTIONED_WITH_CITATION", citedSourceRefs: ["source:keegan-owned"] },
    { ...q2Base, resultState: "MENTIONED" }
  );
  const peerA = twoQueryEvaluation(
    "person:peer-a",
    { ...q1Base, resultState: "MENTIONED_WITH_CITATION", citedSourceRefs: ["source:category-authority", "source:peer-a-only"] },
    { ...q2Base, resultState: "MENTIONED_WITH_CITATION", citedSourceRefs: ["source:category-authority"] }
  );
  const peerB = twoQueryEvaluation(
    "person:peer-b",
    { ...q1Base, resultState: "MENTIONED_WITH_CITATION", citedSourceRefs: ["source:category-authority"] },
    { ...q2Base, resultState: "MENTIONED" }
  );

  const result = compileAiSearchCitationGapReviewV1(reviewInput(target, [peerA, peerB]));

  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.equal(result.targetEntityRef, "person:keegan-hall");
  assert.equal(result.comparedQueryCount, 2);
  assert.deepEqual(result.peerEntityRefs, ["person:peer-a", "person:peer-b"]);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.sourceRef, "source:category-authority");
  assert.deepEqual(result.items[0]?.peerEntityRefs, ["person:peer-a", "person:peer-b"]);
  assert.deepEqual(result.items[0]?.queryKeys, [
    "OPENAI_CHATGPT:artist-discovery-1",
    "PERPLEXITY:artist-discovery-2"
  ]);
  assert.equal(result.items[0]?.peerCitationObservationCount, 3);
  assert.deepEqual(result.items[0]?.targetMentionedQueryKeys, [
    "OPENAI_CHATGPT:artist-discovery-1",
    "PERPLEXITY:artist-discovery-2"
  ]);
  assert.equal(result.items[0]?.targetCitationObservedElsewhere, false);
  assert.equal(result.items[0]?.researchCandidate, true);
  assert.equal(result.items[0]?.rankingClaim, false);
  assert.equal(result.items[0]?.competitorPerformanceClaim, false);
  assert.equal(result.items[0]?.endorsementClaim, false);
  assert.equal(result.items[0]?.relationshipClaim, false);
  assert.equal(result.items[0]?.attributionClaim, false);
  assert.equal(result.items[0]?.causalClaim, false);
  assert.equal(result.items[0]?.confidenceClaim, false);
  assert.equal(result.items[0]?.monetaryValueClaim, false);
  assert.equal(result.publicationAuthority, "NONE");
  assert.equal(result.outreachAuthority, "NONE");
  assert.equal(result.seoMutationAuthority, "NONE");
  assert.equal(result.notificationAuthority, "NONE");
  assert.equal(result.providerWriteAuthority, "NONE");
  assert.match(result.guardrails.join(" "), /does not establish why any AI system produced its answer/i);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.items), true);
});

test("does not call a source a gap when the target is cited by that source on the same query", () => {
  const target = evaluation("person:keegan-hall", [
    { ...q1Base, resultState: "MENTIONED_WITH_CITATION", citedSourceRefs: ["source:shared"] }
  ]);
  const peer = evaluation("person:peer-a", [
    { ...q1Base, resultState: "MENTIONED_WITH_CITATION", citedSourceRefs: ["source:shared"] }
  ]);

  const result = compileAiSearchCitationGapReviewV1(reviewInput(target, [peer], {
    policy: { maxEvaluationAgeHours: 24, minDistinctPeerEntitiesForGap: 1 }
  }));

  assert.equal(result.status, "NO_OBSERVED_GAP");
  assert.deepEqual(result.items, []);
});

test("preserves query-local absence when the same target source is cited elsewhere", () => {
  const target = twoQueryEvaluation(
    "person:keegan-hall",
    { ...q1Base, resultState: "MENTIONED" },
    { ...q2Base, resultState: "MENTIONED_WITH_CITATION", citedSourceRefs: ["source:category-authority"] }
  );
  const peer = twoQueryEvaluation(
    "person:peer-a",
    { ...q1Base, resultState: "MENTIONED_WITH_CITATION", citedSourceRefs: ["source:category-authority"] },
    { ...q2Base, resultState: "MENTIONED" }
  );

  const result = compileAiSearchCitationGapReviewV1(reviewInput(target, [peer], {
    policy: { maxEvaluationAgeHours: 24, minDistinctPeerEntitiesForGap: 1 }
  }));

  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0]?.queryKeys, ["OPENAI_CHATGPT:artist-discovery-1"]);
  assert.equal(result.items[0]?.targetCitationObservedElsewhere, true);
  assert.match(result.guardrails.join(" "), /does not establish that the source lacks target coverage elsewhere/i);
});

test("fails closed when benchmark windows or fixed query universes are not comparable", () => {
  const target = evaluation("person:keegan-hall", [
    { ...q1Base, resultState: "MENTIONED" }
  ]);
  const wrongWindow = evaluation(
    "person:peer-a",
    [{ ...q1Base, resultState: "MENTIONED_WITH_CITATION", citedSourceRefs: ["source:gap"] }],
    { window: { startAt: "2026-09-17T00:00:00Z", endAt: "2026-09-19T05:30:00Z" } }
  );
  const wrongUniverse = evaluation("person:peer-b", [
    {
      engine: "OPENAI_CHATGPT",
      queryRef: "different-query",
      resultState: "MENTIONED_WITH_CITATION",
      citedSourceRefs: ["source:gap"]
    }
  ]);

  const result = compileAiSearchCitationGapReviewV1(reviewInput(target, [wrongWindow, wrongUniverse], {
    policy: { maxEvaluationAgeHours: 24, minDistinctPeerEntitiesForGap: 1 }
  }));

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.deepEqual(result.items, []);
  assert.equal(result.comparedQueryCount, 0);
  assert.ok(result.verificationIssues.some((issue) => issue.code === "WINDOW_MISMATCH"));
  assert.ok(result.verificationIssues.some((issue) => issue.code === "QUERY_UNIVERSE_MISMATCH"));
});

test("fails closed when query classes drift even if engine/queryRef keys match", () => {
  const target = evaluation("person:keegan-hall", [
    { ...q1Base, queryClass: "ARTIST_DISCOVERY", resultState: "MENTIONED" }
  ]);
  const peer = evaluation("person:peer-a", [
    {
      ...q1Base,
      queryClass: "CATEGORY_DISCOVERY",
      resultState: "MENTIONED_WITH_CITATION",
      citedSourceRefs: ["source:gap"]
    }
  ]);

  const result = compileAiSearchCitationGapReviewV1(reviewInput(target, [peer], {
    policy: { maxEvaluationAgeHours: 24, minDistinctPeerEntitiesForGap: 1 }
  }));

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.ok(result.verificationIssues.some((issue) => issue.code === "QUERY_CLASS_MISMATCH"));
});

test("withholds gaps when target or peer evidence exceeds the caller freshness policy", () => {
  const target = evaluation("person:keegan-hall", [
    { ...q1Base, resultState: "MENTIONED" }
  ]);
  const peer = evaluation("person:peer-a", [
    { ...q1Base, resultState: "MENTIONED_WITH_CITATION", citedSourceRefs: ["source:gap"] }
  ]);

  const result = compileAiSearchCitationGapReviewV1(reviewInput(target, [peer], {
    policy: { maxEvaluationAgeHours: 1, minDistinctPeerEntitiesForGap: 1 },
    evaluatedAt: "2026-09-19T08:30:00Z"
  }));

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.ok(result.verificationIssues.some((issue) => issue.code === "TARGET_EVIDENCE_STALE"));
  assert.ok(result.verificationIssues.some((issue) => issue.code === "PEER_EVIDENCE_STALE"));
  assert.deepEqual(result.items, []);
});

test("rejects duplicate peers, self-comparisons, unsafe evidence refs, and impossible thresholds", () => {
  const target = evaluation("person:keegan-hall", [
    { ...q1Base, resultState: "MENTIONED" }
  ]);
  const peer = evaluation("person:peer-a", [
    { ...q1Base, resultState: "MENTIONED_WITH_CITATION", citedSourceRefs: ["source:gap"] }
  ]);

  assert.throws(
    () => compileAiSearchCitationGapReviewV1(reviewInput(target, [peer, peer], {
      policy: { maxEvaluationAgeHours: 24, minDistinctPeerEntitiesForGap: 1 }
    })),
    /duplicate peer targetEntityRef/i
  );

  assert.throws(
    () => compileAiSearchCitationGapReviewV1(reviewInput(target, [target], {
      policy: { maxEvaluationAgeHours: 24, minDistinctPeerEntitiesForGap: 1 }
    })),
    /same entity as target/i
  );

  const unsafePeer = evaluation("person:peer-unsafe", [
    {
      ...q1Base,
      resultState: "MENTIONED_WITH_CITATION",
      citedSourceRefs: ["source:gap"],
      evidenceRefs: ["api_key=secret-value"]
    }
  ]);
  assert.throws(
    () => compileAiSearchCitationGapReviewV1(reviewInput(target, [unsafePeer], {
      policy: { maxEvaluationAgeHours: 24, minDistinctPeerEntitiesForGap: 1 }
    })),
    /credential-like material/i
  );

  assert.throws(
    () => compileAiSearchCitationGapReviewV1(reviewInput(target, [peer], {
      policy: { maxEvaluationAgeHours: 24, minDistinctPeerEntitiesForGap: 2 }
    })),
    /cannot exceed peer count/i
  );
});
