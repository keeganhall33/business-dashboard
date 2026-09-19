import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRelationshipUniverseCoverageV1,
  type RelationshipUniverseTargetV1
} from "../../src/lib/relationship-intelligence/relationship-universe-coverage-v1";
import {
  buildRelationshipUniverseResearchPlanV1,
  type RelationshipUniverseResearchPlanResultV1
} from "../../src/lib/relationship-intelligence/relationship-universe-research-plan-v1";
import {
  buildRelationshipResearchEvidenceHandoffV1,
  type RelationshipResearchEvidenceHandoffResultV1,
  type RelationshipResearchEvidenceObservationV1
} from "../../src/lib/relationship-intelligence/relationship-research-evidence-handoff-v1";
import {
  buildRelationshipResearchReviewQueueV1,
  type RelationshipResearchReviewQueueInputV1
} from "../../src/lib/relationship-intelligence/relationship-research-review-queue-v1";

const COVERAGE_NOW = "2026-09-19T01:00:00.000Z";
const HANDOFF_AT = "2026-09-19T01:10:00.000Z";
const QUEUE_AT = "2026-09-19T01:15:00.000Z";

function target(): RelationshipUniverseTargetV1 {
  return {
    targetId: "brand:priority-partner",
    canonicalEntityRef: "org:priority-partner",
    domain: "BRAND_PARTNERSHIP",
    priorityTier: "TIER_1",
    observedAt: "2026-09-19T00:50:00.000Z",
    evidenceRefs: ["evidence:target"],
    requiredDimensions: ["DECISION_AUTHORITY", "ACCESS_PATH", "PROFESSIONAL_CONTACT_ROUTE"],
    dimensions: {
      DECISION_AUTHORITY: { state: "UNKNOWN", evidenceRefs: [] },
      ACCESS_PATH: { state: "UNKNOWN", evidenceRefs: [] },
      PROFESSIONAL_CONTACT_ROUTE: { state: "UNKNOWN", evidenceRefs: [] }
    }
  };
}

function plan(): RelationshipUniverseResearchPlanResultV1 {
  const coverage = buildRelationshipUniverseCoverageV1({
    targets: [target()],
    now: COVERAGE_NOW,
    maximumEvidenceAgeDays: 30
  });
  return buildRelationshipUniverseResearchPlanV1({
    coverage,
    evaluatedAt: "2026-09-19T01:05:00.000Z",
    maximumProjectionAgeMinutes: 30
  });
}

function taskFor(
  sourcePlan: RelationshipUniverseResearchPlanResultV1,
  dimension: RelationshipUniverseTargetV1["requiredDimensions"][number]
) {
  const task = sourcePlan.tasks.find((item) => item.dimension === dimension);
  assert.ok(task, `expected ${dimension} task`);
  return task;
}

function observation(
  sourcePlan: RelationshipUniverseResearchPlanResultV1,
  dimension: RelationshipUniverseTargetV1["requiredDimensions"][number],
  overrides: Partial<RelationshipResearchEvidenceObservationV1> = {}
): RelationshipResearchEvidenceObservationV1 {
  const task = taskFor(sourcePlan, dimension);
  return {
    observationId: `observation:${dimension.toLowerCase()}`,
    taskId: task.taskId,
    targetId: task.targetId,
    canonicalEntityRef: task.canonicalEntityRef,
    dimension: task.dimension,
    evidenceNeed: task.evidenceNeed,
    sourceClass: task.allowedSourceClasses[0],
    observedAt: "2026-09-19T01:08:00.000Z",
    truthState: "KNOWN",
    claimRef: `claim:${dimension.toLowerCase()}`,
    evidenceRefs: [`evidence:${dimension.toLowerCase()}`],
    ...overrides
  };
}

function handoff(
  observations?: readonly RelationshipResearchEvidenceObservationV1[]
): RelationshipResearchEvidenceHandoffResultV1 {
  const sourcePlan = plan();
  return buildRelationshipResearchEvidenceHandoffV1({
    plan: sourcePlan,
    observations: observations ?? [observation(sourcePlan, "DECISION_AUTHORITY")],
    evaluatedAt: HANDOFF_AT,
    maximumPlanAgeMinutes: 30,
    maximumObservationAgeMinutes: 60
  });
}

function build(
  sourceHandoff: RelationshipResearchEvidenceHandoffResultV1,
  overrides: Partial<RelationshipResearchReviewQueueInputV1> = {}
) {
  return buildRelationshipResearchReviewQueueV1({
    handoff: sourceHandoff,
    evaluatedAt: QUEUE_AT,
    maximumHandoffAgeMinutes: 30,
    ...overrides
  });
}

test("routes governed research evidence into canonical review verify and continue-research lanes without promotion", () => {
  const sourcePlan = plan();
  const sourceHandoff = buildRelationshipResearchEvidenceHandoffV1({
    plan: sourcePlan,
    observations: [
      observation(sourcePlan, "DECISION_AUTHORITY", {
        observationId: "observation:known",
        truthState: "KNOWN"
      }),
      observation(sourcePlan, "ACCESS_PATH", {
        observationId: "observation:inferred",
        truthState: "INFERRED"
      }),
      observation(sourcePlan, "PROFESSIONAL_CONTACT_ROUTE", {
        observationId: "observation:unknown",
        truthState: "UNKNOWN"
      })
    ],
    evaluatedAt: HANDOFF_AT,
    maximumPlanAgeMinutes: 30,
    maximumObservationAgeMinutes: 60
  });

  const result = build(sourceHandoff);

  assert.equal(result.status, "READY");
  assert.deepEqual(result.counts, {
    reviewed: 3,
    canonicalReview: 1,
    verifyEvidence: 1,
    continueResearch: 1
  });
  assert.deepEqual(result.items.map((item) => item.lane), [
    "CANONICAL_REVIEW",
    "VERIFY_EVIDENCE",
    "CONTINUE_RESEARCH"
  ]);
  assert.equal(result.items[0].truthState, "KNOWN");
  assert.equal(result.items[1].truthState, "INFERRED");
  assert.equal(result.items[2].truthState, "UNKNOWN");
});

test("preserves opaque evidence lineage while keeping all consequential authority closed", () => {
  const result = build(handoff());
  const item = result.items[0];

  assert.equal(item.claimRef, "claim:decision_authority");
  assert.deepEqual(item.evidenceRefs, ["evidence:decision_authority"]);
  assert.equal(item.canonicalFactPromotionAuthorized, false);
  assert.equal(item.relationshipGraphMutationAuthorized, false);
  assert.equal(item.crmMutationAuthorized, false);
  assert.equal(item.opportunityMutationAuthorized, false);
  assert.equal(item.outreachAuthorized, false);
  assert.equal(item.externalActionAuthorized, false);
  assert.equal(result.authority.contactDiscoveryAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
  assert.equal("confidence" in item, false);
  assert.equal("monetaryValue" in item, false);
  assert.ok(result.limitations.some((line) => line.includes("not fact promotion or confidence")));
});

test("returns EMPTY for a truthful no-observations handoff instead of manufacturing review work", () => {
  const sourcePlan = plan();
  const emptyHandoff = buildRelationshipResearchEvidenceHandoffV1({
    plan: sourcePlan,
    observations: [],
    evaluatedAt: HANDOFF_AT,
    maximumPlanAgeMinutes: 30,
    maximumObservationAgeMinutes: 60
  });

  const result = build(emptyHandoff);
  assert.equal(result.status, "EMPTY");
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.counts, {
    reviewed: 0,
    canonicalReview: 0,
    verifyEvidence: 0,
    continueResearch: 0
  });
});

test("fails closed on stale future or authority-widened source handoffs", () => {
  const source = handoff();

  const stale = build(source, {
    evaluatedAt: "2026-09-19T03:00:00.000Z",
    maximumHandoffAgeMinutes: 30
  });
  assert.equal(stale.status, "BLOCKED");
  assert.ok(stale.issues.includes("SOURCE_HANDOFF_STALE"));

  const future = {
    ...source,
    generatedAt: "2026-09-19T01:20:00.000Z"
  } as RelationshipResearchEvidenceHandoffResultV1;
  const futureResult = build(future);
  assert.equal(futureResult.status, "BLOCKED");
  assert.ok(futureResult.issues.includes("SOURCE_HANDOFF_GENERATED_IN_FUTURE"));

  const widened = {
    ...source,
    authority: { ...source.authority, canonicalFactPromotionAuthorized: true as never }
  } as RelationshipResearchEvidenceHandoffResultV1;
  const widenedResult = build(widened);
  assert.equal(widenedResult.status, "BLOCKED");
  assert.ok(widenedResult.issues.includes("SOURCE_HANDOFF_FACT_PROMOTION_AUTHORITY_WIDENED"));
});

test("rejects a forged canonical-review candidate whose truth is not KNOWN", () => {
  const source = handoff();
  const forged = {
    ...source,
    candidates: [
      { ...source.candidates[0], truthState: "INFERRED" as const }
    ]
  } as RelationshipResearchEvidenceHandoffResultV1;

  const result = build(forged);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("CANONICAL_REVIEW_REQUIRES_KNOWN_TRUTH"));
  assert.deepEqual(result.items, []);
});

test("rejects duplicate observation identity even when forged source counts are internally consistent", () => {
  const source = handoff();
  const duplicated = {
    ...source,
    candidates: [source.candidates[0], { ...source.candidates[0] }],
    counts: {
      observationsReviewed: 2,
      readyForCanonicalReview: 2,
      verificationRequired: 0,
      researchRequired: 0
    }
  } as RelationshipResearchEvidenceHandoffResultV1;

  const result = build(duplicated);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("SOURCE_HANDOFF_DUPLICATE_OBSERVATION_ID"));
});

test("rejects source count drift before queueing evidence", () => {
  const source = handoff();
  const drifted = {
    ...source,
    counts: { ...source.counts, readyForCanonicalReview: 0 }
  } as RelationshipResearchEvidenceHandoffResultV1;

  const result = build(drifted);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("SOURCE_HANDOFF_COUNT_MISMATCH"));
});

test("rejects raw contact coordinates or credential material injected into opaque provenance", () => {
  const source = handoff();
  const rawContact = {
    ...source,
    candidates: [{ ...source.candidates[0], claimRef: "mailto:buyer@example.com" }]
  } as RelationshipResearchEvidenceHandoffResultV1;
  const contactResult = build(rawContact);
  assert.equal(contactResult.status, "BLOCKED");
  assert.ok(contactResult.issues.includes("CANDIDATE_UNSAFE_OR_INVALID_PROVENANCE"));

  const credential = {
    ...source,
    candidates: [{ ...source.candidates[0], evidenceRefs: ["https://source.test/x?access_token=secret"] }]
  } as RelationshipResearchEvidenceHandoffResultV1;
  const credentialResult = build(credential);
  assert.equal(credentialResult.status, "BLOCKED");
  assert.ok(credentialResult.issues.includes("CANDIDATE_UNSAFE_OR_INVALID_PROVENANCE"));
});

test("is deterministic deeply immutable and does not mutate the caller handoff", () => {
  const source = handoff();
  const original = structuredClone(source);
  const first = build(source);
  const second = build(source);

  assert.deepEqual(first, second);
  assert.deepEqual(source, original);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.items));
  assert.ok(Object.isFrozen(first.items[0]));
  assert.ok(Object.isFrozen(first.items[0].evidenceRefs));
  assert.ok(Object.isFrozen(first.authority));
});
