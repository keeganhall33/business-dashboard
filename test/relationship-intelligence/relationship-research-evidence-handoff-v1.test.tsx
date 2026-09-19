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
  type RelationshipResearchEvidenceHandoffInputV1,
  type RelationshipResearchEvidenceObservationV1
} from "../../src/lib/relationship-intelligence/relationship-research-evidence-handoff-v1";

const NOW = "2026-09-19T00:00:00.000Z";
const EVALUATED_AT = "2026-09-19T00:10:00.000Z";

function target(overrides: Partial<RelationshipUniverseTargetV1> = {}): RelationshipUniverseTargetV1 {
  return {
    targetId: "college:priority-program",
    canonicalEntityRef: "org:priority-program",
    domain: "COLLEGE_ATHLETICS",
    priorityTier: "TIER_1",
    observedAt: "2026-09-18T23:50:00.000Z",
    evidenceRefs: ["evidence:target"],
    requiredDimensions: ["DECISION_AUTHORITY", "ACCESS_PATH", "PROFESSIONAL_CONTACT_ROUTE"],
    dimensions: {
      DECISION_AUTHORITY: { state: "UNKNOWN", evidenceRefs: [] },
      ACCESS_PATH: { state: "UNKNOWN", evidenceRefs: [] },
      PROFESSIONAL_CONTACT_ROUTE: { state: "UNKNOWN", evidenceRefs: [] }
    },
    ...overrides
  };
}

function plan(targets: readonly RelationshipUniverseTargetV1[] = [target()]): RelationshipUniverseResearchPlanResultV1 {
  const coverage = buildRelationshipUniverseCoverageV1({
    targets,
    now: NOW,
    maximumEvidenceAgeDays: 30
  });
  return buildRelationshipUniverseResearchPlanV1({
    coverage,
    evaluatedAt: "2026-09-19T00:05:00.000Z",
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
    observationId: `observation:${dimension.toLowerCase()}:1`,
    taskId: task.taskId,
    targetId: task.targetId,
    canonicalEntityRef: task.canonicalEntityRef,
    dimension: task.dimension,
    evidenceNeed: task.evidenceNeed,
    sourceClass: task.allowedSourceClasses[0],
    observedAt: "2026-09-19T00:07:00.000Z",
    truthState: "KNOWN",
    claimRef: `claim:${dimension.toLowerCase()}:1`,
    evidenceRefs: [`evidence:${dimension.toLowerCase()}:1`],
    ...overrides
  };
}

function build(
  sourcePlan: RelationshipUniverseResearchPlanResultV1,
  observations: readonly RelationshipResearchEvidenceObservationV1[],
  overrides: Partial<RelationshipResearchEvidenceHandoffInputV1> = {}
) {
  return buildRelationshipResearchEvidenceHandoffV1({
    plan: sourcePlan,
    observations,
    evaluatedAt: EVALUATED_AT,
    maximumPlanAgeMinutes: 30,
    maximumObservationAgeMinutes: 60,
    ...overrides
  });
}

test("accepts exact current evidence for canonical review without promoting it to fact", () => {
  const sourcePlan = plan();
  const result = build(sourcePlan, [
    observation(sourcePlan, "DECISION_AUTHORITY", { sourceClass: "OFFICIAL_ORGANIZATION_SOURCE" })
  ]);

  assert.equal(result.status, "READY");
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].disposition, "READY_FOR_CANONICAL_REVIEW");
  assert.equal(result.candidates[0].canonicalEntityRef, "org:priority-program");
  assert.equal(result.candidates[0].canonicalFactPromotionAuthorized, false);
  assert.equal(result.candidates[0].decisionAuthorityInferenceAuthorized, false);
  assert.equal(result.candidates[0].opportunityCreationAuthorized, false);
  assert.equal(result.authority.canonicalFactPromotionAuthorized, false);
  assert.equal(result.authority.crmMutationAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("preserves multiple independent observations without converting source count into confidence or certainty", () => {
  const sourcePlan = plan();
  const result = build(sourcePlan, [
    observation(sourcePlan, "DECISION_AUTHORITY", {
      observationId: "observation:authority:official",
      sourceClass: "OFFICIAL_ORGANIZATION_SOURCE",
      claimRef: "claim:authority:official",
      evidenceRefs: ["evidence:authority:official"]
    }),
    observation(sourcePlan, "DECISION_AUTHORITY", {
      observationId: "observation:authority:first-party",
      sourceClass: "AUTHORIZED_FIRST_PARTY",
      claimRef: "claim:authority:first-party",
      evidenceRefs: ["evidence:authority:first-party"]
    })
  ]);

  assert.equal(result.counts.readyForCanonicalReview, 2);
  assert.equal(result.candidates.length, 2);
  assert.ok(result.limitations.some((item) => item.includes("source count never establishes")));
  for (const candidate of result.candidates) {
    assert.equal(candidate.canonicalFactPromotionAuthorized, false);
    assert.equal(candidate.warmAccessInferenceAuthorized, false);
  }
});

test("fails closed when an observation uses a source class that its research task did not authorize", () => {
  const sourcePlan = plan();
  const result = build(sourcePlan, [
    observation(sourcePlan, "ACCESS_PATH", { sourceClass: "PUBLIC_PRIMARY_SOURCE" })
  ]);

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.candidates, []);
  assert.ok(result.issues.some((item) => item.includes("sourceClass is not allowed for ACCESS_PATH")));
});

test("keeps inferred partial conflicted and unknown research results out of canonical-ready state", () => {
  const sourcePlan = plan();
  const result = build(sourcePlan, [
    observation(sourcePlan, "DECISION_AUTHORITY", {
      observationId: "observation:inferred",
      truthState: "INFERRED",
      claimRef: "claim:inferred"
    }),
    observation(sourcePlan, "DECISION_AUTHORITY", {
      observationId: "observation:partial",
      truthState: "PARTIAL",
      claimRef: "claim:partial"
    }),
    observation(sourcePlan, "DECISION_AUTHORITY", {
      observationId: "observation:conflicted",
      truthState: "CONFLICTED",
      claimRef: "claim:conflicted"
    }),
    observation(sourcePlan, "DECISION_AUTHORITY", {
      observationId: "observation:unknown",
      truthState: "UNKNOWN",
      claimRef: "claim:unknown"
    })
  ]);

  assert.equal(result.status, "READY");
  assert.equal(result.counts.readyForCanonicalReview, 0);
  assert.equal(result.counts.verificationRequired, 3);
  assert.equal(result.counts.researchRequired, 1);
  assert.deepEqual(
    result.candidates.map((item) => item.disposition),
    ["VERIFY_REQUIRED", "VERIFY_REQUIRED", "VERIFY_REQUIRED", "RESEARCH_REQUIRED"]
  );
});

test("treats aged evidence as verification work and rejects future observations", () => {
  const sourcePlan = plan();
  const stale = build(
    sourcePlan,
    [observation(sourcePlan, "DECISION_AUTHORITY", { observedAt: "2026-09-18T20:00:00.000Z" })],
    { maximumObservationAgeMinutes: 60 }
  );
  assert.equal(stale.status, "READY");
  assert.equal(stale.candidates[0].disposition, "VERIFY_REQUIRED");
  assert.ok(stale.candidates[0].reasonCodes.includes("OBSERVATION_STALE"));

  const future = build(sourcePlan, [
    observation(sourcePlan, "DECISION_AUTHORITY", { observedAt: "2026-09-19T00:11:00.000Z" })
  ]);
  assert.equal(future.status, "BLOCKED");
  assert.ok(future.issues.some((item) => item.includes("observedAt must not be future-dated")));
});

test("requires an exact task target dimension and evidence-need binding", () => {
  const sourcePlan = plan();
  const wrongTarget = build(sourcePlan, [
    observation(sourcePlan, "DECISION_AUTHORITY", { canonicalEntityRef: "org:similar-name-is-not-identity" })
  ]);
  assert.equal(wrongTarget.status, "BLOCKED");
  assert.ok(wrongTarget.issues.some((item) => item.includes("does not exactly match its source research task")));

  const authorityTask = taskFor(sourcePlan, "DECISION_AUTHORITY");
  const accessTask = taskFor(sourcePlan, "ACCESS_PATH");
  const wrongNeed = build(sourcePlan, [
    observation(sourcePlan, "DECISION_AUTHORITY", {
      taskId: authorityTask.taskId,
      evidenceNeed: accessTask.evidenceNeed
    })
  ]);
  assert.equal(wrongNeed.status, "BLOCKED");
});

test("rejects raw contact coordinates credential material and undeclared payload fields", () => {
  const sourcePlan = plan();
  const rawEmail = build(sourcePlan, [
    observation(sourcePlan, "PROFESSIONAL_CONTACT_ROUTE", {
      claimRef: "mailto:buyer@example.com"
    })
  ]);
  assert.equal(rawEmail.status, "BLOCKED");
  assert.ok(rawEmail.issues.some((item) => item.includes("raw contact coordinates")));

  const secret = build(sourcePlan, [
    observation(sourcePlan, "DECISION_AUTHORITY", {
      evidenceRefs: ["https://example.test/source?access_token=do-not-store"]
    })
  ]);
  assert.equal(secret.status, "BLOCKED");
  assert.ok(secret.issues.some((item) => item.includes("credential material")));

  const extraField = {
    ...observation(sourcePlan, "DECISION_AUTHORITY"),
    rawBody: "private message content"
  } as RelationshipResearchEvidenceObservationV1;
  const extra = build(sourcePlan, [extraField]);
  assert.equal(extra.status, "BLOCKED");
  assert.ok(extra.issues.some((item) => item.includes("unsupported field rawBody")));
});

test("fails closed on stale plans and widened upstream authority", () => {
  const sourcePlan = plan();
  const stalePlan = { ...sourcePlan, generatedAt: "2026-09-18T20:00:00.000Z" };
  const stale = build(stalePlan, [observation(sourcePlan, "DECISION_AUTHORITY")], { maximumPlanAgeMinutes: 30 });
  assert.equal(stale.status, "BLOCKED");
  assert.ok(stale.issues.includes("SOURCE_PLAN_STALE"));

  const widened = {
    ...sourcePlan,
    authority: { ...sourcePlan.authority, contactDiscoveryAuthorized: true as never }
  } as RelationshipUniverseResearchPlanResultV1;
  const unsafe = build(widened, [observation(sourcePlan, "DECISION_AUTHORITY")]);
  assert.equal(unsafe.status, "BLOCKED");
  assert.ok(unsafe.issues.includes("SOURCE_PLAN_CONTACT_DISCOVERY_AUTHORITY_WIDENED"));
});

test("returns NO_OBSERVATIONS rather than manufacturing findings", () => {
  const sourcePlan = plan();
  const result = build(sourcePlan, []);

  assert.equal(result.status, "NO_OBSERVATIONS");
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.counts, {
    observationsReviewed: 0,
    readyForCanonicalReview: 0,
    verificationRequired: 0,
    researchRequired: 0
  });
});

test("is deterministic deeply immutable and preserves caller inputs", () => {
  const sourcePlan = plan();
  const sourceObservation = observation(sourcePlan, "DECISION_AUTHORITY");
  const original = structuredClone(sourceObservation);
  const first = build(sourcePlan, [sourceObservation]);
  const second = build(sourcePlan, [sourceObservation]);

  assert.deepEqual(first, second);
  assert.deepEqual(sourceObservation, original);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.candidates));
  assert.ok(Object.isFrozen(first.candidates[0]));
  assert.ok(Object.isFrozen(first.candidates[0].evidenceRefs));
  assert.ok(Object.isFrozen(first.authority));
});
