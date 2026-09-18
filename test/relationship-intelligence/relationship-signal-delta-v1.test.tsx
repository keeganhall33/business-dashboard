import assert from "node:assert/strict";
import test from "node:test";

import {
  compileRelationshipSignalDeltasV1,
  type CanonicalRelationshipSnapshotV1,
  type RelationshipSignalTruthStateV1,
  type RelationshipSignalV1
} from "../../src/lib/relationship-intelligence/relationship-signal-delta-v1";

const NOW = "2026-09-18T09:00:00.000Z";

function signal(overrides: Partial<RelationshipSignalV1> = {}): RelationshipSignalV1 {
  return {
    signalId: "signal-1",
    sourceEventKey: "story-1",
    sourceRef: "boardroom:story-1",
    observedAt: "2026-09-18T08:00:00.000Z",
    truthState: "KNOWN",
    signalType: "SPONSORSHIP_ANNOUNCEMENT",
    subjectEntityRef: "org:sponsor",
    objectEntityRef: "org:property",
    relationshipKind: "SPONSOR_OF",
    relationshipStatus: "ACTIVE",
    evidenceRefs: ["evidence:story-1"],
    ...overrides
  };
}

function current(overrides: Partial<CanonicalRelationshipSnapshotV1> = {}): CanonicalRelationshipSnapshotV1 {
  return {
    relationshipRef: "relationship:sponsor-property",
    subjectEntityRef: "org:sponsor",
    objectEntityRef: "org:property",
    relationshipKind: "SPONSOR_OF",
    relationshipStatus: "ACTIVE",
    truthState: "KNOWN",
    evidenceRefs: ["evidence:crm-1"],
    lastVerifiedAt: "2026-09-10T12:00:00.000Z",
    ...overrides
  };
}

function compile(
  signals: readonly RelationshipSignalV1[],
  currentRelationships: readonly CanonicalRelationshipSnapshotV1[] = [],
  extra: Partial<Parameters<typeof compileRelationshipSignalDeltasV1>[0]> = {}
) {
  return compileRelationshipSignalDeltasV1({
    signals,
    currentRelationships,
    now: NOW,
    ...extra
  });
}

test("projects a fresh known exact-identity signal as a new relationship candidate without mutating the graph", () => {
  const result = compile([signal()]);
  const item = result.decisions[0];

  assert.equal(item.disposition, "NEW_RELATIONSHIP_CANDIDATE");
  assert.equal(item.changeClass, "ADD_RELATIONSHIP");
  assert.deepEqual(item.reasonCodes, ["FRESH_KNOWN_SIGNAL_WITH_EXACT_ENTITY_ANCHORS"]);
  assert.equal(item.matchedRelationshipRef, null);
  assert.equal(result.matchingPolicy, "EXACT_CANONICAL_DIRECTION_AND_RELATIONSHIP_KIND_ONLY");
  assert.equal(result.graphMutationPerformed, false);
  assert.equal(result.crmMutationPerformed, false);
  assert.equal(result.externalActionPerformed, false);
});

test("treats an exact already-current canonical relationship as corroboration rather than a duplicate graph edge", () => {
  const result = compile([signal()], [current()]);
  const item = result.decisions[0];

  assert.equal(item.disposition, "NO_MATERIAL_CHANGE");
  assert.equal(item.changeClass, "CONFIRM_EXISTING");
  assert.equal(item.matchedRelationshipRef, "relationship:sponsor-property");
  assert.deepEqual(item.matchedRelationshipEvidenceRefs, ["evidence:crm-1"]);
  assert.deepEqual(item.reasonCodes, ["EXACT_RELATIONSHIP_ALREADY_CURRENT"]);
});

test("projects an evidenced end signal for a current active relationship as a review-gated update candidate", () => {
  const result = compile([
    signal({
      signalType: "SPONSORSHIP_END",
      relationshipStatus: "ENDED"
    })
  ], [current()]);

  assert.equal(result.decisions[0].disposition, "UPDATE_RELATIONSHIP_CANDIDATE");
  assert.equal(result.decisions[0].changeClass, "END_RELATIONSHIP");
  assert.equal(result.decisions[0].safeNextStep, "REVIEW_RELATIONSHIP_CHANGE");
  assert.deepEqual(result.decisions[0].reasonCodes, ["KNOWN_END_SIGNAL_FOR_CURRENT_ACTIVE_RELATIONSHIP"]);
});

test("does not silently reopen a previously ended relationship", () => {
  const result = compile([signal()], [current({ relationshipStatus: "ENDED" })]);

  assert.equal(result.decisions[0].disposition, "NEEDS_VERIFICATION");
  assert.equal(result.decisions[0].changeClass, "NONE");
  assert.deepEqual(result.decisions[0].reasonCodes, ["PREVIOUSLY_ENDED_RELATIONSHIP_RESTART_AMBIGUOUS"]);
});

test("requires exact canonical entity resolution before any graph candidate can exist", () => {
  const result = compile([signal({ subjectEntityRef: null })]);

  assert.equal(result.decisions[0].disposition, "NEEDS_VERIFICATION");
  assert.equal(result.decisions[0].safeNextStep, "RESOLVE_CANONICAL_ENTITIES");
  assert.deepEqual(result.decisions[0].reasonCodes, ["CANONICAL_ENTITY_RESOLUTION_REQUIRED"]);
});

test("preserves unknown relationship kind, unknown status, and missing evidence as verification work", () => {
  const cases = [
    signal({ signalId: "kind", sourceEventKey: "kind", relationshipKind: "UNKNOWN" }),
    signal({ signalId: "status", sourceEventKey: "status", relationshipStatus: "UNKNOWN" }),
    signal({ signalId: "evidence", sourceEventKey: "evidence", evidenceRefs: [] })
  ];
  const result = compile(cases);
  const byId = new Map(result.decisions.map((item) => [item.signalId, item]));

  assert.deepEqual(byId.get("kind")?.reasonCodes, ["RELATIONSHIP_KIND_UNKNOWN"]);
  assert.deepEqual(byId.get("status")?.reasonCodes, ["RELATIONSHIP_STATUS_UNKNOWN"]);
  assert.deepEqual(byId.get("evidence")?.reasonCodes, ["EVIDENCE_REQUIRED"]);
  assert.equal(result.counts.needsVerification, 3);
});

test("fails closed for inferred, unknown, stale, conflicted, and partial source truth", () => {
  const states: RelationshipSignalTruthStateV1[] = ["INFERRED", "UNKNOWN", "STALE", "CONFLICTED", "PARTIAL"];
  const result = compile(states.map((truthState) => signal({
    signalId: truthState,
    sourceEventKey: truthState,
    truthState
  })));

  assert.equal(result.counts.needsVerification, states.length);
  for (const item of result.decisions) {
    assert.equal(item.disposition, "NEEDS_VERIFICATION");
    assert.match(item.reasonCodes[0], /^SIGNAL_TRUTH_/);
  }
});

test("ages old source evidence to verification instead of treating it as current truth", () => {
  const result = compile([
    signal({ observedAt: "2026-07-01T00:00:00.000Z" })
  ], [], { maximumSignalAgeDays: 30 });

  assert.equal(result.decisions[0].disposition, "NEEDS_VERIFICATION");
  assert.deepEqual(result.decisions[0].reasonCodes, ["SIGNAL_STALE_BY_AGE"]);
});

test("does not reverse or infer relationship direction from a sponsorship signal", () => {
  const result = compile([signal()], [current({
    relationshipRef: "relationship:reverse",
    subjectEntityRef: "org:property",
    objectEntityRef: "org:sponsor"
  })]);

  assert.equal(result.decisions[0].disposition, "NEW_RELATIONSHIP_CANDIDATE");
  assert.equal(result.decisions[0].matchedRelationshipRef, null);
  assert.equal(result.relationshipKindInferencePerformed, false);
});

test("suppresses exact duplicate source-event copies but keeps one deterministic canonical signal", () => {
  const result = compile([
    signal({ signalId: "signal-b" }),
    signal({ signalId: "signal-a" })
  ]);
  const byId = new Map(result.decisions.map((item) => [item.signalId, item]));

  assert.equal(byId.get("signal-a")?.disposition, "NEW_RELATIONSHIP_CANDIDATE");
  assert.equal(byId.get("signal-b")?.disposition, "SUPPRESS");
  assert.deepEqual(byId.get("signal-b")?.reasonCodes, ["DUPLICATE_SOURCE_EVENT"]);
  assert.equal(result.counts.suppressed, 1);
});

test("routes conflicting copies of one source event to reconciliation instead of choosing a winner", () => {
  const result = compile([
    signal({ signalId: "active" }),
    signal({ signalId: "ended", relationshipStatus: "ENDED", signalType: "SPONSORSHIP_END" })
  ]);

  assert.equal(result.counts.needsVerification, 2);
  for (const item of result.decisions) {
    assert.deepEqual(item.reasonCodes, ["CONFLICTING_SOURCE_EVENT_DUPLICATES"]);
    assert.equal(item.safeNextStep, "RECONCILE_CONFLICT");
  }
});

test("detects simultaneous contradictory known relationship statuses across distinct source events", () => {
  const result = compile([
    signal({ signalId: "active", sourceEventKey: "active", sourceRef: "official:active" }),
    signal({ signalId: "ended", sourceEventKey: "ended", sourceRef: "official:ended", relationshipStatus: "ENDED", signalType: "SPONSORSHIP_END" })
  ]);

  assert.equal(result.counts.needsVerification, 2);
  for (const item of result.decisions) {
    assert.deepEqual(item.reasonCodes, ["CONFLICTING_SIMULTANEOUS_RELATIONSHIP_STATUS"]);
  }
});

test("fails closed when canonical storage already contains multiple exact relationship matches", () => {
  const result = compile([signal()], [
    current({ relationshipRef: "relationship:a" }),
    current({ relationshipRef: "relationship:b" })
  ]);

  assert.equal(result.decisions[0].disposition, "NEEDS_VERIFICATION");
  assert.deepEqual(result.decisions[0].reasonCodes, ["MULTIPLE_CANONICAL_RELATIONSHIP_MATCHES"]);
  assert.equal(result.decisions[0].safeNextStep, "REVIEW_CANONICAL_DUPLICATE");
});

test("requires current canonical truth and freshness before using an existing relationship as decision evidence", () => {
  const conflicted = compile([signal()], [current({ truthState: "CONFLICTED" })]);
  assert.equal(conflicted.decisions[0].disposition, "NEEDS_VERIFICATION");
  assert.deepEqual(conflicted.decisions[0].reasonCodes, ["CURRENT_RELATIONSHIP_TRUTH_CONFLICTED_REQUIRES_VERIFICATION"]);

  const stale = compile([signal()], [current({ lastVerifiedAt: "2025-01-01T00:00:00.000Z" })], {
    maximumCurrentRelationshipAgeDays: 180
  });
  assert.equal(stale.decisions[0].disposition, "NEEDS_VERIFICATION");
  assert.deepEqual(stale.decisions[0].reasonCodes, ["CURRENT_RELATIONSHIP_STALE_BY_AGE"]);
});

test("rejects future evidence, duplicate canonical ids, unsupported fields, and credential material", () => {
  assert.throws(() => compile([signal({ observedAt: "2026-09-19T00:00:00.000Z" })]), /future-dated/);
  assert.throws(() => compile([signal()], [
    current({ relationshipRef: "relationship:duplicate" }),
    current({ relationshipRef: "relationship:duplicate", subjectEntityRef: "org:other" })
  ]), /duplicate relationshipRef/);
  assert.throws(() => compile([{
    ...signal(),
    unexpected: "not allowed"
  } as RelationshipSignalV1]), /unsupported key/);
  assert.throws(() => compile([signal({ sourceRef: "op://vault/item/field" })]), /credential material/);
});

test("is deterministic, deeply immutable, and never invents an opportunity or external authority", () => {
  const input = {
    signals: [signal()],
    currentRelationships: [] as CanonicalRelationshipSnapshotV1[],
    now: NOW
  } as const;
  const first = compileRelationshipSignalDeltasV1(input);
  const second = compileRelationshipSignalDeltasV1(input);

  assert.deepEqual(first, second);
  assert.equal(first.opportunityInferencePerformed, false);
  assert.equal(first.graphMutationPerformed, false);
  assert.equal(first.crmMutationPerformed, false);
  assert.equal(first.externalActionPerformed, false);
  assert.equal("confidence" in first.decisions[0], false);
  assert.equal("monetaryValue" in first.decisions[0], false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.decisions), true);
  assert.equal(Object.isFrozen(first.decisions[0]), true);
  assert.equal(Object.isFrozen(first.decisions[0].evidenceRefs), true);
});
