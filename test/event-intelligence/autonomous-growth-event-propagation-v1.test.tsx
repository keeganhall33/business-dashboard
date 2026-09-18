import assert from "node:assert/strict";
import test from "node:test";

import type { ExternalEventV1 } from "../../src/lib/external-intelligence/contracts/external-event-v1";
import {
  AutonomousGrowthEventPropagationError,
  propagateAutonomousGrowthEventV1,
  type AutonomousGrowthEventPropagationInputV1,
  type CanonicalAffectedObjectV1,
  type EventInvestigationCandidateV1
} from "../../src/lib/event-intelligence/autonomous-growth-event-propagation-v1";

function event(overrides: Partial<ExternalEventV1> = {}): ExternalEventV1 {
  return {
    schema_version: "external_event_v1",
    event_id: "event-partnership-1",
    event_type: "partnership_formed",
    participants: [
      { role: "brand", entity_ref: { entity_id: "brand-1" } },
      { role: "property", entity_ref: { entity_id: "property-1" } }
    ],
    attributes: [{ key: "scope", value: "documented partnership" }],
    times: {
      announcement_time: "2026-09-17T18:00:00.000Z",
      event_time: "2026-09-17T18:00:00.000Z",
      retrieved_at: "2026-09-17T18:05:00.000Z",
      effective_from: "2026-09-17T18:00:00.000Z",
      effective_until: "2027-09-17T18:00:00.000Z"
    },
    verification_state: "corroborated",
    extraction_confidence: {
      level: "high",
      reasons: ["Direct source and independent corroboration are recorded upstream."]
    },
    policy_version: "external_event_policy_v1",
    ...overrides
  };
}

const objectTypes: CanonicalAffectedObjectV1["objectType"][] = [
  "ENTITY",
  "OPPORTUNITY",
  "CAMPAIGN",
  "DECISION",
  "EXPERIMENT",
  "RECOMMENDATION"
];

function affectedObjects(): CanonicalAffectedObjectV1[] {
  return objectTypes.map((objectType, index) => ({
    objectType,
    canonicalId: `${objectType.toLowerCase()}-${index}`,
    canonicalRef: `${objectType.toLowerCase()}:canonical:${index}`,
    currentVersion: `v${index + 1}`,
    changeClass: objectType === "DECISION" ? "REVIEW" : "REFRESH",
    materialChange: true,
    truthState: "KNOWN",
    evidenceRefs: [`evidence:object:${index}`],
    reasonCode: "MATERIAL_EVENT_LINKED"
  }));
}

function investigations(): EventInvestigationCandidateV1[] {
  return [
    {
      branchId: "rights",
      domain: "RIGHTS",
      question: "Does the verified event change any existing rights constraint?",
      decisionImpact: "HIGH",
      evidenceRefs: ["evidence:rights"],
      rationale: "Rights could block otherwise useful preparation."
    },
    {
      branchId: "timing",
      domain: "TIMING",
      question: "Does the event change the supported planning window?",
      decisionImpact: "HIGH",
      evidenceRefs: ["evidence:timing"],
      rationale: "A changed planning window could alter campaign priority."
    },
    {
      branchId: "access",
      domain: "RELATIONSHIPS",
      question: "Does the event change an evidence-backed access path?",
      decisionImpact: "MEDIUM",
      evidenceRefs: ["evidence:access"],
      rationale: "Access may affect the next safe preparation step."
    },
    {
      branchId: "economics",
      domain: "ECONOMICS",
      question: "Did the event change any supported deal economics?",
      decisionImpact: "LOW",
      evidenceRefs: ["evidence:economics"],
      rationale: "Existing economics should be rechecked only if source evidence changed."
    },
    {
      branchId: "publicity",
      domain: "PUBLICITY",
      question: "Is there a new evidence-backed publicity hook?",
      decisionImpact: "LOW",
      evidenceRefs: [],
      rationale: "This is lower-value than rights, timing, access, and economics."
    }
  ];
}

function input(
  overrides: Partial<AutonomousGrowthEventPropagationInputV1> = {}
): AutonomousGrowthEventPropagationInputV1 {
  return {
    event: event(),
    evaluatedAt: "2026-09-18T06:00:00.000Z",
    sourceAuthority: "PRIMARY",
    freshness: "FRESH",
    materiality: "MATERIAL",
    evidenceRefs: ["evidence:event:primary", "evidence:event:corroboration"],
    affectedObjects: affectedObjects(),
    investigationCandidates: investigations(),
    contradictions: [],
    priorAppliedEventIds: [],
    priorAppliedEventFingerprints: [],
    ...overrides
  };
}

test("projects one material canonical event to each affected existing object exactly once", () => {
  const objects = affectedObjects();
  objects.push({ ...objects[0] });
  const result = propagateAutonomousGrowthEventV1(input({ affectedObjects: objects }));

  assert.equal(result.status, "PROPAGATION_READY");
  assert.equal(result.updateIntents.length, objectTypes.length);
  assert.deepEqual(
    result.updateIntents.map((intent) => intent.objectType),
    ["CAMPAIGN", "DECISION", "ENTITY", "EXPERIMENT", "OPPORTUNITY", "RECOMMENDATION"]
  );
  assert.ok(result.updateIntents.every((intent) => intent.disposition === "PROJECT_CANONICAL_UPDATE"));
  assert.ok(result.updateIntents.every((intent) => intent.lineage.eventId === "event-partnership-1"));
  assert.ok(result.updateIntents.every((intent) => intent.lineage.eventFingerprint === result.eventFingerprint));
});

test("suppresses a replay by canonical event id or semantic event fingerprint", () => {
  const first = propagateAutonomousGrowthEventV1(input());

  const replayById = propagateAutonomousGrowthEventV1(
    input({ priorAppliedEventIds: [first.eventId] })
  );
  assert.equal(replayById.status, "SUPPRESSED_DUPLICATE");
  assert.deepEqual(replayById.updateIntents, []);
  assert.deepEqual(replayById.investigations, []);

  const replayByFingerprint = propagateAutonomousGrowthEventV1(
    input({ priorAppliedEventFingerprints: [first.eventFingerprint] })
  );
  assert.equal(replayByFingerprint.status, "SUPPRESSED_DUPLICATE");
  assert.deepEqual(replayByFingerprint.updateIntents, []);
});

test("stays silent when the event produces no material object change", () => {
  const unchanged = affectedObjects().map((object) => ({ ...object, materialChange: false }));
  const result = propagateAutonomousGrowthEventV1(input({ affectedObjects: unchanged }));

  assert.equal(result.status, "SUPPRESSED_NO_CHANGE");
  assert.deepEqual(result.updateIntents, []);
  assert.deepEqual(result.investigations, []);
  assert.deepEqual(result.suppressionReasons, ["NO_MATERIAL_OBJECT_CHANGE"]);
});

test("fails closed to review-only propagation for stale or weak evidence", () => {
  const stale = propagateAutonomousGrowthEventV1(
    input({ freshness: "STALE", sourceAuthority: "WEAK" })
  );

  assert.equal(stale.status, "REVIEW_REQUIRED");
  assert.ok(stale.reviewReasons.includes("FRESHNESS_STALE"));
  assert.ok(stale.reviewReasons.includes("SOURCE_AUTHORITY_WEAK"));
  assert.ok(stale.updateIntents.every((intent) => intent.disposition === "REVIEW_ONLY"));
  assert.equal(stale.actionAuthority.canonicalPersistenceAuthorized, false);
});

test("preserves contradictions instead of resolving them by recency or confidence", () => {
  const objects = affectedObjects();
  objects[1] = { ...objects[1], truthState: "CONFLICTED" };
  const result = propagateAutonomousGrowthEventV1(
    input({
      affectedObjects: objects,
      contradictions: [
        {
          claimKey: "partner-role",
          supportingEvidenceRefs: ["evidence:direct-a"],
          contradictingEvidenceRefs: ["evidence:direct-b"]
        }
      ]
    })
  );

  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.equal(result.contradictions.length, 1);
  assert.deepEqual(result.contradictions[0].supportingEvidenceRefs, ["evidence:direct-a"]);
  assert.deepEqual(result.contradictions[0].contradictingEvidenceRefs, ["evidence:direct-b"]);
  assert.ok(result.reviewReasons.includes("CONTRADICTION_REQUIRES_REVIEW"));
  assert.ok(result.updateIntents.every((intent) => intent.disposition === "REVIEW_ONLY"));
});

test("selects the smallest bounded investigation set by explicit decision impact", () => {
  const result = propagateAutonomousGrowthEventV1(input());

  assert.equal(result.investigations.length, 4);
  assert.deepEqual(
    result.investigations.map((branch) => branch.branchId),
    ["rights", "timing", "access", "economics"]
  );
  assert.deepEqual(result.investigations.map((branch) => branch.rank), [1, 2, 3, 4]);
});

test("marks expired event semantics for review rather than propagating stale truth", () => {
  const expiredEvent = event({
    times: {
      announcement_time: "2025-01-01T00:00:00.000Z",
      event_time: "2025-01-01T00:00:00.000Z",
      retrieved_at: "2026-09-18T05:00:00.000Z",
      effective_from: "2025-01-01T00:00:00.000Z",
      effective_until: "2026-01-01T00:00:00.000Z"
    }
  });
  const result = propagateAutonomousGrowthEventV1(input({ event: expiredEvent }));

  assert.equal(result.temporalState, "EXPIRED");
  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.ok(result.reviewReasons.includes("EVENT_EFFECTIVE_WINDOW_EXPIRED"));
});

test("suppresses explicitly immaterial events without manufacturing urgency", () => {
  const result = propagateAutonomousGrowthEventV1(input({ materiality: "IMMATERIAL" }));

  assert.equal(result.status, "SUPPRESSED_IMMATERIAL");
  assert.deepEqual(result.updateIntents, []);
  assert.deepEqual(result.investigations, []);
  assert.deepEqual(result.suppressionReasons, ["EVENT_MARKED_IMMATERIAL"]);
});

test("grants no persistence or consequential external action authority", () => {
  const result = propagateAutonomousGrowthEventV1(input());

  assert.deepEqual(result.actionAuthority, {
    analysisOnly: true,
    canonicalPersistenceAuthorized: false,
    externalActionAuthorized: false,
    outreachAuthorized: false,
    spendAuthorized: false,
    publishAuthorized: false
  });
});

test("is deterministic, immutable, bounded, and does not mutate canonical inputs", () => {
  const request = input();
  const before = structuredClone(request);
  const first = propagateAutonomousGrowthEventV1(request);
  const second = propagateAutonomousGrowthEventV1(request);

  assert.deepEqual(request, before);
  assert.deepEqual(first, second);
  assert.equal(first.propagationId, second.propagationId);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.updateIntents));
  assert.ok(Object.isFrozen(first.investigations));
});

test("rejects conflicting duplicate affected-object projections and malformed contradictions", () => {
  const objects = affectedObjects();
  objects.push({ ...objects[0], reasonCode: "DIFFERENT_REASON" });
  assert.throws(
    () => propagateAutonomousGrowthEventV1(input({ affectedObjects: objects })),
    (error: unknown) =>
      error instanceof AutonomousGrowthEventPropagationError &&
      error.code === "CONFLICTING_AFFECTED_OBJECT"
  );

  assert.throws(
    () =>
      propagateAutonomousGrowthEventV1(
        input({
          contradictions: [
            {
              claimKey: "unsupported-conflict",
              supportingEvidenceRefs: [],
              contradictingEvidenceRefs: ["evidence:only-one-side"]
            }
          ]
        })
      ),
    (error: unknown) =>
      error instanceof AutonomousGrowthEventPropagationError &&
      error.code === "INVALID_CONTRADICTION"
  );
});
