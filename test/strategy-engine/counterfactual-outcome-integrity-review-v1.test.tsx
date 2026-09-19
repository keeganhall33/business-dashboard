import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCounterfactualReviewV1,
  type CounterfactualScenarioInputV1
} from "../../src/lib/decision-simulation/counterfactual-review-v1";
import {
  attachDecisionOutcomeObservationV1,
  compileDecisionMemoryV1,
  type DecisionMemoryRecordV1
} from "../../src/lib/intelligence/organizational-learning/decision-memory-v1";
import {
  reviewCounterfactualOutcomeIntegrityV1
} from "../../src/lib/strategy-engine/counterfactual-outcome-integrity-review-v1";

const COUNTERFACTUAL_AT = "2026-09-18T10:00:00.000Z";
const DECIDED_AT = "2026-09-18T12:00:00.000Z";
const OBSERVED_AT = "2026-10-15T12:00:00.000Z";
const REVIEWED_AT = "2026-10-16T12:00:00.000Z";
const WINDOW = {
  start: "2026-10-01T00:00:00.000Z",
  end: "2026-10-31T23:59:59.000Z"
};

function scenario(
  scenarioId: string,
  scenarioClass: CounterfactualScenarioInputV1["scenarioClass"],
  options?: { includeAssumption?: boolean }
): CounterfactualScenarioInputV1 {
  return {
    scenarioId,
    scenarioClass,
    label: scenarioId === "do" ? "Run the bounded launch" : "Do not run the launch",
    dimensions: [
      {
        dimensionRef: "orders",
        label: "Orders",
        kind: "DISTRIBUTION",
        material: true,
        basis: "MODELLED",
        truthState: "KNOWN",
        range: scenarioClass === "DO_NOT"
          ? { min: 0, max: 10, unit: "orders" }
          : { min: 40, max: 80, unit: "orders" },
        qualitativeValue: null,
        window: WINDOW,
        evidenceRefs: [`evidence:${scenarioId}:orders-model`]
      }
    ],
    assumptions: options?.includeAssumption
      ? [
          {
            assumptionId: "assumption:demand",
            statement: "Collector demand remains within the tested range.",
            material: true,
            evidenceRefs: ["evidence:scenario:demand"]
          }
        ]
      : [],
    resourceDemands: [],
    reversibility: "REVERSIBLE",
    approvalClass: "NONE",
    safeNextStep: "Keep the comparison analysis-only."
  };
}

function counterfactual(options?: {
  evaluatedAt?: string;
  includeAssumption?: boolean;
}) {
  return buildCounterfactualReviewV1({
    decisionId: "decision:launch",
    evaluatedAt: options?.evaluatedAt ?? COUNTERFACTUAL_AT,
    scenarios: [
      scenario("do", "DO", { includeAssumption: options?.includeAssumption }),
      scenario("do-not", "DO_NOT")
    ]
  });
}

function decision(options?: {
  selectedAlternativeId?: string;
  actionState?: DecisionMemoryRecordV1["actionState"];
  includeAssumption?: boolean;
}) {
  const selectedAlternativeId = options?.selectedAlternativeId ?? "do";
  return compileDecisionMemoryV1({
    decisionId: "decision:launch",
    decisionClass: "STRATEGY",
    decidedAt: DECIDED_AT,
    actorRef: "actor:keegan",
    context: {
      state: "KNOWN",
      value: "Choose whether to run the bounded launch.",
      evidenceRefs: ["evidence:decision:context"]
    },
    selectedAlternativeId,
    alternatives: [
      {
        alternativeId: "do",
        label: "Run launch",
        description: {
          state: "KNOWN",
          value: "Run the bounded launch.",
          evidenceRefs: ["evidence:alternative:do"]
        }
      },
      {
        alternativeId: "do-not",
        label: "Do not run launch",
        description: {
          state: "KNOWN",
          value: "Do not run the launch.",
          evidenceRefs: ["evidence:alternative:do-not"]
        }
      },
      {
        alternativeId: "third",
        label: "Third path",
        description: {
          state: "KNOWN",
          value: "Use a third path that was not part of the counterfactual review.",
          evidenceRefs: ["evidence:alternative:third"]
        }
      }
    ],
    rationale: {
      state: "KNOWN",
      value: "The bounded launch preserves reversibility while testing demand.",
      evidenceRefs: ["evidence:decision:rationale"]
    },
    assumptions: options?.includeAssumption
      ? [
          {
            assumptionId: "assumption:demand",
            statement: {
              state: "KNOWN",
              value: "Collector demand remains within the tested range.",
              evidenceRefs: ["evidence:decision:demand"]
            },
            material: true,
            revisitTrigger: "Demand evidence materially changes."
          }
        ]
      : [],
    confidence: {
      state: "KNOWN",
      value: "MEDIUM",
      evidenceRefs: ["evidence:decision:confidence"]
    },
    expectedOutcomes: [],
    successCriteria: [],
    failureCriteria: [],
    revisitTriggers: [],
    validUntil: null,
    approval: {
      authorityClass: "NONE",
      approvalState: "NOT_REQUIRED",
      approvedByRef: null,
      approvedAt: null,
      evidenceRefs: []
    },
    actionState: options?.actionState ?? "TAKEN",
    actionEvidenceRefs: ["evidence:decision:action"],
    supersedesDecisionId: null,
    sourceRefs: ["source:decision:launch"]
  });
}

function withOutcome(
  record: DecisionMemoryRecordV1,
  options?: {
    assessment?: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "INCONCLUSIVE" | "UNKNOWN";
    includeAssumptionAssessment?: boolean;
    observedAt?: string;
  }
) {
  const assessment = options?.assessment ?? "POSITIVE";
  return attachDecisionOutcomeObservationV1(record, {
    observedAt: options?.observedAt ?? OBSERVED_AT,
    outcomes: [
      {
        outcomeId: "orders",
        metricRef: "orders",
        description: {
          state: "KNOWN",
          value: "Observed orders during the evaluation window.",
          evidenceRefs: ["evidence:outcome:description"]
        },
        observedRange: {
          state: "KNOWN",
          value: { min: 60, max: 68, unit: "orders" },
          evidenceRefs: ["evidence:outcome:orders"]
        }
      }
    ],
    assessment: {
      state: "KNOWN",
      value: assessment,
      evidenceRefs: ["evidence:outcome:assessment"]
    },
    attributionClass: "CORRELATIONAL",
    attributionEvidenceRefs: ["evidence:outcome:attribution"],
    confounders: [
      {
        confounderId: "confounder:seasonality",
        description: "Seasonality may have influenced demand.",
        evidenceRefs: ["evidence:confounder:seasonality"]
      }
    ],
    assumptionAssessments: options?.includeAssumptionAssessment
      ? [
          {
            assumptionId: "assumption:demand",
            assessment: "SUPPORTED",
            evidenceRefs: ["evidence:assumption:demand:outcome"]
          }
        ]
      : [],
    lessonCandidate: null,
    sourceRefs: ["source:outcome:launch"]
  });
}

function run(
  counterfactualReview: ReturnType<typeof counterfactual>,
  decisionRecord: DecisionMemoryRecordV1,
  options?: { reviewedAt?: string; maximumOutcomeAgeMs?: number }
) {
  return reviewCounterfactualOutcomeIntegrityV1({
    counterfactualReview,
    decisionRecord,
    reviewedAt: options?.reviewedAt ?? REVIEWED_AT,
    maximumOutcomeAgeMs: options?.maximumOutcomeAgeMs ?? 60 * 24 * 60 * 60 * 1000
  });
}

test("binds only the selected historical scenario to observed learning and keeps unchosen scenarios unobserved", () => {
  const result = run(
    counterfactual({ includeAssumption: true }),
    withOutcome(decision({ includeAssumption: true }), { includeAssumptionAssessment: true })
  );

  assert.equal(result.state, "READY_FOR_GOVERNED_LEARNING_REVIEW");
  assert.deepEqual(result.reasonCodes, ["READY_FOR_GOVERNED_LEARNING_REVIEW"]);
  assert.equal(result.selectedAlternativeId, "do");
  assert.equal(result.selectedScenarioId, "do");
  assert.equal(result.selectedScenarioClass, "DO");
  assert.equal(result.bindingBasis, "EXACT_SELECTED_ALTERNATIVE_TO_SCENARIO_ID");
  assert.equal(result.semanticEquivalence, "NOT_ESTABLISHED");
  assert.equal(result.outcomeAssessment, "POSITIVE");
  assert.equal(result.attributionClass, "CORRELATIONAL");
  assert.equal(result.assumptionSignals.length, 1);
  assert.equal(result.assumptionSignals[0]?.assumptionId, "assumption:demand");
  assert.equal(result.assumptionSignals[0]?.outcomeAssessment, "SUPPORTED");
  assert.deepEqual(result.unselectedScenarios, [
    {
      scenarioId: "do-not",
      scenarioClass: "DO_NOT",
      label: "Do not run the launch",
      outcomeStatus: "UNOBSERVED_COUNTERFACTUAL"
    }
  ]);
  assert.equal(result.counterfactualWinner, null);
  assert.equal(result.unselectedScenarioOutcomeInference, "PROHIBITED");
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.nextInternalStep, "REVIEW_SELECTED_SCENARIO_ASSUMPTION_RESULTS");
  assert.equal(result.authority.policyPromotionAuthorized, false);
  assert.equal(result.authority.allocationChangeAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
  assert.equal(result.authority.approvalBypassAuthorized, false);
});

test("blocks hindsight leakage when the counterfactual review was created after the decision", () => {
  const result = run(
    counterfactual({ evaluatedAt: "2026-09-18T13:00:00.000Z" }),
    withOutcome(decision())
  );

  assert.equal(result.state, "BLOCKED");
  assert.ok(result.reasonCodes.includes("COUNTERFACTUAL_AFTER_DECISION"));
  assert.equal(result.nextInternalStep, null);
  assert.equal(result.counterfactualWinner, null);
});

test("blocks an exact decision whose selected alternative was never a reviewed counterfactual scenario", () => {
  const result = run(counterfactual(), withOutcome(decision({ selectedAlternativeId: "third" })));

  assert.equal(result.state, "BLOCKED");
  assert.ok(result.reasonCodes.includes("SELECTED_SCENARIO_MISSING"));
  assert.equal(result.selectedScenarioId, null);
  assert.equal(result.bindingBasis, null);
});

test("waits for measured evidence instead of treating execution as an outcome", () => {
  const result = run(counterfactual(), decision());

  assert.equal(result.state, "WAIT_FOR_OUTCOME");
  assert.ok(result.reasonCodes.includes("OUTCOME_NOT_OBSERVED"));
  assert.equal(result.outcomeAssessment, null);
  assert.equal(result.nextInternalStep, "COLLECT_OR_COMPLETE_OUTCOME_EVIDENCE");
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
});

test("requires an explicit evidenced assessment for each material selected-scenario assumption before learning review", () => {
  const result = run(
    counterfactual({ includeAssumption: true }),
    withOutcome(decision({ includeAssumption: true }))
  );

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("MATERIAL_ASSUMPTION_NOT_ASSESSED"));
  assert.equal(result.assumptionSignals[0]?.outcomeAssessment, "NOT_ASSESSED");
  assert.equal(result.nextInternalStep, "VERIFY_COUNTERFACTUAL_DECISION_LINEAGE");
});

test("preserves inconclusive outcome evidence as waiting rather than inventing a learning direction", () => {
  const result = run(counterfactual(), withOutcome(decision(), { assessment: "INCONCLUSIVE" }));

  assert.equal(result.state, "WAIT_FOR_OUTCOME");
  assert.ok(result.reasonCodes.includes("OUTCOME_NOT_DECISION_GRADE"));
  assert.equal(result.outcomeAssessment, null);
  assert.equal(result.confidence, "NOT_ESTABLISHED");
});

test("fails closed when historical outcome evidence is stale under the caller-owned freshness policy", () => {
  const result = run(counterfactual(), withOutcome(decision()), {
    reviewedAt: "2026-12-20T12:00:00.000Z",
    maximumOutcomeAgeMs: 30 * 24 * 60 * 60 * 1000
  });

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("OUTCOME_STALE"));
  assert.equal(result.nextInternalStep, "VERIFY_COUNTERFACTUAL_DECISION_LINEAGE");
});

test("fails closed if source decision authority is widened", () => {
  const source = withOutcome(decision());
  const widened = {
    ...source,
    actionAuthority: {
      ...source.actionAuthority,
      externalActionAuthorized: true
    }
  } as unknown as DecisionMemoryRecordV1;

  const result = run(counterfactual(), widened);

  assert.equal(result.state, "BLOCKED");
  assert.ok(result.reasonCodes.includes("DECISION_AUTHORITY_WIDENED"));
  assert.equal(result.authority.externalActionAuthorized, false);
});
