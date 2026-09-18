import assert from "node:assert/strict";
import test from "node:test";

import {
  compileRelationshipSignalDeltasV1,
  type CanonicalRelationshipSnapshotV1,
  type RelationshipSignalDeltaResultV1,
  type RelationshipSignalV1
} from "../../src/lib/relationship-intelligence/relationship-signal-delta-v1";
import {
  compileRelationshipSignalRefreshPlanV1,
  type RelationshipSignalRefreshPlanResultV1
} from "../../src/lib/relationship-intelligence/relationship-signal-refresh-plan-v1";

const PROJECTION_NOW = "2026-09-18T09:00:00.000Z";
const EVALUATED_AT = "2026-09-18T09:15:00.000Z";

function signal(overrides: Partial<RelationshipSignalV1> = {}): RelationshipSignalV1 {
  return {
    signalId: "signal-1",
    sourceEventKey: "story-1",
    sourceRef: "official:story-1",
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
    lastVerifiedAt: "2026-09-17T12:00:00.000Z",
    ...overrides
  };
}

function projection(
  signals: readonly RelationshipSignalV1[],
  currentRelationships: readonly CanonicalRelationshipSnapshotV1[] = []
): RelationshipSignalDeltaResultV1 {
  return compileRelationshipSignalDeltasV1({
    signals,
    currentRelationships,
    now: PROJECTION_NOW,
    maximumSignalAgeDays: 30,
    maximumCurrentRelationshipAgeDays: 180
  });
}

function plan(
  sourceProjection: RelationshipSignalDeltaResultV1,
  overrides: Partial<Parameters<typeof compileRelationshipSignalRefreshPlanV1>[0]> = {}
): RelationshipSignalRefreshPlanResultV1 {
  return compileRelationshipSignalRefreshPlanV1({
    projection: sourceProjection,
    evaluatedAt: EVALUATED_AT,
    maximumProjectionAgeMinutes: 60,
    ...overrides
  });
}

test("turns an exact known sponsorship delta into sponsor-map and graph refresh work only", () => {
  const result = plan(projection([signal()]));

  assert.equal(result.status, "READY");
  assert.deepEqual(result.tasks.map((task) => task.taskType), [
    "SPONSOR_MAP_REFRESH",
    "RELATIONSHIP_GRAPH_REVIEW"
  ]);
  assert.equal(result.counts.sponsorMapRefreshes, 1);
  assert.equal(result.counts.relationshipGraphReviews, 1);
  assert.equal(result.tasks[0].subjectEntityRef, "org:sponsor");
  assert.equal(result.tasks[0].objectEntityRef, "org:property");
  assert.deepEqual(result.tasks[0].evidenceRefs, ["evidence:story-1"]);
  assert.equal(result.tasks[0].factCreationAuthorized, false);
  assert.equal(result.tasks[0].opportunityCreationAuthorized, false);
  assert.equal(result.authority.relationshipMutationAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
  assert.equal("planningWindow" in result.tasks[0], false);
  assert.equal("confidence" in result.tasks[0], false);
});

test("routes an exact employment role-change delta to role evidence, access-path, and graph revalidation without assuming authority", () => {
  const result = plan(projection([signal({
    signalType: "EXECUTIVE_ROLE_CHANGE",
    relationshipKind: "EMPLOYED_BY",
    subjectEntityRef: "person:executive",
    objectEntityRef: "org:brand"
  })]));

  assert.deepEqual(result.tasks.map((task) => task.taskType), [
    "ROLE_EVIDENCE_REFRESH",
    "ACCESS_PATH_REVALIDATION",
    "RELATIONSHIP_GRAPH_REVIEW"
  ]);
  assert.equal(result.counts.roleEvidenceRefreshes, 1);
  assert.equal(result.counts.accessPathRevalidations, 1);
  for (const task of result.tasks) {
    assert.equal(task.decisionAuthorityInferenceAuthorized, false);
    assert.equal(task.contactDiscoveryAuthorized, false);
  }
});

test("revalidates access and graph evidence after an exact representation change", () => {
  const result = plan(projection([signal({
    signalType: "REPRESENTATION_CHANGE",
    relationshipKind: "REPRESENTS",
    subjectEntityRef: "org:agency",
    objectEntityRef: "person:talent"
  })]));

  assert.deepEqual(result.tasks.map((task) => task.taskType), [
    "ACCESS_PATH_REVALIDATION",
    "RELATIONSHIP_GRAPH_REVIEW"
  ]);
  assert.equal(result.counts.accessPathRevalidations, 1);
});

test("uses graph review only for a material relationship delta whose semantics do not justify a specialized refresh", () => {
  const result = plan(projection([signal({
    signalType: "PARTNERSHIP_ANNOUNCEMENT",
    relationshipKind: "PARTNER_OF"
  })]));

  assert.deepEqual(result.tasks.map((task) => task.taskType), ["RELATIONSHIP_GRAPH_REVIEW"]);
  assert.equal(result.counts.sponsorMapRefreshes, 0);
  assert.equal(result.counts.roleEvidenceRefreshes, 0);
  assert.equal(result.counts.accessPathRevalidations, 0);
});

test("keeps upstream verification work as verification instead of laundering it into graph or sponsor-map truth", () => {
  const result = plan(projection([signal({ subjectEntityRef: null })]));

  assert.deepEqual(result.tasks.map((task) => task.taskType), ["VERIFY_SIGNAL_BEFORE_REFRESH"]);
  assert.equal(result.tasks[0].requiresVerification, true);
  assert.deepEqual(result.tasks[0].reasonCodes, ["CANONICAL_ENTITY_RESOLUTION_REQUIRED"]);
  assert.equal(result.counts.verificationTasks, 1);
  assert.equal(result.counts.sponsorMapRefreshes, 0);
  assert.equal(result.counts.relationshipGraphReviews, 0);
});

test("requires semantic agreement before specialized sponsorship refresh work", () => {
  const source = projection([signal({
    signalType: "SPONSORSHIP_RENEWAL",
    relationshipKind: "PARTNER_OF"
  })]);
  const result = plan(source);

  assert.deepEqual(result.tasks.map((task) => task.taskType), ["VERIFY_SIGNAL_BEFORE_REFRESH"]);
  assert.match(result.tasks[0].reasonCodes.join(" "), /SIGNAL_SEMANTICS_OR_EVIDENCE_REQUIRE_VERIFICATION/);
  assert.equal(result.counts.sponsorMapRefreshes, 0);
});

test("does not generate refresh work for exact no-change or suppressed delta decisions", () => {
  const noChange = plan(projection([signal()], [current()]));
  assert.equal(noChange.tasks.length, 0);
  assert.equal(noChange.counts.decisionsWithoutRefreshWork, 1);

  const duplicates = plan(projection([
    signal({ signalId: "signal-a" }),
    signal({ signalId: "signal-b" })
  ]));
  assert.equal(duplicates.counts.decisionsReviewed, 2);
  assert.equal(duplicates.counts.decisionsWithoutRefreshWork, 1);
  assert.equal(duplicates.tasks.length, 2);
});

test("blocks stale and future source projections instead of treating old relationship evidence as current", () => {
  const source = projection([signal()]);

  const stale = plan(source, {
    evaluatedAt: "2026-09-18T10:01:00.000Z",
    maximumProjectionAgeMinutes: 60
  });
  assert.equal(stale.status, "BLOCKED");
  assert.deepEqual(stale.issues, ["SOURCE_PROJECTION_STALE"]);
  assert.equal(stale.tasks.length, 0);

  const future = plan(source, {
    evaluatedAt: "2026-09-18T08:59:00.000Z",
    maximumProjectionAgeMinutes: 60
  });
  assert.equal(future.status, "BLOCKED");
  assert.deepEqual(future.issues, ["SOURCE_PROJECTION_GENERATED_IN_FUTURE"]);
  assert.equal(future.tasks.length, 0);
});

test("blocks a projection whose upstream side-effect or inference guardrails were widened", () => {
  const source = projection([signal()]);
  const tampered = {
    ...source,
    graphMutationPerformed: true,
    opportunityInferencePerformed: true
  } as unknown as RelationshipSignalDeltaResultV1;

  const result = plan(tampered);
  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.issues, [
    "UPSTREAM_GRAPH_MUTATION_NOT_ALLOWED",
    "UPSTREAM_OPPORTUNITY_INFERENCE_NOT_ALLOWED"
  ]);
  assert.equal(result.tasks.length, 0);
});

test("downgrades a forged actionable non-known delta to verification-only work", () => {
  const source = projection([signal()]);
  const forgedDecision = {
    ...source.decisions[0],
    truthState: "PARTIAL" as const
  };
  const forged = {
    ...source,
    decisions: [forgedDecision]
  } as RelationshipSignalDeltaResultV1;

  const result = plan(forged);
  assert.deepEqual(result.tasks.map((task) => task.taskType), ["VERIFY_SIGNAL_BEFORE_REFRESH"]);
  assert.equal(result.tasks[0].requiresVerification, true);
  assert.equal(result.counts.relationshipGraphReviews, 0);
});

test("rejects credential-bearing provenance and future decision evidence", () => {
  const source = projection([signal()]);
  const withSecret = {
    ...source,
    decisions: [{
      ...source.decisions[0],
      sourceRef: "https://example.com/source?access_token=secret-value"
    }]
  } as RelationshipSignalDeltaResultV1;
  assert.throws(() => plan(withSecret), /credential material/);

  const futureDecision = {
    ...source,
    decisions: [{
      ...source.decisions[0],
      observedAt: "2026-09-18T09:30:00.000Z"
    }]
  } as RelationshipSignalDeltaResultV1;
  assert.throws(() => plan(futureDecision), /must not be future-dated/);
});

test("requires an explicit bounded freshness policy", () => {
  const source = projection([signal()]);
  assert.throws(() => plan(source, { maximumProjectionAgeMinutes: 0 }), /between 1 and 10080/);
  assert.throws(() => plan(source, { maximumProjectionAgeMinutes: Number.NaN }), /between 1 and 10080/);
});

test("is deterministic, deeply immutable, and grants no relationship, contact, opportunity, timing, or external-action authority", () => {
  const source = projection([signal()]);
  const first = plan(source);
  const second = plan(source);

  assert.deepEqual(first, second);
  assert.equal(first.inferencePolicy, "EXACT_UPSTREAM_DELTA_ONLY_NO_ENTITY_ROLE_TIMING_OR_OPPORTUNITY_INFERENCE");
  assert.equal(first.authority.relationshipMutationAuthorized, false);
  assert.equal(first.authority.crmMutationAuthorized, false);
  assert.equal(first.authority.decisionAuthorityInferenceAuthorized, false);
  assert.equal(first.authority.contactDiscoveryAuthorized, false);
  assert.equal(first.authority.opportunityCreationAuthorized, false);
  assert.equal(first.authority.outreachAuthorized, false);
  assert.equal(first.authority.externalActionAuthorized, false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.tasks), true);
  assert.equal(Object.isFrozen(first.tasks[0]), true);
  assert.equal(Object.isFrozen(first.tasks[0].evidenceRefs), true);
  assert.equal(Object.isFrozen(first.authority), true);
});
