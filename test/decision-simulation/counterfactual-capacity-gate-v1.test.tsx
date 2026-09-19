import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCounterfactualCapacityGateV1,
  type CapacitySnapshotV1
} from "../../src/lib/decision-simulation/counterfactual-capacity-gate-v1";
import {
  buildCounterfactualReviewV1,
  type CounterfactualReviewV1,
  type CounterfactualScenarioInputV1
} from "../../src/lib/decision-simulation/counterfactual-review-v1";

const GENERATED_AT = "2026-09-19T14:00:00.000Z";
const MAX_AGE_MS = 2 * 60 * 60 * 1000;
const WINDOW = {
  start: "2026-09-20T00:00:00.000Z",
  end: "2026-10-20T00:00:00.000Z"
};

function scenario(
  scenarioId: string,
  scenarioClass: "DO" | "DO_NOT",
  resourceAmount: number | null,
  overrides: Partial<CounterfactualScenarioInputV1> = {}
): CounterfactualScenarioInputV1 {
  return {
    scenarioId,
    scenarioClass,
    label: scenarioId,
    dimensions: [
      {
        dimensionRef: "strategic-fit",
        label: "Strategic fit",
        kind: "STRATEGIC_OPTION",
        material: true,
        basis: "OBSERVED",
        truthState: "KNOWN",
        range: null,
        qualitativeValue: scenarioClass === "DO" ? "Proceed" : "Do not proceed",
        window: null,
        evidenceRefs: [`evidence:${scenarioId}:fit`]
      }
    ],
    assumptions: [],
    resourceDemands: resourceAmount === null
      ? []
      : [
          {
            resourceRef: "keegan-hours",
            label: "Keegan hours",
            amount: resourceAmount,
            unit: "hours",
            truthState: "KNOWN",
            evidenceRefs: [`evidence:${scenarioId}:hours`]
          }
        ],
    reversibility: "REVERSIBLE",
    approvalClass: "NONE",
    safeNextStep: "Prepare for review only.",
    ...overrides
  };
}

function review(
  doAmount = 8,
  doNotAmount = 1,
  evaluatedAt = "2026-09-19T13:30:00.000Z"
): CounterfactualReviewV1 {
  return buildCounterfactualReviewV1({
    decisionId: "decision:capacity-test",
    evaluatedAt,
    scenarios: [
      scenario("do", "DO", doAmount),
      scenario("do-not", "DO_NOT", doNotAmount)
    ]
  });
}

function capacity(
  overrides: Partial<CapacitySnapshotV1> = {}
): CapacitySnapshotV1 {
  return {
    snapshotId: "capacity:2026-09-19T13:45Z",
    observedAt: "2026-09-19T13:45:00.000Z",
    truthState: "KNOWN",
    resources: [
      {
        resourceRef: "keegan-hours",
        label: "Keegan hours",
        availableAmount: 10,
        unit: "hours",
        truthState: "KNOWN",
        evidenceRefs: ["evidence:capacity:keegan-hours"],
        sourceRefs: ["source:calendar-capacity"]
      }
    ],
    evidenceRefs: ["evidence:capacity:snapshot"],
    sourceRefs: ["source:capacity-snapshot"],
    ...overrides
  };
}

function compile(
  sourceReview: CounterfactualReviewV1,
  snapshot: CapacitySnapshotV1
) {
  return compileCounterfactualCapacityGateV1({
    review: sourceReview,
    capacitySnapshot: snapshot,
    generatedAt: GENERATED_AT,
    maximumReviewAgeMs: MAX_AGE_MS,
    maximumCapacityAgeMs: MAX_AGE_MS
  });
}

test("marks exact KNOWN same-unit demands feasible without selecting or allocating", () => {
  const result = compile(review(), capacity());

  assert.equal(result.state, "READY_FOR_RESOURCE_COMPARISON");
  assert.deepEqual(result.feasibleScenarioIds, ["do", "do-not"]);
  assert.deepEqual(result.capacityBlockedScenarioIds, []);
  assert.deepEqual(result.verificationScenarioIds, []);
  assert.equal(result.scenarioChecks[0]?.lane, "FEASIBLE_UNDER_KNOWN_CAPACITY");
  assert.equal(result.scenarioChecks[0]?.resourceChecks[0]?.lane, "WITHIN_KNOWN_CAPACITY");
  assert.equal(result.scenarioChecks[0]?.resourceChecks[0]?.arithmeticComparisonOnly, true);
  assert.equal(result.winnerSelected, false);
  assert.equal(result.allocationRecommended, false);
  assert.equal(result.allocationMutationAuthorized, false);
  assert.equal(result.spendAuthorized, false);
  assert.equal(result.pricingChangeAuthorized, false);
  assert.equal(result.experimentLaunchAuthorized, false);
  assert.equal(result.externalActionAuthorized, false);
  assert.equal(result.approvalBypassAuthorized, false);
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.expectedValue, null);
  assert.equal(result.inferredOutcome, null);
});

test("surfaces known capacity exceedance without manufacturing a winner", () => {
  const result = compile(review(12, 1), capacity());

  assert.equal(result.state, "READY_FOR_RESOURCE_COMPARISON");
  assert.deepEqual(result.feasibleScenarioIds, ["do-not"]);
  assert.deepEqual(result.capacityBlockedScenarioIds, ["do"]);
  const blocked = result.scenarioChecks.find((scenarioCheck) => scenarioCheck.scenarioId === "do");
  assert.equal(blocked?.lane, "BLOCKED_BY_KNOWN_CAPACITY");
  assert.equal(blocked?.resourceChecks[0]?.lane, "EXCEEDS_KNOWN_CAPACITY");
  assert.ok(blocked?.resourceChecks[0]?.reasons.includes("KNOWN_CAPACITY_EXCEEDED"));
  assert.equal(result.winnerSelected, false);
  assert.equal(result.allocationRecommended, false);
});

test("blocks when every scenario exceeds known capacity", () => {
  const result = compile(review(12, 11), capacity());

  assert.equal(result.state, "BLOCKED_NO_FEASIBLE_SCENARIO");
  assert.deepEqual(result.feasibleScenarioIds, []);
  assert.deepEqual(result.capacityBlockedScenarioIds, ["do", "do-not"]);
  assert.equal(result.allocationRecommended, false);
});

test("requires KNOWN demand and capacity evidence instead of treating uncertainty as zero", () => {
  const sourceReview = buildCounterfactualReviewV1({
    decisionId: "decision:capacity-test",
    evaluatedAt: "2026-09-19T13:30:00.000Z",
    scenarios: [
      scenario("do", "DO", 8, {
        resourceDemands: [
          {
            resourceRef: "keegan-hours",
            label: "Keegan hours",
            amount: 8,
            unit: "hours",
            truthState: "INFERRED",
            evidenceRefs: ["evidence:do:hours:model"]
          }
        ]
      }),
      scenario("do-not", "DO_NOT", 1)
    ]
  });
  const result = compile(sourceReview, capacity());

  assert.equal(sourceReview.status, "COMPARISON_READY");
  assert.equal(result.state, "VERIFY_CAPACITY");
  assert.deepEqual(result.verificationScenarioIds, ["do"]);
  const check = result.scenarioChecks.find((scenarioCheck) => scenarioCheck.scenarioId === "do");
  assert.equal(check?.lane, "VERIFY_RESOURCE_EVIDENCE");
  assert.ok(check?.resourceChecks[0]?.reasons.includes("DEMAND_TRUTH_NOT_KNOWN"));
  assert.equal(result.feasibleScenarioIds.includes("do"), false);
});

test("fails closed on unknown, stale, future-dated, or provenance-free capacity snapshots", () => {
  const unknown = compile(review(), capacity({ truthState: "UNKNOWN" }));
  assert.equal(unknown.state, "VERIFY_CAPACITY");
  assert.ok(unknown.reasons.includes("CAPACITY_SNAPSHOT_TRUTH_NOT_KNOWN"));
  assert.equal(unknown.scenarioChecks.length, 0);

  const stale = compile(
    review(),
    capacity({ observedAt: "2026-09-19T11:59:59.000Z" })
  );
  assert.equal(stale.state, "VERIFY_CAPACITY");
  assert.ok(stale.reasons.includes("CAPACITY_STALE"));

  const future = compile(
    review(),
    capacity({ observedAt: "2026-09-19T14:00:01.000Z" })
  );
  assert.equal(future.state, "VERIFY_CAPACITY");
  assert.ok(future.reasons.includes("CAPACITY_FUTURE_DATED"));

  const noProvenance = compile(
    review(),
    capacity({ evidenceRefs: [], sourceRefs: [] })
  );
  assert.equal(noProvenance.state, "VERIFY_CAPACITY");
  assert.ok(noProvenance.reasons.includes("CAPACITY_SNAPSHOT_PROVENANCE_REQUIRED"));
});

test("fails closed on mismatched units and does not coerce them", () => {
  const snapshot = capacity({
    resources: [
      {
        resourceRef: "keegan-hours",
        label: "Keegan hours",
        availableAmount: 10,
        unit: "days",
        truthState: "KNOWN",
        evidenceRefs: ["evidence:capacity:keegan-hours"],
        sourceRefs: ["source:calendar-capacity"]
      }
    ]
  });
  const result = compile(review(), snapshot);

  assert.equal(result.state, "VERIFY_CAPACITY");
  assert.deepEqual(result.feasibleScenarioIds, []);
  assert.deepEqual(result.verificationScenarioIds, ["do", "do-not"]);
  assert.ok(
    result.scenarioChecks.every((scenarioCheck) =>
      scenarioCheck.resourceChecks[0]?.reasons.includes("RESOURCE_UNIT_MISMATCH")
    )
  );
});

test("does not reuse a stale or non-comparison-ready counterfactual review", () => {
  const stale = compile(review(8, 1, "2026-09-19T11:59:59.000Z"), capacity());
  assert.equal(stale.state, "VERIFY_COUNTERFACTUAL");
  assert.ok(stale.reasons.includes("COUNTERFACTUAL_STALE"));
  assert.equal(stale.scenarioChecks.length, 0);

  const verificationReview = buildCounterfactualReviewV1({
    decisionId: "decision:capacity-test",
    evaluatedAt: "2026-09-19T13:30:00.000Z",
    scenarios: [
      scenario("do", "DO", 8, { reversibility: "UNKNOWN" }),
      scenario("do-not", "DO_NOT", 1)
    ]
  });
  assert.equal(verificationReview.status, "VERIFY_REQUIRED");
  const notReady = compile(verificationReview, capacity());
  assert.equal(notReady.state, "VERIFY_COUNTERFACTUAL");
  assert.ok(notReady.reasons.includes("COUNTERFACTUAL_NOT_COMPARISON_READY"));
  assert.equal(notReady.scenarioChecks.length, 0);
});

test("returns NO_RESOURCE_SCOPE when counterfactuals record no resource demand", () => {
  const sourceReview = buildCounterfactualReviewV1({
    decisionId: "decision:no-resource-scope",
    evaluatedAt: "2026-09-19T13:30:00.000Z",
    scenarios: [
      scenario("do", "DO", null),
      scenario("do-not", "DO_NOT", null)
    ]
  });
  const result = compile(sourceReview, capacity());

  assert.equal(result.state, "NO_RESOURCE_SCOPE");
  assert.equal(result.scenarioChecks.length, 2);
  assert.ok(
    result.scenarioChecks.every((scenarioCheck) =>
      scenarioCheck.lane === "NO_RECORDED_RESOURCE_DEMANDS"
    )
  );
  assert.deepEqual(result.feasibleScenarioIds, []);
  assert.equal(result.allocationRecommended, false);
});

test("is deterministic, deeply frozen, and never freezes caller inputs", () => {
  const sourceReview = review();
  const snapshot = capacity();
  const beforeSnapshot = JSON.stringify(snapshot);

  const first = compile(sourceReview, snapshot);
  const second = compile(sourceReview, snapshot);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(snapshot), beforeSnapshot);
  assert.equal(Object.isFrozen(snapshot), false);
  assert.equal(Object.isFrozen(snapshot.resources), false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.scenarioChecks), true);
  assert.equal(Object.isFrozen(first.scenarioChecks[0]), true);
  assert.equal(Object.isFrozen(first.scenarioChecks[0]?.resourceChecks[0]), true);
});
