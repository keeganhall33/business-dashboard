import assert from "node:assert/strict";
import test from "node:test";

import {
  findRelationshipPathsV1,
  RelationshipPathfinderError,
  type CanonicalRelationshipEdgeRefV1,
  type RelationshipPathfinderInputV1
} from "../../src/lib/relationship-intelligence/relationship-pathfinder-v1";

const generatedAt = "2026-09-18T10:00:00.000Z";

function edge(overrides: Partial<CanonicalRelationshipEdgeRefV1> = {}): CanonicalRelationshipEdgeRefV1 {
  return {
    edgeId: "keegan-target",
    fromEntityId: "keegan",
    toEntityId: "target",
    canonicalRef: "crm:relationship:keegan-target",
    relationshipState: "KNOWN",
    evidenceQuality: "HIGH",
    evidenceRefs: ["evidence:relationship"],
    strength: "STRONG",
    lastMeaningfulInteractionAt: "2026-09-10T10:00:00.000Z",
    staleAfterDays: 90,
    willingness: { state: "KNOWN", level: "LIKELY", evidenceRefs: ["evidence:willingness"] },
    contextFit: { state: "KNOWN", level: "HIGH", evidenceRefs: ["evidence:context"] },
    introduction: {
      state: "KNOWN",
      appropriate: true,
      reason: "A documented introduction is appropriate.",
      evidenceRefs: ["evidence:introduction"]
    },
    targetAuthority: {
      state: "KNOWN",
      level: "DECISION_MAKER",
      roleRelevance: "HIGH",
      evidenceRefs: ["evidence:authority"]
    },
    timing: {
      state: "KNOWN",
      window: "OPEN",
      rationale: "The evidenced planning window is open.",
      evidenceRefs: ["evidence:timing"]
    },
    blockers: [],
    ...overrides
  };
}

function input(candidate: CanonicalRelationshipEdgeRefV1): RelationshipPathfinderInputV1 {
  return {
    sourceEntityId: "keegan",
    targetEntityId: "target",
    generatedAt,
    requiresDecisionAuthority: true,
    entities: [
      { entityId: "keegan", label: "Keegan Hall", canonicalRef: "crm:person:keegan" },
      { entityId: "target", label: "Target", canonicalRef: "crm:person:target" }
    ],
    edges: [candidate]
  };
}

test("does not promote an inferred relationship edge into a warm access path", () => {
  const result = findRelationshipPathsV1(input(edge({ relationshipState: "INFERRED" })));

  assert.equal(result.status, "NO_SUPPORTED_PATH");
  assert.deepEqual(result.noPath?.excludedEdgeIds, ["keegan-target"]);
  assert.ok(result.noPath?.informationGainActions.includes("VERIFY_CANONICAL_RELATIONSHIP_EDGE"));
  assert.equal(result.actionAuthority.outreachAuthorized, false);
});

test("requires direct evidence for willingness, context fit, introduction appropriateness, and timing", () => {
  const cases: Array<[string, CanonicalRelationshipEdgeRefV1, string]> = [
    [
      "willingness",
      edge({ willingness: { state: "KNOWN", level: "LIKELY", evidenceRefs: [] } }),
      "VERIFY_INTRODUCER_WILLINGNESS"
    ],
    [
      "context",
      edge({ contextFit: { state: "KNOWN", level: "HIGH", evidenceRefs: [] } }),
      "VERIFY_CONTEXT_FIT"
    ],
    [
      "introduction",
      edge({ introduction: { state: "KNOWN", appropriate: true, reason: "Looks appropriate.", evidenceRefs: [] } }),
      "VERIFY_INTRODUCTION_APPROPRIATENESS"
    ],
    [
      "timing",
      edge({ timing: { state: "KNOWN", window: "OPEN", rationale: "Planning is open.", evidenceRefs: [] } }),
      "VERIFY_TIMING_WINDOW"
    ]
  ];

  for (const [label, candidate, expectedAction] of cases) {
    const result = findRelationshipPathsV1(input(candidate));
    assert.equal(result.status, "NO_SUPPORTED_PATH", label);
    assert.ok(result.noPath?.informationGainActions.includes(expectedAction), label);
  }
});

test("requires timing rationale instead of converting a bare OPEN label into actionable timing", () => {
  const result = findRelationshipPathsV1(input(edge({
    timing: { state: "KNOWN", window: "OPEN", rationale: "", evidenceRefs: ["evidence:timing"] }
  })));

  assert.equal(result.status, "NO_SUPPORTED_PATH");
  assert.ok(result.noPath?.informationGainActions.includes("VERIFY_TIMING_WINDOW"));
});

test("keeps an evidenced relationship path research-required when decision-maker authority lacks evidence", () => {
  const result = findRelationshipPathsV1(input(edge({
    targetAuthority: {
      state: "KNOWN",
      level: "DECISION_MAKER",
      roleRelevance: "HIGH",
      evidenceRefs: []
    }
  })));

  assert.equal(result.status, "PATHS_FOUND");
  assert.equal(result.primaryPath?.readiness, "RESEARCH_REQUIRED");
  assert.equal(result.primaryPath?.authorityBoundary.decisionAuthorityConfirmed, false);
});

test("rejects future-dated relationship interactions instead of treating them as fresh", () => {
  assert.throws(
    () => findRelationshipPathsV1(input(edge({ lastMeaningfulInteractionAt: "2026-09-19T10:00:00.000Z" }))),
    (error: unknown) => error instanceof RelationshipPathfinderError && error.code === "FUTURE_RELATIONSHIP_EVIDENCE"
  );
});
