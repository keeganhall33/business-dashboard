import assert from "node:assert/strict";
import test from "node:test";

import {
  reviewOpportunityRadarPrecisionV1,
  type OpportunityRadarEvidenceFieldV1,
  type OpportunityRadarPrecisionCandidateV1,
  type OpportunityRadarPrecisionReviewInputV1,
  type OpportunityRadarTruthStateV1
} from "../../src/lib/discovery-intelligence/opportunity-radar-precision-review-v1";

const NOW = "2026-09-14T04:00:00.000Z";

function field<T>(
  value: T | null,
  state: OpportunityRadarTruthStateV1 = "KNOWN",
  evidenceRefs: readonly string[] = ["evidence:1"]
): OpportunityRadarEvidenceFieldV1<T> {
  return { state, value, evidenceRefs };
}

function candidate(overrides: Partial<OpportunityRadarPrecisionCandidateV1> = {}): OpportunityRadarPrecisionCandidateV1 {
  return {
    candidateId: "opportunity-1",
    title: "Global motorsport heritage commission",
    observedAt: "2026-09-13T12:00:00.000Z",
    sourceRefs: ["source:announcement", "source:buyer"],
    syndicationKey: "motorsport-heritage-2027",
    planningHorizonMonths: field(9, "KNOWN", ["timeline:1"]),
    keeganFit: field("Documented motorsport portrait and licensing fit", "KNOWN", ["fit:1"]),
    buyerOrFunction: field("Global brand partnerships director", "KNOWN", ["buyer:1"]),
    differentiatedThesis: field("A heritage portrait program grounded in licensed racing history", "KNOWN", ["thesis:1"]),
    accessPath: field("Warm introduction through the existing licensing partner", "KNOWN", ["access:1"]),
    safeNextMove: field("Verify the 2027 commissioning calendar with the partnership lead", "KNOWN", ["move:1"]),
    ...overrides
  };
}

function input(
  candidates: readonly OpportunityRadarPrecisionCandidateV1[],
  overrides: Partial<OpportunityRadarPrecisionReviewInputV1> = {}
): OpportunityRadarPrecisionReviewInputV1 {
  return { candidates, now: NOW, ...overrides };
}

test("qualifies a specific long-lead candidate with a safe next move", () => {
  const result = reviewOpportunityRadarPrecisionV1(input([candidate()]));

  assert.equal(result.qualified.length, 1);
  assert.equal(result.suppressed.length, 0);
  assert.equal(result.qualified[0].reasonCode, "PRECISION_CRITERIA_MET");
  assert.equal(result.qualified[0].candidate.planningHorizonMonths, 9);
});

test("suppresses late and generic candidates with explicit reasons", () => {
  const result = reviewOpportunityRadarPrecisionV1(
    input([
      candidate({
        candidateId: "late-generic",
        syndicationKey: "late-generic",
        planningHorizonMonths: field(1, "KNOWN", ["timeline:late"]),
        differentiatedThesis: field("Portrait", "KNOWN", ["thesis:generic"])
      })
    ])
  );

  assert.deepEqual(result.suppressed[0].reasonCodes, ["INSUFFICIENT_PLANNING_RUNWAY", "GENERIC_THESIS"]);
});

test("deduplicates syndicated evidence without inflating qualified volume", () => {
  const original = candidate({ candidateId: "original", observedAt: "2026-09-13T14:00:00Z" });
  const syndicated = candidate({
    candidateId: "syndicated",
    title: "Syndicated copy of motorsport commission",
    observedAt: "2026-09-13T12:00:00Z",
    sourceRefs: ["source:syndicated"]
  });
  const result = reviewOpportunityRadarPrecisionV1(input([syndicated, original]));

  assert.deepEqual(result.qualified.map((decision) => decision.candidate.candidateId), ["original"]);
  assert.equal(result.suppressed[0].candidateId, "syndicated");
  assert.deepEqual(result.suppressed[0].reasonCodes, ["DUPLICATE_EVIDENCE"]);
  assert.equal(result.suppressed[0].duplicateOfCandidateId, "original");
});

test("suppresses a candidate whose access path is missing", () => {
  const result = reviewOpportunityRadarPrecisionV1(
    input([candidate({ accessPath: field(null, "UNKNOWN", ["access:unverified"]) })])
  );

  assert.deepEqual(result.suppressed[0].reasonCodes, ["UNKNOWN_EVIDENCE", "ACCESS_PATH_MISSING"]);
  assert.equal(result.suppressed[0].evidenceStates.accessPath, "UNKNOWN");
});

test("preserves unknown fit instead of manufacturing qualification", () => {
  const result = reviewOpportunityRadarPrecisionV1(
    input([candidate({ keeganFit: field(null, "UNKNOWN", ["fit:unknown"]) })])
  );

  assert.deepEqual(result.suppressed[0].reasonCodes, ["UNKNOWN_EVIDENCE", "KEEGAN_FIT_UNPROVEN"]);
  assert.equal(result.qualified.length, 0);
});

test("preserves stale and conflicted truth as suppression states", () => {
  const result = reviewOpportunityRadarPrecisionV1(
    input([
      candidate({ candidateId: "stale", syndicationKey: "stale", observedAt: "2026-05-01T00:00:00Z" }),
      candidate({
        candidateId: "conflicted",
        syndicationKey: "conflicted",
        buyerOrFunction: field("Conflicting buyer claims", "CONFLICTED", ["buyer:a", "buyer:b"])
      })
    ])
  );

  assert.deepEqual(result.suppressed.find((item) => item.candidateId === "stale")?.reasonCodes, ["STALE_EVIDENCE"]);
  assert.deepEqual(result.suppressed.find((item) => item.candidateId === "conflicted")?.reasonCodes, ["CONFLICTED_EVIDENCE"]);
});

test("withholds inferred evidence until it is verified", () => {
  const result = reviewOpportunityRadarPrecisionV1(
    input([candidate({ buyerOrFunction: field("Likely licensing director", "INFERRED", ["buyer:inference"]) })])
  );

  assert.deepEqual(result.suppressed[0].reasonCodes, ["INFERRED_EVIDENCE_REQUIRES_VERIFICATION"]);
});

test("enforces the hard five-candidate surface limit", () => {
  const candidates = Array.from({ length: 7 }, (_, index) =>
    candidate({
      candidateId: `opportunity-${index + 1}`,
      syndicationKey: `story-${index + 1}`,
      planningHorizonMonths: field(index + 3, "KNOWN", [`timeline:${index + 1}`])
    })
  );
  const result = reviewOpportunityRadarPrecisionV1(input(candidates));

  assert.equal(result.qualified.length, 5);
  assert.equal(result.suppressed.length, 2);
  assert.ok(result.suppressed.every((decision) => decision.reasonCodes[0] === "SURFACE_LIMIT_REACHED"));
});

test("returns deterministic qualification order independent of input order", () => {
  const a = candidate({ candidateId: "a", syndicationKey: "a", planningHorizonMonths: field(8) });
  const b = candidate({ candidateId: "b", syndicationKey: "b", planningHorizonMonths: field(4) });
  const c = candidate({ candidateId: "c", syndicationKey: "c", planningHorizonMonths: field(6) });

  const forward = reviewOpportunityRadarPrecisionV1(input([a, b, c]));
  const reverse = reviewOpportunityRadarPrecisionV1(input([c, b, a]));

  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward.qualified.map((decision) => decision.candidate.candidateId), ["b", "c", "a"]);
});

test("does not mutate caller data and deeply freezes its output", () => {
  const source = input([candidate()]);
  const before = structuredClone(source);
  const result = reviewOpportunityRadarPrecisionV1(source);

  assert.deepEqual(source, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.qualified), true);
  assert.equal(Object.isFrozen(result.qualified[0]), true);
  assert.equal(Object.isFrozen(result.qualified[0].candidate.sourceRefs), true);
});

test("rejects unsupported keys and unbounded inputs", () => {
  assert.throws(
    () => reviewOpportunityRadarPrecisionV1({ ...input([candidate()]), outreach: true } as never),
    /unsupported key outreach/
  );
  assert.throws(
    () => reviewOpportunityRadarPrecisionV1(input(Array.from({ length: 501 }, (_, index) => candidate({ candidateId: `c-${index}`, syndicationKey: `s-${index}` })))),
    /candidates exceeds 500/
  );
});

test("returns review evidence only and performs no consequential action", () => {
  const result = reviewOpportunityRadarPrecisionV1(input([candidate()]));

  assert.equal(result.externalMutationPerformed, false);
  assert.equal("outreach" in result, false);
  assert.equal("publish" in result, false);
  assert.equal("spend" in result, false);
});
