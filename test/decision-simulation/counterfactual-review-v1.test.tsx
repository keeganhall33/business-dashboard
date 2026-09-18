import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCounterfactualReviewV1,
  CounterfactualReviewError,
  type CounterfactualReviewInputV1,
  type CounterfactualScenarioInputV1
} from "../../src/lib/decision-simulation/counterfactual-review-v1";

const WINDOW = {
  start: "2026-10-01T00:00:00.000Z",
  end: "2026-10-31T23:59:59.000Z"
};

function scenario(
  overrides: Partial<CounterfactualScenarioInputV1> &
    Pick<CounterfactualScenarioInputV1, "scenarioId" | "scenarioClass">
): CounterfactualScenarioInputV1 {
  return {
    scenarioId: overrides.scenarioId,
    scenarioClass: overrides.scenarioClass,
    label: overrides.label ?? overrides.scenarioId,
    dimensions: overrides.dimensions ?? [
      {
        dimensionRef: "keegan-hours",
        label: "Keegan hours",
        kind: "CAPACITY",
        material: true,
        basis: "OBSERVED",
        truthState: "KNOWN",
        range: { min: 4, max: 8, unit: "hours" },
        qualitativeValue: null,
        window: WINDOW,
        evidenceRefs: [`evidence:${overrides.scenarioId}:hours`]
      }
    ],
    assumptions: overrides.assumptions ?? [],
    resourceDemands: overrides.resourceDemands ?? [],
    reversibility: overrides.reversibility ?? "REVERSIBLE",
    approvalClass: overrides.approvalClass ?? "NONE",
    safeNextStep: overrides.safeNextStep ?? "Prepare the bounded comparison for review."
  };
}

function input(
  scenarios: readonly CounterfactualScenarioInputV1[]
): CounterfactualReviewInputV1 {
  return {
    decisionId: "decision:test",
    evaluatedAt: "2026-09-18T08:25:00.000Z",
    scenarios
  };
}

test("returns comparison-ready only for evidence-compatible material dimensions", () => {
  const result = buildCounterfactualReviewV1(
    input([
      scenario({ scenarioId: "do", scenarioClass: "DO" }),
      scenario({
        scenarioId: "do-not",
        scenarioClass: "DO_NOT",
        dimensions: [
          {
            dimensionRef: "keegan-hours",
            label: "Keegan hours",
            kind: "CAPACITY",
            material: true,
            basis: "OBSERVED",
            truthState: "KNOWN",
            range: { min: 0, max: 0, unit: "hours" },
            qualitativeValue: null,
            window: WINDOW,
            evidenceRefs: ["evidence:do-not:hours"]
          }
        ]
      })
    ])
  );

  assert.equal(result.status, "COMPARISON_READY");
  assert.equal(result.comparisons.length, 1);
  assert.equal(result.comparisons[0]?.comparisonClass, "DIRECT_EVIDENCE");
  assert.equal(result.comparisons[0]?.winnerSelected, false);
  assert.equal(result.comparisons[0]?.causalClaimMade, false);
  assert.equal(result.comparisons[0]?.monetaryValueSynthesized, false);
  assert.equal(result.actionAuthority.scenarioSelectionAuthorized, false);
  assert.equal(result.actionAuthority.externalActionAuthorized, false);
  assert.equal(result.actionAuthority.approvalBypassAuthorized, false);
});

test("preserves caller assumptions but never treats them as decision-grade truth", () => {
  const result = buildCounterfactualReviewV1(
    input([
      scenario({
        scenarioId: "do",
        scenarioClass: "DO",
        dimensions: [
          {
            dimensionRef: "revenue-range",
            label: "Revenue range",
            kind: "MONETARY",
            material: true,
            basis: "ASSUMPTION",
            truthState: "INFERRED",
            range: { min: 10_000, max: 20_000, unit: "USD" },
            qualitativeValue: null,
            window: WINDOW,
            evidenceRefs: ["assumption-source:do"]
          }
        ],
        assumptions: [
          {
            assumptionId: "demand-holds",
            statement: "Demand remains within the caller-supplied planning range.",
            material: true,
            evidenceRefs: []
          }
        ]
      }),
      scenario({
        scenarioId: "do-not",
        scenarioClass: "DO_NOT",
        dimensions: [
          {
            dimensionRef: "revenue-range",
            label: "Revenue range",
            kind: "MONETARY",
            material: true,
            basis: "ASSUMPTION",
            truthState: "INFERRED",
            range: { min: 0, max: 0, unit: "USD" },
            qualitativeValue: null,
            window: WINDOW,
            evidenceRefs: ["assumption-source:do-not"]
          }
        ]
      })
    ])
  );

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.equal(result.comparisons.length, 1);
  assert.equal(result.comparisons[0]?.comparisonClass, "CONDITIONAL_ON_ASSUMPTIONS");
  assert.deepEqual(result.comparisons[0]?.members[0]?.range, {
    min: 10_000,
    max: 20_000,
    unit: "USD"
  });
  assert.equal(result.comparisons[0]?.monetaryValueSynthesized, false);
  assert.ok(
    result.verificationReasons.some((reason) =>
      reason.includes("UNSUPPORTED_MATERIAL_ASSUMPTION")
    )
  );
});

test("fails closed when a material dimension is conflicted", () => {
  const result = buildCounterfactualReviewV1(
    input([
      scenario({
        scenarioId: "do",
        scenarioClass: "DO",
        dimensions: [
          {
            dimensionRef: "capacity",
            label: "Capacity",
            kind: "CAPACITY",
            material: true,
            basis: "OBSERVED",
            truthState: "CONFLICTED",
            range: { min: 10, max: 20, unit: "hours" },
            qualitativeValue: null,
            window: WINDOW,
            evidenceRefs: ["source:a", "source:b"]
          }
        ]
      }),
      scenario({
        scenarioId: "do-not",
        scenarioClass: "DO_NOT",
        dimensions: [
          {
            dimensionRef: "capacity",
            label: "Capacity",
            kind: "CAPACITY",
            material: true,
            basis: "OBSERVED",
            truthState: "KNOWN",
            range: { min: 0, max: 0, unit: "hours" },
            qualitativeValue: null,
            window: WINDOW,
            evidenceRefs: ["source:c"]
          }
        ]
      })
    ])
  );

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.comparisons.length, 0);
  assert.ok(result.blockerReasons.some((reason) => reason.includes("CONFLICTED_EVIDENCE")));
  assert.ok(result.blockerReasons.includes("NO_COMPARABLE_MATERIAL_DIMENSIONS"));
});

test("does not compare mismatched date windows or units", () => {
  const result = buildCounterfactualReviewV1(
    input([
      scenario({ scenarioId: "do", scenarioClass: "DO" }),
      scenario({
        scenarioId: "do-not",
        scenarioClass: "DO_NOT",
        dimensions: [
          {
            dimensionRef: "keegan-hours",
            label: "Keegan hours",
            kind: "CAPACITY",
            material: true,
            basis: "OBSERVED",
            truthState: "KNOWN",
            range: { min: 0, max: 1, unit: "days" },
            qualitativeValue: null,
            window: {
              start: "2026-11-01T00:00:00.000Z",
              end: "2026-11-30T23:59:59.000Z"
            },
            evidenceRefs: ["evidence:other-window"]
          }
        ]
      })
    ])
  );

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.comparisons.length, 0);
  assert.deepEqual(result.missingComparisonDimensions, ["keegan-hours"]);
  assert.ok(
    result.verificationReasons.includes("keegan-hours:INCOMPATIBLE_UNIT_OR_WINDOW")
  );
});

test("requires a DO_NOT counterfactual without inventing one", () => {
  const result = buildCounterfactualReviewV1(
    input([
      scenario({ scenarioId: "do", scenarioClass: "DO" }),
      scenario({ scenarioId: "delay", scenarioClass: "DELAY" })
    ])
  );

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.ok(result.verificationReasons.includes("DO_NOT_COUNTERFACTUAL_MISSING"));
  assert.equal(result.scenarios.some((item) => item.scenarioClass === "DO_NOT"), false);
});

test("unknown, stale, and partial evidence cannot become comparable", () => {
  for (const truthState of ["UNKNOWN", "STALE", "PARTIAL"] as const) {
    const result = buildCounterfactualReviewV1(
      input([
        scenario({
          scenarioId: "do",
          scenarioClass: "DO",
          dimensions: [
            {
              dimensionRef: "timing",
              label: "Timing",
              kind: "TIMING",
              material: true,
              basis: "ASSUMPTION",
              truthState,
              range: { min: 2, max: 4, unit: "weeks" },
              qualitativeValue: null,
              window: WINDOW,
              evidenceRefs: []
            }
          ]
        }),
        scenario({
          scenarioId: "do-not",
          scenarioClass: "DO_NOT",
          dimensions: [
            {
              dimensionRef: "timing",
              label: "Timing",
              kind: "TIMING",
              material: true,
              basis: "OBSERVED",
              truthState: "KNOWN",
              range: { min: 0, max: 0, unit: "weeks" },
              qualitativeValue: null,
              window: WINDOW,
              evidenceRefs: ["evidence:timing"]
            }
          ]
        })
      ])
    );

    assert.equal(result.status, "BLOCKED");
    assert.equal(result.comparisons.length, 0);
    assert.ok(result.verificationReasons.includes("timing:NON_DECISION_GRADE_EVIDENCE"));
  }
});

test("refuses unsupported known/modelled claims and unsupported resource amounts", () => {
  assert.throws(
    () =>
      buildCounterfactualReviewV1(
        input([
          scenario({
            scenarioId: "do",
            scenarioClass: "DO",
            dimensions: [
              {
                dimensionRef: "risk",
                label: "Risk",
                kind: "RISK",
                material: true,
                basis: "MODELLED",
                truthState: "INFERRED",
                range: null,
                qualitativeValue: "Bounded",
                window: null,
                evidenceRefs: []
              }
            ]
          }),
          scenario({ scenarioId: "do-not", scenarioClass: "DO_NOT" })
        ])
      ),
    (error: unknown) =>
      error instanceof CounterfactualReviewError && error.code === "MISSING_EVIDENCE"
  );

  assert.throws(
    () =>
      buildCounterfactualReviewV1(
        input([
          scenario({
            scenarioId: "do",
            scenarioClass: "DO",
            resourceDemands: [
              {
                resourceRef: "cash",
                label: "Cash",
                amount: 5_000,
                unit: "USD",
                truthState: "UNKNOWN",
                evidenceRefs: []
              }
            ]
          }),
          scenario({ scenarioId: "do-not", scenarioClass: "DO_NOT" })
        ])
      ),
    (error: unknown) =>
      error instanceof CounterfactualReviewError &&
      error.code === "UNSUPPORTED_RESOURCE_AMOUNT"
  );
});

test("output is deterministic and immutable", () => {
  const request = input([
    scenario({ scenarioId: "do", scenarioClass: "DO" }),
    scenario({ scenarioId: "do-not", scenarioClass: "DO_NOT" })
  ]);
  const first = buildCounterfactualReviewV1(request);
  const second = buildCounterfactualReviewV1(request);

  assert.equal(first.reviewId, second.reviewId);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.scenarios));
  assert.ok(Object.isFrozen(first.scenarios[0]));
  assert.ok(Object.isFrozen(first.comparisons));
});
