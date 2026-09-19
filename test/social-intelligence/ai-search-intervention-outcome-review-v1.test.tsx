import assert from "node:assert/strict";
import test from "node:test";

import {
  compileAiSearchAuthorityEvaluationV1,
  type AiSearchAuthorityEvaluationV1,
  type AiSearchAuthorityObservationInputV1,
  type AiSearchExpectedQueryInputV1
} from "../../src/lib/social-intelligence/ai-search-authority-observation-v1";
import {
  compileAiSearchInterventionOutcomeReviewV1,
  type AiSearchInterventionOutcomeReviewInputV1
} from "../../src/lib/social-intelligence/ai-search-intervention-outcome-review-v1";

function plan(
  engine: AiSearchExpectedQueryInputV1["engine"],
  queryRef: string,
  overrides: Partial<AiSearchExpectedQueryInputV1> = {}
): AiSearchExpectedQueryInputV1 {
  return {
    engine,
    queryRef,
    queryClass: "CATEGORY_DISCOVERY",
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
    queryClass: "CATEGORY_DISCOVERY",
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
  period: "baseline" | "post",
  states: readonly AiSearchAuthorityObservationInputV1["resultState"][],
  overrides: Partial<Parameters<typeof compileAiSearchAuthorityEvaluationV1>[0]> = {}
): AiSearchAuthorityEvaluationV1 {
  const baseline = period === "baseline";
  const window = baseline
    ? { startAt: "2026-09-15T00:00:00Z", endAt: "2026-09-16T00:00:00Z" }
    : { startAt: "2026-09-17T00:00:00Z", endAt: "2026-09-18T00:00:00Z" };
  const observedAt = baseline ? "2026-09-15T12:00:00Z" : "2026-09-17T12:00:00Z";
  const expectedQueries = [
    plan("OPENAI_CHATGPT", "pencil-artist"),
    plan("PERPLEXITY", "sports-artist"),
    plan("GOOGLE_GEMINI", "graphite-artist")
  ];
  const observations = expectedQueries.map((row, index) =>
    observation(row.engine, row.queryRef, states[index] ?? "NOT_MENTIONED", observedAt)
  );

  return compileAiSearchAuthorityEvaluationV1({
    asOf: baseline ? "2026-09-16T01:00:00Z" : "2026-09-18T01:00:00Z",
    window,
    maxObservationAgeDays: 7,
    expectedQueries,
    observations,
    ...overrides
  });
}

function input(overrides: Partial<AiSearchInterventionOutcomeReviewInputV1> = {}): AiSearchInterventionOutcomeReviewInputV1 {
  return {
    intervention: {
      interventionId: "intervention:site:pencil-authority-page:v1",
      interventionKind: "OWNED_SITE_CONTENT",
      targetEntityRef: "person:keegan-hall",
      startedAt: "2026-09-16T02:00:00Z",
      completedAt: "2026-09-16T06:00:00Z",
      evidenceRefs: ["deploy:authority-page:sha-123"]
    },
    measurementPlan: {
      declaredAt: "2026-09-14T20:00:00Z",
      targetQueries: [{ engine: "OPENAI_CHATGPT", queryRef: "pencil-artist" }],
      evidenceRefs: ["measurement-plan:ai-search:pencil-authority:v1"]
    },
    baseline: evaluation("baseline", ["NOT_MENTIONED", "MENTIONED_WITH_CITATION", "MENTIONED"]),
    post: evaluation("post", ["MENTIONED_WITH_CITATION", "MENTIONED", "MENTIONED"]),
    evaluatedAt: "2026-09-18T02:00:00Z",
    policy: {
      maxPostEvaluationAgeHours: 6,
      maxComparisonGapHours: 30,
      minPostLagHours: 12,
      maxPostLagHours: 72
    },
    ...overrides
  };
}

test("measures a predeclared target query after an evidenced intervention without claiming causality", () => {
  const result = compileAiSearchInterventionOutcomeReviewV1(input());

  assert.equal(result.status, "REVIEW_READY");
  assert.equal(result.outcomeState, "OBSERVED_GAIN");
  assert.equal(result.targetQueryCount, 1);
  assert.equal(result.postLagHours, 18);
  assert.deepEqual(result.observedTargetMovement, {
    baselineMentionCount: 0,
    postMentionCount: 1,
    mentionCountDelta: 1,
    baselineCitationCount: 0,
    postCitationCount: 1,
    citationCountDelta: 1,
    baselineMentionRatePct: 0,
    postMentionRatePct: 100,
    mentionRateDeltaPct: 100,
    baselineCitationRatePct: 0,
    postCitationRatePct: 100,
    citationRateDeltaPct: 100
  });
  assert.deepEqual(result.targetChanges.map((row) => row.kind), ["CITATION_GAIN", "MENTION_GAIN"]);
  assert.equal(result.nonTargetObservedChangeCount, 1);
  assert.equal(result.reviewCandidate, "GOVERNED_OUTCOME_REVIEW");
  assert.equal(result.learningScope, "SINGLE_PRE_POST_COMPARISON_NOT_DURABLE_POLICY");
  assert.equal(result.confidence, null);
  assert.equal(result.attribution, "NOT_ESTABLISHED");
  assert.equal(result.causality, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.durableLearningAllowed, false);
  assert.equal(result.notificationAuthority, "NONE");
  assert.equal(result.publicationAuthority, "NONE");
  assert.equal(result.providerWriteAuthority, "NONE");
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
  assert.ok(result.evidenceRefs.includes("deploy:authority-page:sha-123"));
  assert.ok(result.evidenceRefs.includes("measurement-plan:ai-search:pencil-authority:v1"));
});

test("records no observed movement as a real measured outcome rather than inventing a lesson", () => {
  const baseline = evaluation("baseline", ["MENTIONED_WITH_CITATION", "MENTIONED", "NOT_MENTIONED"]);
  const post = evaluation("post", ["MENTIONED_WITH_CITATION", "MENTIONED", "NOT_MENTIONED"]);
  const result = compileAiSearchInterventionOutcomeReviewV1(input({ baseline, post }));

  assert.equal(result.status, "REVIEW_READY");
  assert.equal(result.outcomeState, "NO_OBSERVED_MOVEMENT");
  assert.equal(result.observedTargetMovement.mentionCountDelta, 0);
  assert.equal(result.observedTargetMovement.citationCountDelta, 0);
  assert.deepEqual(result.targetChanges, []);
  assert.equal(result.durableLearningAllowed, false);
  assert.equal(result.attribution, "NOT_ESTABLISHED");
});

test("fails closed when the measurement plan was not declared before intervention start", () => {
  const result = compileAiSearchInterventionOutcomeReviewV1(input({
    measurementPlan: {
      declaredAt: "2026-09-16T03:00:00Z",
      targetQueries: [{ engine: "OPENAI_CHATGPT", queryRef: "pencil-artist" }],
      evidenceRefs: ["measurement-plan:late"]
    }
  }));

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.equal(result.outcomeState, "VERIFY_REQUIRED");
  assert.ok(result.verificationReasons.includes("MEASUREMENT_PLAN_AFTER_INTERVENTION_START"));
  assert.equal(result.targetQueryCount, null);
  assert.deepEqual(result.targetChanges, []);
  assert.deepEqual(result.evidenceRefs, []);
  assert.equal(result.reviewCandidate, "NONE");
});

test("requires clean baseline/intervention/post chronology and caller-owned lag bounds", () => {
  const overlapping = compileAiSearchInterventionOutcomeReviewV1(input({
    intervention: {
      ...input().intervention,
      startedAt: "2026-09-15T20:00:00Z",
      completedAt: "2026-09-17T01:00:00Z"
    }
  }));

  assert.equal(overlapping.status, "VERIFY_REQUIRED");
  assert.ok(overlapping.verificationReasons.includes("BASELINE_OVERLAPS_INTERVENTION"));
  assert.ok(overlapping.verificationReasons.includes("POST_WINDOW_OVERLAPS_INTERVENTION"));

  const lagged = compileAiSearchInterventionOutcomeReviewV1(input({
    policy: {
      maxPostEvaluationAgeHours: 6,
      maxComparisonGapHours: 30,
      minPostLagHours: 24,
      maxPostLagHours: 72
    }
  }));
  assert.equal(lagged.status, "VERIFY_REQUIRED");
  assert.ok(lagged.verificationReasons.includes("POST_LAG_TOO_SHORT"));
});

test("requires target queries to exist in the fixed benchmark and match the exact target entity", () => {
  const missing = compileAiSearchInterventionOutcomeReviewV1(input({
    measurementPlan: {
      declaredAt: "2026-09-14T20:00:00Z",
      targetQueries: [{ engine: "OPENAI_CHATGPT", queryRef: "unplanned-query" }],
      evidenceRefs: ["measurement-plan:missing-target"]
    }
  }));
  assert.equal(missing.status, "VERIFY_REQUIRED");
  assert.ok(missing.verificationReasons.includes("TARGET_QUERY_NOT_IN_BENCHMARK"));

  const wrongEntity = compileAiSearchInterventionOutcomeReviewV1(input({
    intervention: {
      ...input().intervention,
      targetEntityRef: "person:someone-else"
    }
  }));
  assert.equal(wrongEntity.status, "VERIFY_REQUIRED");
  assert.ok(wrongEntity.verificationReasons.includes("TARGET_ENTITY_MISMATCH"));
});

test("inherits fixed-query freshness and comparability failures from the canonical change review", () => {
  const stale = compileAiSearchInterventionOutcomeReviewV1(input({
    evaluatedAt: "2026-09-19T12:00:00Z"
  }));

  assert.equal(stale.status, "VERIFY_REQUIRED");
  assert.ok(stale.verificationReasons.includes("CHANGE_REVIEW_NOT_READY"));
  assert.ok(stale.upstreamChangeReviewReasons.includes("CURRENT_EVALUATION_TOO_OLD"));
  assert.deepEqual(stale.targetChanges, []);
  assert.deepEqual(stale.evidenceRefs, []);
});

test("rejects raw answer text, credential-like evidence refs, and remains deeply immutable", () => {
  const unsafeText = {
    ...input(),
    answerText: "Do not persist generated answer bodies in outcome memory."
  } as AiSearchInterventionOutcomeReviewInputV1;
  assert.throws(() => compileAiSearchInterventionOutcomeReviewV1(unsafeText), /answerText is prohibited/i);

  assert.throws(() => compileAiSearchInterventionOutcomeReviewV1(input({
    intervention: {
      ...input().intervention,
      evidenceRefs: ["https://example.com/proof?access_token=secret"]
    }
  })), /secret-like reference/i);

  const result = compileAiSearchInterventionOutcomeReviewV1(input());
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.intervention), true);
  assert.equal(Object.isFrozen(result.measurementPlan.targetQueries), true);
  assert.equal(Object.isFrozen(result.targetChanges), true);
  assert.equal(Object.isFrozen(result.guardrails), true);
  assert.match(result.guardrails.join(" "), /does not establish.*caused|does not prove/i);
});
