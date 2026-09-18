import assert from "node:assert/strict";
import test from "node:test";

import {
  compileAISearchAuthorityBaselineV1,
  type AISearchObservationInputV1
} from "../../src/lib/discovery-intelligence/ai-search-authority-baseline-v1";
import { compileAISearchAuthorityScorecardV1 } from "../../src/lib/discovery-intelligence/ai-search-authority-scorecard-v1";

const baselineAt = "2026-09-18T13:00:00Z";

function observed(
  observationId: string,
  overrides: Partial<AISearchObservationInputV1> = {}
): AISearchObservationInputV1 {
  return {
    observationId,
    queryId: `q-${observationId}`,
    queryText: "Who are leading contemporary pencil artists?",
    queryFamily: "CATEGORY_BEST_OF",
    system: "CHATGPT",
    observedAt: "2026-09-18T12:00:00Z",
    accessState: "OBSERVED",
    mentionState: "PRESENT",
    positionClass: "FIRST_MENTION",
    citationState: "CITED",
    entityAccuracy: "ACCURATE",
    citationUrls: ["https://example.org/keegan-profile"],
    competitorContextState: "OBSERVED",
    competitorEntities: [
      { name: "Observed Peer", evidenceRefs: [`evidence:${observationId}:peer`] }
    ],
    evidenceRefs: [`evidence:${observationId}:answer`],
    ...overrides
  };
}

function score(
  inputs: readonly AISearchObservationInputV1[],
  evaluatedAt = baselineAt,
  staleAfterDays = 30
) {
  return compileAISearchAuthorityScorecardV1(
    compileAISearchAuthorityBaselineV1(inputs, baselineAt, staleAfterDays),
    evaluatedAt
  );
}

test("computes transparent coverage-aware visibility rates without manufacturing a score or rank", () => {
  const result = score([
    observed("chatgpt-present"),
    observed("gemini-absent", {
      system: "GEMINI",
      mentionState: "ABSENT",
      positionClass: undefined,
      citationState: undefined,
      entityAccuracy: undefined,
      citationUrls: [],
      competitorContextState: "NONE_OBSERVED",
      competitorEntities: []
    }),
    observed("perplexity-present", {
      system: "PERPLEXITY",
      positionClass: "TOP_3_MENTION",
      citationState: "NOT_CITED",
      citationUrls: [],
      entityAccuracy: "PARTIAL"
    })
  ]);

  assert.equal(result.status, "READY");
  assert.equal(result.coverage.freshObservedCount, 3);
  assert.equal(result.overall.knownMentionDenominator, 3);
  assert.equal(result.overall.mentionPresentCount, 2);
  assert.equal(result.overall.mentionAbsentCount, 1);
  assert.equal(result.overall.mentionRate, 0.6667);
  assert.equal(result.overall.knownPositionDenominator, 2);
  assert.equal(result.overall.firstMentionCount, 1);
  assert.equal(result.overall.firstOrTop3MentionCount, 2);
  assert.equal(result.overall.firstMentionRate, 0.5);
  assert.equal(result.overall.firstOrTop3MentionRate, 1);
  assert.equal(result.overall.knownCitationDenominator, 2);
  assert.equal(result.overall.citationRate, 0.5);
  assert.equal(result.overall.accurateEntityRate, 0.5);
  assert.equal(result.syntheticScoreProduced, false);
  assert.equal(result.deterministicRankProduced, false);
  assert.equal("score" in result, false);
  assert.equal("rank" in result, false);
});

test("never converts unavailable, not-run, stale, or unknown observations into absence", () => {
  const result = score([
    observed("known-present"),
    observed("unavailable", {
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
      limitations: ["No authorized observation path"]
    }),
    observed("not-run", {
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
    }),
    observed("unknown-result", {
      system: "PERPLEXITY",
      mentionState: "UNKNOWN",
      positionClass: undefined,
      citationState: undefined,
      entityAccuracy: undefined,
      citationUrls: [],
      competitorContextState: "UNKNOWN",
      competitorEntities: []
    })
  ]);

  assert.equal(result.status, "PARTIAL");
  assert.equal(result.overall.knownMentionDenominator, 1);
  assert.equal(result.overall.mentionPresentCount, 1);
  assert.equal(result.overall.mentionAbsentCount, 0);
  assert.equal(result.overall.mentionUnknownCount, 1);
  assert.equal(result.coverage.unavailableCount, 1);
  assert.equal(result.coverage.notRunCount, 1);
  assert.deepEqual(
    result.measurementGaps.map((gap) => gap.kind).sort(),
    ["ACCESS_UNAVAILABLE", "NOT_RUN", "OBSERVED_RESULT_UNKNOWN"]
  );
  assert.equal(result.observedAuthorityGaps.some((gap) => gap.observationId === "unavailable"), false);
  assert.equal(result.observedAuthorityGaps.some((gap) => gap.observationId === "not-run"), false);
});

test("re-evaluates observation freshness at scorecard time instead of trusting the baseline's old FRESH label", () => {
  const baseline = compileAISearchAuthorityBaselineV1([
    observed("will-age-out")
  ], baselineAt, 30);
  assert.equal(baseline.observations[0].freshness, "FRESH");

  const result = compileAISearchAuthorityScorecardV1(baseline, "2026-10-20T13:00:00Z");
  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.coverage.freshObservedCount, 0);
  assert.equal(result.coverage.staleObservedCount, 1);
  assert.equal(result.overall.knownMentionDenominator, 0);
  assert.equal(result.overall.mentionRate, null);
  assert.deepEqual(result.measurementGaps.map((gap) => gap.kind), ["STALE_OBSERVATION"]);
  assert.equal(result.observedAuthorityGaps.length, 0);
});

test("separates observed authority gaps from unresolved measurement gaps", () => {
  const result = score([
    observed("absent", {
      mentionState: "ABSENT",
      positionClass: undefined,
      citationState: undefined,
      entityAccuracy: undefined,
      citationUrls: [],
      competitorContextState: "OBSERVED",
      competitorEntities: [
        { name: "Publicly Observed Artist", evidenceRefs: ["evidence:absent:peer"] }
      ]
    }),
    observed("uncited", {
      citationState: "NOT_CITED",
      citationUrls: []
    }),
    observed("entity-partial", {
      entityAccuracy: "PARTIAL"
    }),
    observed("citation-unknown", {
      citationState: "UNKNOWN",
      citationUrls: []
    })
  ]);

  assert.deepEqual(
    result.observedAuthorityGaps.map((gap) => [gap.observationId, gap.kind]),
    [
      ["absent", "OBSERVED_ABSENCE"],
      ["entity-partial", "ENTITY_ACCURACY_GAP"],
      ["uncited", "CITATION_GAP"]
    ]
  );
  assert.equal(
    result.observedAuthorityGaps.find((gap) => gap.observationId === "absent")?.observedCompetitorNames[0],
    "Publicly Observed Artist"
  );
  assert.deepEqual(
    result.measurementGaps.map((gap) => [gap.observationId, gap.kind]),
    [["citation-unknown", "CITATION_STATE_UNKNOWN"]]
  );
});

test("aggregates only observed citation domains without calling them independent or authoritative sources", () => {
  const result = score([
    observed("one", {
      queryId: "q-one",
      citationUrls: [
        "https://www.example.org/keegan-a",
        "https://press.test/story-a"
      ]
    }),
    observed("two", {
      queryId: "q-two",
      system: "GEMINI",
      citationUrls: ["https://example.org/keegan-b"]
    })
  ]);

  assert.deepEqual(result.citationDomains.map((row) => row.domain), ["example.org", "press.test"]);
  const example = result.citationDomains[0];
  assert.equal(example.citedObservationCount, 2);
  assert.equal(example.distinctQueryCount, 2);
  assert.deepEqual(example.systems, ["CHATGPT", "GEMINI"]);
  assert.equal(example.sourceAuthorityClaim, false);
  assert.equal(example.sourceIndependenceClaim, false);
  assert.equal(example.causalClaim, false);
});

test("preserves competitor context as observation only, never performance, endorsement, relationship, or authority", () => {
  const result = score([
    observed("peer-a", {
      competitorEntities: [
        { name: "Observed Peer", evidenceRefs: ["peer:evidence:1"] },
        { name: "Another Peer", evidenceRefs: ["peer:evidence:2"] }
      ]
    }),
    observed("peer-b", {
      queryId: "q-peer-b",
      system: "PERPLEXITY",
      competitorEntities: [
        { name: "Observed Peer", evidenceRefs: ["peer:evidence:3"] }
      ]
    })
  ]);

  const peer = result.observedCompetitorContext.find((row) => row.name === "Observed Peer")!;
  assert.equal(peer.observationCount, 2);
  assert.equal(peer.distinctQueryCount, 2);
  assert.equal(peer.performanceClaim, false);
  assert.equal(peer.endorsementClaim, false);
  assert.equal(peer.relationshipClaim, false);
  assert.equal(peer.authorityClaim, false);
  assert.equal(result.competitorPerformanceInferred, false);
  assert.equal(result.endorsementInferred, false);
  assert.equal(result.relationshipInferred, false);
});

test("marks a segment partial when one current run is usable and another run in the same segment is unavailable", () => {
  const result = score([
    observed("segment-present"),
    observed("segment-unavailable", {
      accessState: "UNAVAILABLE",
      mentionState: undefined,
      positionClass: undefined,
      citationState: undefined,
      entityAccuracy: undefined,
      citationUrls: [],
      competitorContextState: undefined,
      competitorEntities: [],
      evidenceRefs: []
    })
  ]);

  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].coverageState, "PARTIAL");
  assert.equal(result.segments[0].freshObservedCount, 1);
});

test("fails closed on baseline conflicts and never converts excluded conflicting runs into visibility evidence", () => {
  const first = observed("conflict-a", { queryId: "same-query" });
  const second = observed("conflict-b", {
    queryId: "same-query",
    mentionState: "ABSENT",
    positionClass: undefined,
    citationState: undefined,
    entityAccuracy: undefined,
    citationUrls: [],
    competitorContextState: "NONE_OBSERVED",
    competitorEntities: [],
    evidenceRefs: ["evidence:conflict-b"]
  });
  const baseline = compileAISearchAuthorityBaselineV1([first, second], baselineAt);
  assert.equal(baseline.conflicts.length, 1);

  const result = compileAISearchAuthorityScorecardV1(baseline, baselineAt);
  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.coverage.conflictCount, 1);
  assert.equal(result.coverage.freshObservedCount, 0);
  assert.equal(result.overall.mentionRate, null);
  assert.equal(result.observedAuthorityGaps.length, 0);
});

test("is deterministic, deeply immutable, JSON-safe, and grants zero external or publishing authority", () => {
  const inputs = [
    observed("b", { system: "GEMINI", queryId: "q-b" }),
    observed("a", { system: "CHATGPT", queryId: "q-a" })
  ];
  const baselineForward = compileAISearchAuthorityBaselineV1(inputs, baselineAt);
  const baselineReverse = compileAISearchAuthorityBaselineV1([...inputs].reverse(), baselineAt);
  const forward = compileAISearchAuthorityScorecardV1(baselineForward, baselineAt);
  const reverse = compileAISearchAuthorityScorecardV1(baselineReverse, baselineAt);

  assert.deepEqual(forward, reverse);
  assert.equal(JSON.stringify(forward).includes("Infinity"), false);
  assert.equal(Object.isFrozen(forward), true);
  assert.equal(Object.isFrozen(forward.overall), true);
  assert.equal(Object.isFrozen(forward.segments), true);
  assert.equal(Object.isFrozen(forward.citationDomains), true);
  assert.equal(Object.isFrozen(forward.observedCompetitorContext), true);
  assert.equal(forward.causalAttributionClaimed, false);
  assert.equal(forward.monetaryValue, null);
  assert.equal(forward.externalAccessPerformed, false);
  assert.equal(forward.writesPerformed, false);
  assert.equal(forward.publicPublishingPerformed, false);
});

test("rejects impossible scorecard chronology", () => {
  const baseline = compileAISearchAuthorityBaselineV1([observed("chronology")], baselineAt);
  assert.throws(
    () => compileAISearchAuthorityScorecardV1(baseline, "2026-09-18T12:59:59Z"),
    /evaluatedAt cannot precede baseline.generatedAt/
  );
});
