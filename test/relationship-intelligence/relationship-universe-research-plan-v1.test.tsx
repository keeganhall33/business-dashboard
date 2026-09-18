import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRelationshipUniverseCoverageV1,
  type RelationshipUniverseTargetV1
} from "../../src/lib/relationship-intelligence/relationship-universe-coverage-v1";
import {
  buildRelationshipUniverseResearchPlanV1,
  type RelationshipUniverseResearchPlanInputV1
} from "../../src/lib/relationship-intelligence/relationship-universe-research-plan-v1";

const NOW = "2026-09-18T20:00:00.000Z";

function known(evidenceRefs: readonly string[] = ["evidence:known"]) {
  return { state: "KNOWN" as const, evidenceRefs };
}

function unknown() {
  return { state: "UNKNOWN" as const, evidenceRefs: [] };
}

function target(overrides: Partial<RelationshipUniverseTargetV1> = {}): RelationshipUniverseTargetV1 {
  return {
    targetId: "college:uw-football",
    canonicalEntityRef: "org:uw-athletics",
    domain: "COLLEGE_ATHLETICS",
    priorityTier: "TIER_1",
    observedAt: "2026-09-18T19:30:00.000Z",
    evidenceRefs: ["evidence:target"],
    requiredDimensions: ["DECISION_AUTHORITY", "ACCESS_PATH", "PLANNING_WINDOW"],
    dimensions: {
      DECISION_AUTHORITY: unknown(),
      ACCESS_PATH: unknown(),
      PLANNING_WINDOW: known(["evidence:planning-window"])
    },
    ...overrides
  };
}

function coverage(targets: readonly RelationshipUniverseTargetV1[] = [target()]) {
  return buildRelationshipUniverseCoverageV1({ targets, now: NOW, maximumEvidenceAgeDays: 30 });
}

function build(overrides: Partial<RelationshipUniverseResearchPlanInputV1> = {}) {
  return buildRelationshipUniverseResearchPlanV1({
    coverage: coverage(),
    evaluatedAt: "2026-09-18T20:05:00.000Z",
    maximumProjectionAgeMinutes: 30,
    ...overrides
  });
}

test("turns canonical coverage gaps into bounded evidence-acquisition tasks without inventing facts", () => {
  const result = build();

  assert.equal(result.status, "READY");
  assert.deepEqual(
    result.tasks.map((task) => [task.dimension, task.workType, task.evidenceNeed]),
    [
      ["DECISION_AUTHORITY", "RESEARCH_MISSING_FACT", "CURRENT_DECISION_AUTHORITY"],
      ["ACCESS_PATH", "RESEARCH_MISSING_FACT", "SUPPORTED_ACCESS_PATH"]
    ]
  );

  const authority = result.tasks[0];
  assert.deepEqual(authority.allowedSourceClasses, ["AUTHORIZED_FIRST_PARTY", "OFFICIAL_ORGANIZATION_SOURCE"]);
  assert.equal(authority.canonicalEntityRef, "org:uw-athletics");
  assert.deepEqual(authority.evidenceRefs, ["evidence:target"]);
  assert.equal(authority.factCreationAuthorized, false);
  assert.equal(authority.decisionAuthorityInferenceAuthorized, false);
  assert.equal(authority.opportunityImpact, "NOT_ESTABLISHED");

  const access = result.tasks[1];
  assert.deepEqual(access.allowedSourceClasses, ["CANONICAL_RELATIONSHIP_GRAPH", "AUTHORIZED_FIRST_PARTY"]);
  assert.equal(access.relationshipInferenceAuthorized, false);
  assert.equal(result.authority.externalResearchAuthorized, false);
  assert.equal(result.authority.contactDiscoveryAuthorized, false);
  assert.equal(result.authority.outreachAuthorized, false);
});

test("preserves verification work rather than silently converting uncertain evidence into a known fact", () => {
  const result = build({
    coverage: coverage([
      target({
        dimensions: {
          DECISION_AUTHORITY: { state: "INFERRED", evidenceRefs: ["evidence:inferred-authority"] },
          ACCESS_PATH: known(["evidence:graph-path"]),
          PLANNING_WINDOW: known(["evidence:planning-window"])
        }
      })
    ])
  });

  assert.equal(result.status, "READY");
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].dimension, "DECISION_AUTHORITY");
  assert.equal(result.tasks[0].workType, "VERIFY_EXISTING_FACT");
  assert.equal(result.tasks[0].factCreationAuthorized, false);
});

test("uses public official contact routes only for professional-contact evidence and never authorizes private discovery", () => {
  const result = build({
    coverage: coverage([
      target({
        domain: "BRAND_CORPORATE",
        targetId: "brand:partner",
        canonicalEntityRef: "org:brand-partner",
        requiredDimensions: ["PROFESSIONAL_CONTACT_ROUTE"],
        dimensions: { PROFESSIONAL_CONTACT_ROUTE: unknown() }
      })
    ])
  });

  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].evidenceNeed, "PUBLIC_OR_AUTHORIZED_PROFESSIONAL_CONTACT_ROUTE");
  assert.deepEqual(result.tasks[0].allowedSourceClasses, ["PUBLIC_OFFICIAL_CONTACT_ROUTE", "AUTHORIZED_FIRST_PARTY"]);
  assert.equal(result.tasks[0].privateContactDiscoveryAuthorized, false);
});

test("fails closed when the upstream coverage projection is stale or future-dated", () => {
  const stale = build({ evaluatedAt: "2026-09-18T21:00:01.000Z", maximumProjectionAgeMinutes: 60 });
  assert.equal(stale.status, "BLOCKED");
  assert.ok(stale.issues.includes("COVERAGE_PROJECTION_STALE"));
  assert.deepEqual(stale.tasks, []);

  const futureCoverage = {
    ...coverage(),
    generatedAt: "2026-09-18T21:00:00.000Z"
  };
  const future = build({ coverage: futureCoverage, evaluatedAt: "2026-09-18T20:05:00.000Z" });
  assert.equal(future.status, "BLOCKED");
  assert.ok(future.issues.includes("COVERAGE_GENERATED_IN_FUTURE"));
});

test("fails closed when a priority does not match the canonical target gap or work type", () => {
  const base = coverage();
  const wrongWorkType = {
    ...base,
    researchPriorities: base.researchPriorities.map((priority, index) =>
      index === 0 ? { ...priority, workType: "VERIFY_EXISTING_FACT" as const } : priority
    )
  };
  const mismatch = build({ coverage: wrongWorkType });
  assert.equal(mismatch.status, "BLOCKED");
  assert.ok(mismatch.issues.some((issue) => issue.startsWith("PRIORITY_WORK_TYPE_MISMATCH:")));

  const missingTarget = {
    ...base,
    researchPriorities: [{ ...base.researchPriorities[0], targetId: "missing:target" }]
  };
  const missing = build({ coverage: missingTarget });
  assert.equal(missing.status, "BLOCKED");
  assert.ok(missing.issues.includes("PRIORITY_TARGET_NOT_FOUND:missing:target"));
});

test("fails closed when a research priority points at a target without a canonical entity anchor", () => {
  const base = coverage();
  const forged = {
    ...base,
    targets: base.targets.map((item) => ({ ...item, canonicalEntityRef: null }))
  };
  const result = build({ coverage: forged });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("PRIORITY_TARGET_HAS_NO_CANONICAL_ENTITY:college:uw-football"));
  assert.deepEqual(result.tasks, []);
});

test("returns NO_GAPS for complete canonical coverage and does not manufacture research work", () => {
  const result = build({
    coverage: coverage([
      target({
        dimensions: {
          DECISION_AUTHORITY: known(["evidence:authority"]),
          ACCESS_PATH: known(["evidence:access"]),
          PLANNING_WINDOW: known(["evidence:planning-window"])
        }
      })
    ])
  });

  assert.equal(result.status, "NO_GAPS");
  assert.deepEqual(result.tasks, []);
  assert.equal(result.omittedTaskCount, 0);
});

test("preserves upstream priority order, respects a bounded task cap, and reports omitted work", () => {
  const result = build({ maximumTasks: 1 });

  assert.equal(result.status, "READY");
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].dimension, "DECISION_AUTHORITY");
  assert.equal(result.tasks[0].upstreamOrdinal, 0);
  assert.equal(result.omittedTaskCount, 1);
  assert.equal(result.orderingPolicy, "PRESERVE_UPSTREAM_RESEARCH_PRIORITY_ORDER");
});

test("requires an explicit freshness limit and rejects invalid task bounds", () => {
  assert.throws(
    () =>
      buildRelationshipUniverseResearchPlanV1({
        coverage: coverage(),
        evaluatedAt: "2026-09-18T20:05:00.000Z",
        maximumProjectionAgeMinutes: 0
      }),
    /maximumProjectionAgeMinutes/
  );
  assert.throws(() => build({ maximumTasks: 0 }), /maximumTasks/);
  assert.throws(() => build({ maximumTasks: 501 }), /maximumTasks/);
});

test("is deterministic, deeply immutable, and grants zero execution authority", () => {
  const first = build();
  const second = build();

  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.tasks));
  assert.ok(Object.isFrozen(first.tasks[0]));
  assert.ok(Object.isFrozen(first.tasks[0].allowedSourceClasses));
  assert.equal(first.authority.crmMutationAuthorized, false);
  assert.equal(first.authority.externalActionAuthorized, false);
  assert.ok(first.limitations.some((limitation) => limitation.includes("Titles alone do not establish budget or decision authority")));
});
