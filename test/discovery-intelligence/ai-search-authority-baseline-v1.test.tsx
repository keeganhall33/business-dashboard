import assert from "node:assert/strict";
import test from "node:test";

import {
  compileAISearchAuthorityBaselineV1,
  type AISearchObservationInputV1
} from "../../src/lib/discovery-intelligence/ai-search-authority-baseline-v1";

const now = "2026-09-18T06:45:00Z";

function observed(
  observationId: string,
  overrides: Partial<AISearchObservationInputV1> = {}
): AISearchObservationInputV1 {
  return {
    observationId,
    queryId: "q-best-pencil-artist",
    queryText: "Who are the best contemporary pencil artists?",
    queryFamily: "CATEGORY_BEST_OF",
    system: "CHATGPT",
    observedAt: "2026-09-18T06:00:00Z",
    accessState: "OBSERVED",
    mentionState: "PRESENT",
    positionClass: "TOP_3_MENTION",
    citationState: "CITED",
    entityAccuracy: "ACCURATE",
    citationUrls: ["https://example.org/keegan-hall-profile"],
    competitorContextState: "OBSERVED",
    competitorEntities: [
      { name: "Observed Peer Artist", evidenceRefs: [`evidence:${observationId}:peer`] }
    ],
    evidenceRefs: [`evidence:${observationId}:answer`],
    ...overrides
  };
}

test("normalizes multi-system observations into transparent segment counts without a synthetic consensus score", () => {
  const result = compileAISearchAuthorityBaselineV1([
    observed("chatgpt-1"),
    observed("gemini-1", {
      system: "GEMINI",
      mentionState: "ABSENT",
      positionClass: undefined,
      citationState: undefined,
      entityAccuracy: undefined,
      citationUrls: [],
      competitorContextState: "NONE_OBSERVED",
      competitorEntities: []
    }),
    observed("perplexity-1", {
      system: "PERPLEXITY",
      mentionState: "PRESENT",
      positionClass: "OTHER_MENTION",
      citationState: "NOT_CITED",
      citationUrls: [],
      entityAccuracy: "PARTIAL",
      competitorContextState: "UNKNOWN",
      competitorEntities: []
    })
  ], now);

  assert.equal(result.contractVersion, "AISearchAuthorityBaselineV1");
  assert.equal(result.observations.length, 3);
  assert.equal(result.summaries.length, 3);
  assert.equal(result.summaries.find((row) => row.system === "CHATGPT")?.mentionPresentCount, 1);
  assert.equal(result.summaries.find((row) => row.system === "GEMINI")?.mentionAbsentCount, 1);
  assert.equal(result.summaries.find((row) => row.system === "PERPLEXITY")?.uncitedMentionCount, 1);
  assert.equal("score" in result, false);
  assert.equal("rank" in result, false);
});

test("keeps unavailable and not-run systems UNKNOWN instead of treating missing access as absence", () => {
  const result = compileAISearchAuthorityBaselineV1([
    observed("copilot-unavailable", {
      system: "COPILOT",
      accessState: "UNAVAILABLE",
      mentionState: undefined,
      positionClass: undefined,
      citationState: undefined,
      entityAccuracy: undefined,
      citationUrls: [],
      competitorContextState: undefined,
      competitorEntities: [],
      evidenceRefs: [],
      limitations: ["No authorized observation path was available"]
    }),
    observed("gemini-not-run", {
      system: "GEMINI",
      accessState: "NOT_RUN",
      mentionState: undefined,
      positionClass: undefined,
      citationState: undefined,
      entityAccuracy: undefined,
      citationUrls: [],
      competitorContextState: undefined,
      competitorEntities: [],
      evidenceRefs: []
    })
  ], now);

  const unavailable = result.observations.find((row) => row.observationId === "copilot-unavailable")!;
  const notRun = result.observations.find((row) => row.observationId === "gemini-not-run")!;
  assert.equal(unavailable.mentionState, "UNKNOWN");
  assert.equal(notRun.mentionState, "UNKNOWN");
  assert.equal(result.summaries.find((row) => row.system === "COPILOT")?.mentionAbsentCount, 0);
  assert.equal(result.summaries.find((row) => row.system === "COPILOT")?.accessUnavailableCount, 1);
  assert.equal(result.summaries.find((row) => row.system === "GEMINI")?.notRunCount, 1);
  assert.deepEqual(result.verificationQueue.find((row) => row.observationId === "copilot-unavailable")?.reasons, ["ACCESS_UNAVAILABLE"]);
});

test("distinguishes explicit observed absence from unknown answer state", () => {
  const result = compileAISearchAuthorityBaselineV1([
    observed("explicit-absence", {
      mentionState: "ABSENT",
      positionClass: undefined,
      citationState: undefined,
      entityAccuracy: undefined,
      citationUrls: [],
      competitorContextState: "NONE_OBSERVED",
      competitorEntities: []
    }),
    observed("answer-unknown", {
      queryId: "q-sports-artist",
      queryText: "Who is a leading sports pencil artist?",
      mentionState: "UNKNOWN",
      positionClass: undefined,
      citationState: undefined,
      entityAccuracy: undefined,
      citationUrls: [],
      competitorContextState: "UNKNOWN",
      competitorEntities: []
    })
  ], now);

  const absent = result.observations.find((row) => row.observationId === "explicit-absence")!;
  const unknown = result.observations.find((row) => row.observationId === "answer-unknown")!;
  assert.equal(absent.mentionState, "ABSENT");
  assert.equal(absent.positionClass, "NOT_APPLICABLE");
  assert.equal(absent.citationState, "NOT_APPLICABLE");
  assert.equal(absent.entityAccuracy, "NOT_APPLICABLE");
  assert.equal(unknown.mentionState, "UNKNOWN");
  assert.deepEqual(
    result.verificationQueue.find((row) => row.observationId === "answer-unknown")?.reasons,
    ["OBSERVED_RESULT_UNKNOWN", "COMPETITOR_CONTEXT_UNKNOWN"]
  );
});

test("marks old observations stale and queues verification rather than presenting them as current", () => {
  const result = compileAISearchAuthorityBaselineV1([
    observed("stale-chatgpt", { observedAt: "2026-07-01T12:00:00Z" })
  ], now, 30);

  assert.equal(result.observations[0].freshness, "STALE");
  assert.equal(result.summaries[0].freshObservedCount, 0);
  assert.equal(result.summaries[0].staleObservedCount, 1);
  assert.deepEqual(result.verificationQueue[0].reasons, ["STALE_OBSERVATION"]);
});

test("preserves cited, uncited, and unknown citation states without inventing citation evidence", () => {
  const result = compileAISearchAuthorityBaselineV1([
    observed("cited"),
    observed("uncited", {
      queryId: "q-uncited",
      citationState: "NOT_CITED",
      citationUrls: []
    }),
    observed("citation-unknown", {
      queryId: "q-citation-unknown",
      citationState: "UNKNOWN",
      citationUrls: []
    })
  ], now);

  const summary = result.summaries[0];
  assert.equal(summary.citedMentionCount, 1);
  assert.equal(summary.uncitedMentionCount, 1);
  assert.equal(summary.citationUnknownCount, 1);
  assert.deepEqual(
    result.verificationQueue.find((row) => row.observationId === "citation-unknown")?.reasons,
    ["CITATION_STATE_UNKNOWN"]
  );
  assert.throws(
    () => compileAISearchAuthorityBaselineV1([
      observed("bad-citation", { citationState: "CITED", citationUrls: [] })
    ], now),
    /CITED state requires at least one citation URL/i
  );
});

test("surfaces entity conflicts and preserves observed competitor context without inferring competitor performance", () => {
  const result = compileAISearchAuthorityBaselineV1([
    observed("entity-conflict", {
      entityAccuracy: "CONFLICTED",
      competitorEntities: [
        { name: "Observed Peer Artist", evidenceRefs: ["answer:peer:1"] },
        { name: "Another Publicly Mentioned Artist", evidenceRefs: ["answer:peer:2"] }
      ]
    })
  ], now);

  assert.deepEqual(result.verificationQueue[0].reasons, ["ENTITY_ACCURACY_CONFLICTED"]);
  assert.deepEqual(
    result.summaries[0].competitorEntitiesObserved.map((row) => row.name),
    ["Another Publicly Mentioned Artist", "Observed Peer Artist"]
  );
  assert.equal("performance" in result.summaries[0].competitorEntitiesObserved[0], false);
  assert.equal("endorsement" in result.summaries[0].competitorEntitiesObserved[0], false);
  assert.equal("relationship" in result.summaries[0].competitorEntitiesObserved[0], false);
});

test("suppresses exact repeated observations but fails closed on conflicting versions of the same run", () => {
  const duplicateA = observed("duplicate-a");
  const duplicateB = observed("duplicate-b");
  const conflictingRun = observed("conflict-b", {
    mentionState: "ABSENT",
    positionClass: undefined,
    citationState: undefined,
    entityAccuracy: undefined,
    citationUrls: [],
    competitorContextState: "NONE_OBSERVED",
    competitorEntities: [],
    evidenceRefs: ["evidence:conflict-b:answer"]
  });

  const result = compileAISearchAuthorityBaselineV1([
    duplicateA,
    duplicateB,
    conflictingRun
  ], now);

  assert.deepEqual(result.duplicateObservationIdsSuppressed, ["duplicate-b"]);
  assert.equal(result.observations.length, 0);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].kind, "RUN_CONFLICT");
  assert.deepEqual(result.conflicts[0].observationIds, ["conflict-b", "duplicate-a"]);
});

test("fails closed when one observation ID is reused for materially different evidence", () => {
  const result = compileAISearchAuthorityBaselineV1([
    observed("same-id"),
    observed("same-id", {
      queryId: "q-different",
      queryText: "Who are notable graphite sports artists?",
      queryFamily: "DISCOVERY_WHO"
    })
  ], now);

  assert.equal(result.observations.length, 0);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].kind, "OBSERVATION_ID_CONFLICT");
  assert.equal(result.conflicts[0].conflictKey, "same-id");
});

test("is deterministic regardless of caller ordering", () => {
  const inputs = [
    observed("z", { system: "PERPLEXITY", queryFamily: "DISCOVERY_WHO", queryId: "q-z", queryText: "Who draws athletes in graphite?" }),
    observed("a", { system: "CHATGPT", queryId: "q-a", queryText: "Who are top pencil artists?" }),
    observed("m", { system: "GEMINI", queryFamily: "TECHNIQUE_HOW", queryId: "q-m", queryText: "How is hyperrealistic graphite art made?" })
  ];
  const forward = compileAISearchAuthorityBaselineV1(inputs, now);
  const reverse = compileAISearchAuthorityBaselineV1([...inputs].reverse(), now);
  assert.deepEqual(forward, reverse);
});

test("enforces bounded inputs and rejects answer claims when access was unavailable", () => {
  const tooMany = Array.from({ length: 501 }, (_, index) => observed(`row-${index}`, {
    queryId: `q-${index}`,
    observedAt: `2026-09-18T05:${String(index % 60).padStart(2, "0")}:00Z`
  }));
  assert.throws(() => compileAISearchAuthorityBaselineV1(tooMany, now), /exceeds 500 observations/i);

  assert.throws(
    () => compileAISearchAuthorityBaselineV1([
      observed("unavailable-claim", {
        accessState: "UNAVAILABLE",
        mentionState: "ABSENT",
        citationUrls: [],
        competitorEntities: []
      })
    ], now),
    /cannot claim answer state when access was UNAVAILABLE/i
  );

  assert.throws(
    () => compileAISearchAuthorityBaselineV1([
      observed("long-query", { queryText: "x".repeat(501) })
    ], now),
    /queryText exceeds 500 characters/i
  );
});

test("rejects secret-bearing runtime payloads and credentialized citation URLs", () => {
  const unsafe = {
    ...observed("unsafe"),
    accessToken: "do-not-store"
  } as AISearchObservationInputV1;
  assert.throws(() => compileAISearchAuthorityBaselineV1([unsafe], now), /credential material.*never carry secrets/i);

  assert.throws(
    () => compileAISearchAuthorityBaselineV1([
      observed("unsafe-url", { citationUrls: ["https://example.org/source?access_token=secret"] })
    ], now),
    /must not contain credential query parameters/i
  );
});

test("does not mutate caller input, deep-freezes output, and grants zero external or publishing authority", () => {
  const inputs = [observed("immutable")];
  const before = JSON.stringify(inputs);
  const result = compileAISearchAuthorityBaselineV1(inputs, now);

  assert.equal(JSON.stringify(inputs), before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.observations), true);
  assert.equal(Object.isFrozen(result.observations[0]), true);
  assert.equal(Object.isFrozen(result.summaries[0]), true);
  assert.equal(Object.isFrozen(result.summaries[0].competitorEntitiesObserved), true);
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
  assert.equal(result.publicPublishingPerformed, false);
});
