import assert from "node:assert/strict";
import test from "node:test";

import {
  findRelationshipPathsV1,
  RelationshipPathfinderError,
  type CanonicalRelationshipEdgeRefV1,
  type CanonicalRelationshipEntityRefV1,
  type RelationshipPathfinderInputV1
} from "../../src/lib/relationship-intelligence/relationship-pathfinder-v1";

const generatedAt = "2026-09-18T04:00:00.000Z";

const entities: CanonicalRelationshipEntityRefV1[] = [
  { entityId: "keegan", label: "Keegan Hall", canonicalRef: "crm:person:keegan" },
  { entityId: "bridge-a", label: "Bridge A", canonicalRef: "crm:person:bridge-a" },
  { entityId: "bridge-b", label: "Bridge B", canonicalRef: "crm:person:bridge-b" },
  { entityId: "bridge-c", label: "Bridge C", canonicalRef: "crm:person:bridge-c" },
  { entityId: "target", label: "Target", canonicalRef: "crm:person:target" }
];

function edge(
  edgeId: string,
  fromEntityId: string,
  toEntityId: string,
  overrides: Partial<CanonicalRelationshipEdgeRefV1> = {}
): CanonicalRelationshipEdgeRefV1 {
  return {
    edgeId,
    fromEntityId,
    toEntityId,
    canonicalRef: `crm:relationship:${edgeId}`,
    relationshipState: "KNOWN",
    evidenceQuality: "HIGH",
    evidenceRefs: [`evidence:${edgeId}:relationship`],
    strength: "STRONG",
    lastMeaningfulInteractionAt: "2026-09-10T04:00:00.000Z",
    staleAfterDays: 90,
    willingness: { state: "KNOWN", level: "LIKELY", evidenceRefs: [`evidence:${edgeId}:willingness`] },
    contextFit: { state: "KNOWN", level: "HIGH", evidenceRefs: [`evidence:${edgeId}:context`] },
    introduction: { state: "KNOWN", appropriate: true, reason: "A documented warm introduction is contextually appropriate.", evidenceRefs: [`evidence:${edgeId}:intro`] },
    targetAuthority: { state: "KNOWN", level: "DECISION_MAKER", roleRelevance: "HIGH", evidenceRefs: [`evidence:${edgeId}:authority`] },
    timing: { state: "KNOWN", window: "OPEN", rationale: "The supported planning window is open.", evidenceRefs: [`evidence:${edgeId}:timing`] },
    blockers: [],
    ...overrides
  };
}

function input(edges: CanonicalRelationshipEdgeRefV1[], overrides: Partial<RelationshipPathfinderInputV1> = {}): RelationshipPathfinderInputV1 {
  return {
    sourceEntityId: "keegan",
    targetEntityId: "target",
    entities,
    edges,
    generatedAt,
    maxHops: 4,
    maxAlternatePaths: 3,
    ...overrides
  };
}

test("ranks the strongest evidence-supported route rather than assuming the shortest route is best", () => {
  const direct = edge("direct", "keegan", "target", { strength: "WEAK", evidenceQuality: "MEDIUM" });
  const viaA = edge("via-a", "keegan", "bridge-a");
  const aToTarget = edge("a-target", "bridge-a", "target");

  const result = findRelationshipPathsV1(input([direct, viaA, aToTarget]));

  assert.equal(result.status, "PATHS_FOUND");
  assert.deepEqual(result.primaryPath?.entityIds, ["keegan", "bridge-a", "target"]);
  assert.equal(result.primaryPath?.readiness, "READY");
  assert.deepEqual(result.alternatePaths[0]?.entityIds, ["keegan", "target"]);
  assert.equal(result.actionAuthority.externalActionAuthorized, false);
  assert.equal(result.actionAuthority.outreachAuthorized, false);
});

test("returns bounded deterministic alternate paths with stable ordering", () => {
  const edges = [
    edge("a-1", "keegan", "bridge-a"), edge("a-2", "bridge-a", "target"),
    edge("b-1", "keegan", "bridge-b"), edge("b-2", "bridge-b", "target"),
    edge("c-1", "keegan", "bridge-c"), edge("c-2", "bridge-c", "target")
  ];
  const request = input(edges, { maxAlternatePaths: 1 });
  const first = findRelationshipPathsV1(request);
  const second = findRelationshipPathsV1(request);

  assert.deepEqual(first, second);
  assert.equal(first.alternatePaths.length, 1);
  assert.equal(first.primaryPath?.pathId, second.primaryPath?.pathId);
  assert.equal(first.resultId, second.resultId);
});

test("exposes the weakest supported edge and preserves exact evidence lineage", () => {
  const first = edge("first", "keegan", "bridge-a");
  const weak = edge("weak", "bridge-a", "target", {
    strength: "WEAK",
    evidenceQuality: "LOW",
    willingness: { state: "KNOWN", level: "POSSIBLE", evidenceRefs: ["evidence:weak:willingness"] }
  });
  const result = findRelationshipPathsV1(input([first, weak]));

  assert.equal(result.primaryPath?.weakestEdge.edgeId, "weak");
  assert.equal(result.primaryPath?.weakestEdge.reason, "WEAK_RELATIONSHIP_STRENGTH");
  assert.ok(result.primaryPath?.evidenceRefs.includes("evidence:weak:relationship"));
  assert.ok(result.primaryPath?.evidenceRefs.includes("evidence:weak:willingness"));
  assert.ok(result.primaryPath?.evidenceRefs.includes("evidence:weak:authority"));
  assert.equal(result.primaryPath?.edges[1].canonicalRef, "crm:relationship:weak");
});

test("preserves authority uncertainty instead of inflating access into decision authority", () => {
  const unknownAuthority = edge("unknown-authority", "keegan", "target", {
    targetAuthority: { state: "UNKNOWN", level: "UNKNOWN", roleRelevance: "UNKNOWN", evidenceRefs: [] }
  });
  const result = findRelationshipPathsV1(input([unknownAuthority], { requiresDecisionAuthority: true }));

  assert.equal(result.status, "PATHS_FOUND");
  assert.equal(result.primaryPath?.readiness, "RESEARCH_REQUIRED");
  assert.equal(result.primaryPath?.authorityBoundary.level, "UNKNOWN");
  assert.equal(result.primaryPath?.authorityBoundary.truthState, "UNKNOWN");
  assert.equal(result.primaryPath?.authorityBoundary.decisionAuthorityConfirmed, false);
});

test("returns explicit no-path UNKNOWN when relationship evidence is stale, conflicted, or unknown", () => {
  const stale = edge("stale", "keegan", "target", { lastMeaningfulInteractionAt: "2025-01-01T00:00:00.000Z", staleAfterDays: 30 });
  const conflicted = edge("conflicted", "keegan", "target", { relationshipState: "CONFLICTED" });
  const unknown = edge("unknown", "keegan", "target", { relationshipState: "UNKNOWN", evidenceQuality: "UNKNOWN", evidenceRefs: [] });
  const result = findRelationshipPathsV1(input([stale, conflicted, unknown]));

  assert.equal(result.status, "NO_SUPPORTED_PATH");
  assert.equal(result.primaryPath, null);
  assert.equal(result.noPath?.truthState, "UNKNOWN");
  assert.deepEqual(result.noPath?.excludedEdgeIds, ["conflicted", "stale", "unknown"]);
  assert.ok(result.noPath?.informationGainActions.includes("REFRESH_STALE_RELATIONSHIP_EVIDENCE"));
  assert.ok(result.noPath?.informationGainActions.includes("RESOLVE_CONFLICTED_RELATIONSHIP_EVIDENCE"));
  assert.ok(result.noPath?.informationGainActions.includes("VERIFY_CANONICAL_RELATIONSHIP_EDGE"));
});

test("refuses inappropriate introductions and closed timing windows rather than fabricating a usable route", () => {
  const inappropriate = edge("inappropriate", "keegan", "target", {
    introduction: { state: "KNOWN", appropriate: false, reason: "The contact asked not to make introductions.", evidenceRefs: ["evidence:no-intro"] }
  });
  const closed = edge("closed", "keegan", "target", {
    timing: { state: "KNOWN", window: "CLOSED", rationale: "Planning window closed.", evidenceRefs: ["evidence:closed"] }
  });
  const result = findRelationshipPathsV1(input([inappropriate, closed]));

  assert.equal(result.status, "NO_SUPPORTED_PATH");
  assert.ok(result.noPath?.informationGainActions.includes("VERIFY_INTRODUCTION_APPROPRIATENESS"));
  assert.ok(result.noPath?.informationGainActions.includes("VERIFY_TIMING_WINDOW"));
});

test("surfaces blockers without silently discarding an otherwise legitimate path", () => {
  const blocked = edge("blocked", "keegan", "target", { blockers: ["Partner requested a pause until October."] });
  const result = findRelationshipPathsV1(input([blocked]));

  assert.equal(result.status, "PATHS_FOUND");
  assert.equal(result.primaryPath?.readiness, "BLOCKED");
  assert.deepEqual(result.primaryPath?.blockers, ["Partner requested a pause until October."]);
  assert.equal(result.primaryPath?.timing.weakestWindow, "OPEN");
});

test("prevents cycles and never invents an implicit reverse relationship", () => {
  const result = findRelationshipPathsV1(input([
    edge("ka", "keegan", "bridge-a"),
    edge("ak", "bridge-a", "keegan"),
    edge("at", "bridge-a", "target")
  ]));

  assert.deepEqual(result.primaryPath?.entityIds, ["keegan", "bridge-a", "target"]);
  assert.equal(new Set(result.primaryPath?.entityIds).size, result.primaryPath?.entityIds.length);

  const reverseOnly = findRelationshipPathsV1(input([edge("reverse", "target", "keegan")]));
  assert.equal(reverseOnly.status, "NO_SUPPORTED_PATH");
});

test("does not mutate canonical inputs and returns deeply frozen analysis-only output", () => {
  const request = input([edge("direct", "keegan", "target")]);
  const before = structuredClone(request);
  const result = findRelationshipPathsV1(request);

  assert.deepEqual(request, before);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.primaryPath));
  assert.ok(Object.isFrozen(result.primaryPath?.edges));
  assert.equal(result.actionAuthority.analysisOnly, true);
  assert.equal(result.actionAuthority.externalActionAuthorized, false);
});

test("rejects identity drift, duplicate edges, and non-canonical edge references", () => {
  assert.throws(
    () => findRelationshipPathsV1(input([edge("bad", "keegan", "missing")])),
    (error: unknown) => error instanceof RelationshipPathfinderError && error.code === "UNKNOWN_EDGE_ENTITY"
  );
  const duplicate = edge("dup", "keegan", "target");
  assert.throws(
    () => findRelationshipPathsV1(input([duplicate, duplicate])),
    (error: unknown) => error instanceof RelationshipPathfinderError && error.code === "DUPLICATE_EDGE"
  );
  assert.throws(
    () => findRelationshipPathsV1(input([edge("self", "keegan", "target")], { sourceEntityId: "target", targetEntityId: "target" })),
    (error: unknown) => error instanceof RelationshipPathfinderError && error.code === "IDENTITY_COLLISION"
  );
});
