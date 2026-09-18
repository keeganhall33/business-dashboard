import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCounterfactualReviewV1,
  type CounterfactualReviewV1,
  type CounterfactualScenarioInputV1
} from "../../src/lib/decision-simulation/counterfactual-review-v1";
import {
  reviewCounterfactualForPortfolioV1
} from "../../src/lib/strategy-engine/counterfactual-portfolio-review-v1";
import {
  buildDecisionPortfolioV1,
  type DecisionApprovalClassV1,
  type DecisionCandidateV1
} from "../../src/lib/strategy-engine/decision-portfolio-v1";

const PORTFOLIO_AT = "2026-09-18T12:00:00.000Z";
const REVIEW_AT = "2026-09-18T12:30:00.000Z";
const CHECKED_AT = "2026-09-18T13:00:00.000Z";
const WINDOW = {
  start: "2026-10-01T00:00:00.000Z",
  end: "2026-10-31T23:59:59.000Z"
};

function candidate(approvalClass: DecisionApprovalClassV1 = "NONE"): DecisionCandidateV1 {
  return {
    id: "decision:test",
    title: "Choose bounded strategic path",
    candidateType: "DECISION",
    owner: "KEEGAN",
    approvalClass,
    evidenceState: "KNOWN",
    evidenceRefs: ["evidence:decision:test"],
    sourceRefs: ["source:decision:test"],
    monetaryCase: null,
    value: {
      strategicFit: 80,
      compoundingAdvantage: 70,
      relationshipAccess: 60,
      futureOptions: 75,
      learningValue: 65,
      urgency: 50,
      reversibility: 80
    },
    risk: { execution: 20, reputation: 10, rights: 10 },
    resources: { keeganHours: 1, ioanaHours: 0, jeevesHours: 1, cashCents: 0 },
    dependencyIds: [],
    conflictKeys: [],
    blockers: [],
    informationGainAction: null,
    safeNextStep: "Review the bounded alternatives.",
    successMetric: "A documented decision with preserved evidence lineage.",
    evaluationWindow: WINDOW
  };
}

function portfolio(options?: {
  approvalClass?: DecisionApprovalClassV1;
  evidenceState?: DecisionCandidateV1["evidenceState"];
  generatedAt?: string;
}) {
  const value = candidate(options?.approvalClass);
  if (options?.evidenceState) value.evidenceState = options.evidenceState;
  return buildDecisionPortfolioV1({
    candidates: [value],
    capacity: {
      keeganHours: 10,
      ioanaHours: 10,
      jeevesHours: 20,
      cashCents: 100_000,
      maxSelected: 3,
      maxKeeganDecisions: 3
    },
    generatedAt: options?.generatedAt ?? PORTFOLIO_AT
  });
}

function scenario(
  scenarioId: string,
  scenarioClass: CounterfactualScenarioInputV1["scenarioClass"],
  overrides?: Partial<CounterfactualScenarioInputV1>
): CounterfactualScenarioInputV1 {
  return {
    scenarioId,
    scenarioClass,
    label: overrides?.label ?? scenarioId,
    dimensions: overrides?.dimensions ?? [
      {
        dimensionRef: "keegan-hours",
        label: "Keegan hours",
        kind: "CAPACITY",
        material: true,
        basis: "OBSERVED",
        truthState: "KNOWN",
        range: scenarioClass === "DO_NOT"
          ? { min: 0, max: 0, unit: "hours" }
          : { min: 4, max: 8, unit: "hours" },
        qualitativeValue: null,
        window: WINDOW,
        evidenceRefs: [`evidence:${scenarioId}:capacity`]
      }
    ],
    assumptions: overrides?.assumptions ?? [],
    resourceDemands: overrides?.resourceDemands ?? [],
    reversibility: overrides?.reversibility ?? "REVERSIBLE",
    approvalClass: overrides?.approvalClass ?? "NONE",
    safeNextStep: overrides?.safeNextStep ?? "Keep this scenario analysis-only."
  };
}

function comparisonReadyReview(options?: {
  approvalClass?: CounterfactualScenarioInputV1["approvalClass"];
  reversibility?: CounterfactualScenarioInputV1["reversibility"];
  evaluatedAt?: string;
}): CounterfactualReviewV1 {
  return buildCounterfactualReviewV1({
    decisionId: "decision:test",
    evaluatedAt: options?.evaluatedAt ?? REVIEW_AT,
    scenarios: [
      scenario("do", "DO", {
        approvalClass: options?.approvalClass,
        reversibility: options?.reversibility
      }),
      scenario("do-not", "DO_NOT")
    ]
  });
}

function run(
  counterfactualReview: CounterfactualReviewV1,
  options?: {
    reviewedAt?: string;
    maximumReviewAgeMs?: number;
    portfolioValue?: ReturnType<typeof portfolio>;
  }
) {
  return reviewCounterfactualForPortfolioV1({
    portfolio: options?.portfolioValue ?? portfolio(),
    counterfactualReview,
    reviewedAt: options?.reviewedAt ?? CHECKED_AT,
    maximumReviewAgeMs: options?.maximumReviewAgeMs ?? 60 * 60 * 1000
  });
}

test("makes a fresh evidence-backed comparison visible for internal portfolio reassessment without choosing", () => {
  const result = run(comparisonReadyReview());

  assert.equal(result.state, "READY_FOR_INTERNAL_REVIEW");
  assert.deepEqual(result.reasonCodes, ["COUNTERFACTUAL_READY_FOR_PORTFOLIO_REVIEW"]);
  assert.equal(result.candidateId, "decision:test");
  assert.equal(result.sourceStatus, "COMPARISON_READY");
  assert.deepEqual(result.scenarioIds, ["do", "do-not"]);
  assert.deepEqual(result.comparisonDimensionRefs, ["keegan-hours"]);
  assert.ok(result.evidenceRefs.includes("evidence:do:capacity"));
  assert.ok(result.evidenceRefs.includes("evidence:do-not:capacity"));
  assert.deepEqual(result.sourceRefs, ["source:decision:test"]);
  assert.equal(result.nextInternalStep, "REASSESS_CURRENT_DECISION_PORTFOLIO_CANDIDATE");
  assert.equal(result.scenarioWinner, null);
  assert.equal(result.recommendedDisposition, null);
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.authority.scenarioSelectionAuthorized, false);
  assert.equal(result.authority.portfolioMutationAuthorized, false);
  assert.equal(result.authority.allocationChangeAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
  assert.equal(result.authority.approvalBypassAuthorized, false);
});

test("preserves upstream verification instead of laundering assumptions into a portfolio signal", () => {
  const review = buildCounterfactualReviewV1({
    decisionId: "decision:test",
    evaluatedAt: REVIEW_AT,
    scenarios: [
      scenario("do", "DO", {
        dimensions: [
          {
            dimensionRef: "demand",
            label: "Demand",
            kind: "DISTRIBUTION",
            material: true,
            basis: "ASSUMPTION",
            truthState: "INFERRED",
            range: { min: 40, max: 80, unit: "orders" },
            qualitativeValue: null,
            window: WINDOW,
            evidenceRefs: ["evidence:assumption:demand"]
          }
        ]
      }),
      scenario("do-not", "DO_NOT", {
        dimensions: [
          {
            dimensionRef: "demand",
            label: "Demand",
            kind: "DISTRIBUTION",
            material: true,
            basis: "ASSUMPTION",
            truthState: "INFERRED",
            range: { min: 0, max: 0, unit: "orders" },
            qualitativeValue: null,
            window: WINDOW,
            evidenceRefs: ["evidence:assumption:do-not"]
          }
        ]
      })
    ]
  });

  const result = run(review);

  assert.equal(review.status, "VERIFY_REQUIRED");
  assert.equal(result.state, "VERIFY_REQUIRED");
  assert.ok(result.reasonCodes.includes("COUNTERFACTUAL_REQUIRES_VERIFICATION"));
  assert.deepEqual(result.sourceVerificationReasons, [...review.verificationReasons].sort());
  assert.equal(result.nextInternalStep, "REFRESH_OR_VERIFY_COUNTERFACTUAL_EVIDENCE");
  assert.equal(result.recommendedDisposition, null);
});

test("fails closed when the counterfactual decision is not the exact canonical portfolio candidate", () => {
  const review = buildCounterfactualReviewV1({
    decisionId: "decision:other",
    evaluatedAt: REVIEW_AT,
    scenarios: [scenario("do", "DO"), scenario("do-not", "DO_NOT")]
  });

  const result = run(review);

  assert.equal(result.state, "BLOCKED");
  assert.ok(result.reasonCodes.includes("TARGET_CANDIDATE_MISSING"));
  assert.equal(result.previousDisposition, null);
  assert.equal(result.nextInternalStep, null);
});

test("requires current canonical candidate evidence before portfolio review", () => {
  const result = run(comparisonReadyReview(), {
    portfolioValue: portfolio({ evidenceState: "INFERRED" })
  });

  assert.equal(result.state, "VERIFY_REQUIRED");
  assert.ok(result.reasonCodes.includes("TARGET_NOT_KNOWN"));
  assert.equal(result.nextInternalStep, "REFRESH_OR_VERIFY_COUNTERFACTUAL_EVIDENCE");
});

test("requires an explicit current freshness window and never treats stale analysis as current", () => {
  const result = run(comparisonReadyReview(), {
    reviewedAt: "2026-09-20T12:30:00.000Z",
    maximumReviewAgeMs: 60 * 60 * 1000
  });

  assert.equal(result.state, "VERIFY_REQUIRED");
  assert.ok(result.reasonCodes.includes("REVIEW_STALE"));
  assert.equal(result.reviewAgeMs, 48 * 60 * 60 * 1000);
  assert.equal(result.nextInternalStep, "REFRESH_OR_VERIFY_COUNTERFACTUAL_EVIDENCE");
});

test("requires Keegan review for governed approval or non-reversible scenarios without authorizing action", () => {
  const approvalResult = run(comparisonReadyReview({ approvalClass: "KEEGAN" }));
  assert.equal(approvalResult.state, "KEEGAN_REVIEW_REQUIRED");
  assert.ok(approvalResult.reasonCodes.includes("KEEGAN_APPROVAL_REQUIRED"));
  assert.equal(approvalResult.nextInternalStep, "PRESENT_COMPARISON_FOR_KEEGAN_REVIEW");
  assert.equal(approvalResult.authority.scenarioSelectionAuthorized, false);

  const irreversibleResult = run(comparisonReadyReview({ reversibility: "IRREVERSIBLE" }));
  assert.equal(irreversibleResult.state, "KEEGAN_REVIEW_REQUIRED");
  assert.ok(
    irreversibleResult.reasonCodes.includes(
      "NON_REVERSIBLE_SCENARIO_REQUIRES_KEEGAN_REVIEW"
    )
  );
  assert.equal(irreversibleResult.authority.allocationChangeAuthorized, false);
});

test("blocks a tampered source review that widens analysis authority", () => {
  const review = structuredClone(comparisonReadyReview());
  (review.actionAuthority as unknown as { scenarioSelectionAuthorized: boolean })
    .scenarioSelectionAuthorized = true;

  const result = run(review);

  assert.equal(result.state, "BLOCKED");
  assert.ok(result.reasonCodes.includes("COUNTERFACTUAL_AUTHORITY_WIDENED"));
  assert.equal(result.nextInternalStep, null);
});

test("blocks counterfactual analysis that predates the current portfolio generation", () => {
  const result = run(comparisonReadyReview({ evaluatedAt: "2026-09-18T11:59:59.000Z" }));

  assert.equal(result.state, "BLOCKED");
  assert.ok(result.reasonCodes.includes("REVIEW_PRECEDES_PORTFOLIO"));
});

test("does not mutate source portfolio or counterfactual review", () => {
  const portfolioValue = portfolio();
  const review = comparisonReadyReview();
  const portfolioBefore = JSON.stringify(portfolioValue);
  const reviewBefore = JSON.stringify(review);

  const result = run(review, { portfolioValue });

  assert.equal(JSON.stringify(portfolioValue), portfolioBefore);
  assert.equal(JSON.stringify(review), reviewBefore);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.authority), true);
  assert.equal(Object.isFrozen(result.reasonCodes), true);
});
