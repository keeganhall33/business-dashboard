import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExperimentPortfolioV1,
  ExperimentPortfolioError,
  type ExperimentCandidateV1,
  type ExperimentObservationV1
} from "../../src/lib/learning-engine/experiment-portfolio-v1";
import type { DecisionCandidateV1 } from "../../src/lib/strategy-engine/decision-portfolio-v1";

const generatedAt = "2026-09-28T00:00:00.000Z";
const windowStart = "2026-09-20T00:00:00.000Z";
const windowEnd = "2026-09-27T00:00:00.000Z";
const capacity = {
  keeganHours: 4,
  ioanaHours: 8,
  jeevesHours: 8,
  cashCents: 100_000,
  maxSelected: 3,
  maxKeeganDecisions: 1
};

function decisionCandidate(id: string, overrides: Partial<DecisionCandidateV1> = {}): DecisionCandidateV1 {
  return {
    id,
    title: id,
    candidateType: "EXPERIMENT",
    owner: "JEEVES",
    approvalClass: "REVIEW",
    evidenceState: "KNOWN",
    evidenceRefs: [`decision-evidence:${id}`],
    sourceRefs: [`decision-source:${id}`],
    monetaryCase: null,
    value: {
      strategicFit: 70,
      compoundingAdvantage: 65,
      relationshipAccess: 20,
      futureOptions: 60,
      learningValue: 90,
      urgency: 55,
      reversibility: 85
    },
    risk: { execution: 20, reputation: 10, rights: 5 },
    resources: { keeganHours: 0, ioanaHours: 0, jeevesHours: 2, cashCents: 0 },
    dependencyIds: [],
    conflictKeys: [],
    blockers: [],
    informationGainAction: "Verify the experiment design",
    safeNextStep: "Prepare the experiment brief for review",
    successMetric: "Qualified conversion rate",
    evaluationWindow: { start: windowStart, end: windowEnd },
    ...overrides
  };
}

function observation(overrides: Partial<ExperimentObservationV1> = {}): ExperimentObservationV1 {
  return {
    metric: "qualified_conversion_rate",
    unit: "PERCENT",
    value: 12,
    sampleSize: 200,
    observedAt: windowEnd,
    truthState: "KNOWN",
    evidenceRefs: ["outcome:e1"],
    attributionClass: "CORRELATIONAL",
    attributionEvidenceRefs: ["attribution:e1"],
    confounders: ["seasonality"],
    ...overrides
  };
}

function experiment(id: string, overrides: Partial<ExperimentCandidateV1> = {}): ExperimentCandidateV1 {
  return {
    id,
    title: id,
    domain: "WEBSITE",
    decisionCandidate: decisionCandidate(id),
    registeredAt: "2026-09-19T00:00:00.000Z",
    causalHypothesis: "Reducing checkout ambiguity will improve qualified conversion rate.",
    comparisonDesign: {
      kind: "RANDOMIZED_HOLDOUT",
      assignmentUnit: "session",
      description: "Randomly hold out eligible sessions from the proposed treatment.",
      evidenceRefs: [`design:${id}`]
    },
    successRule: {
      id: `${id}:success`,
      kind: "SUCCESS",
      metric: "qualified_conversion_rate",
      unit: "PERCENT",
      comparator: "GTE",
      threshold: 10,
      notBeforeAt: windowEnd,
      minimumSampleSize: 100,
      evidenceRefs: [`success-rule:${id}`]
    },
    stopRule: {
      id: `${id}:stop`,
      kind: "STOP",
      metric: "qualified_conversion_rate",
      unit: "PERCENT",
      comparator: "LTE",
      threshold: 5,
      notBeforeAt: windowStart,
      minimumSampleSize: 100,
      evidenceRefs: [`stop-rule:${id}`]
    },
    scaleRule: {
      id: `${id}:scale`,
      kind: "SCALE",
      metric: "qualified_conversion_rate",
      unit: "PERCENT",
      comparator: "GTE",
      threshold: 15,
      notBeforeAt: windowEnd,
      minimumSampleSize: 100,
      evidenceRefs: [`scale-rule:${id}`]
    },
    prediction: {
      metric: "qualified_conversion_rate",
      unit: "PERCENT",
      low: 8,
      expected: 11,
      high: 14,
      evidenceRefs: [`prediction:${id}`]
    },
    knownConfounders: ["campaign_mix"],
    observation: null,
    policyUpdateCandidate: null,
    ...overrides
  };
}

test("reuses the canonical decision portfolio for capacity allocation and grants no execution authority", () => {
  const first = experiment("exp-a");
  const second = experiment("exp-b", {
    decisionCandidate: decisionCandidate("exp-b", {
      resources: { keeganHours: 0, ioanaHours: 0, jeevesHours: 7, cashCents: 0 },
      value: {
        strategicFit: 50,
        compoundingAdvantage: 50,
        relationshipAccess: 10,
        futureOptions: 40,
        learningValue: 60,
        urgency: 40,
        reversibility: 80
      }
    })
  });
  const result = buildExperimentPortfolioV1({ experiments: [second, first], capacity, generatedAt });

  assert.deepEqual(result.decisionPortfolio.selectedIds, ["exp-a"]);
  assert.equal(result.items.find((item) => item.experimentId === "exp-a")?.portfolioDisposition, "SELECTED");
  assert.deepEqual(result.authority, {
    launchExperiment: false,
    changeSpend: false,
    changePrice: false,
    publish: false,
    sendOutreach: false,
    promotePolicy: false
  });
});

test("requires pre-registration and a comparison design before an experiment can enter the selected portfolio", () => {
  const noDesign = experiment("no-design", {
    comparisonDesign: {
      kind: "NONE",
      assignmentUnit: null,
      description: "No credible comparison has been defined yet.",
      evidenceRefs: []
    }
  });
  const late = experiment("late", { registeredAt: "2026-09-21T00:00:00.000Z" });
  const result = buildExperimentPortfolioV1({ experiments: [noDesign, late], capacity, generatedAt });

  assert.deepEqual(result.decisionPortfolio.selectedIds, []);
  assert.equal(result.items.find((item) => item.experimentId === "no-design")?.preRegistrationState, "VERIFY_REQUIRED");
  assert.ok(result.items.find((item) => item.experimentId === "no-design")?.verificationReasons.includes("NO_COMPARISON_DESIGN"));
  assert.ok(result.items.find((item) => item.experimentId === "late")?.verificationReasons.includes("NOT_PRE_REGISTERED_BEFORE_START"));
});

test("rejects success or scale rules that permit peeking before the registered evaluation window ends", () => {
  const input = experiment("peek", {
    successRule: {
      ...experiment("template").successRule,
      id: "peek:success",
      notBeforeAt: "2026-09-24T00:00:00.000Z",
      evidenceRefs: ["success-rule:peek"]
    }
  });
  assert.throws(
    () => buildExperimentPortfolioV1({ experiments: [input], capacity, generatedAt }),
    (error: unknown) => error instanceof ExperimentPortfolioError && error.code === "PEEKING_RISK"
  );
});

test("can recommend an evidence-backed early stop without evaluating success early", () => {
  const result = buildExperimentPortfolioV1({
    experiments: [
      experiment("stop", {
        observation: observation({
          value: 4,
          observedAt: "2026-09-22T00:00:00.000Z",
          evidenceRefs: ["outcome:stop"],
          attributionEvidenceRefs: ["attribution:stop"]
        })
      })
    ],
    capacity,
    generatedAt
  });
  assert.equal(result.items[0].reviewState, "STOP_REVIEW");
  assert.equal(result.items[0].causalClaimAllowed, false);
});

test("waits for the registered evaluation window rather than declaring an early success", () => {
  const result = buildExperimentPortfolioV1({
    experiments: [
      experiment("wait", {
        observation: observation({
          value: 13,
          observedAt: "2026-09-22T00:00:00.000Z",
          evidenceRefs: ["outcome:wait"],
          attributionEvidenceRefs: ["attribution:wait"]
        })
      })
    ],
    capacity,
    generatedAt
  });
  assert.equal(result.items[0].reviewState, "WAITING_FOR_WINDOW");
});

test("preserves correlation limits and refuses a causal claim from a non-randomized design", () => {
  const result = buildExperimentPortfolioV1({
    experiments: [
      experiment("pre-post", {
        comparisonDesign: {
          kind: "PRE_POST",
          assignmentUnit: null,
          description: "Compare the registered prior and current periods.",
          evidenceRefs: ["design:pre-post"]
        },
        observation: observation({
          observedAt: windowEnd,
          attributionClass: "CAUSAL_SUPPORTED",
          attributionEvidenceRefs: ["attribution:pre-post"],
          evidenceRefs: ["outcome:pre-post"]
        })
      })
    ],
    capacity,
    generatedAt
  });

  assert.equal(result.items[0].reviewState, "VERIFY_REQUIRED");
  assert.equal(result.items[0].causalClaimAllowed, false);
  assert.ok(result.items[0].verificationReasons.includes("CAUSAL_CLAIM_WITHOUT_RANDOMIZED_HOLDOUT"));
});

test("allows a causal-support label only when the caller supplies randomized-holdout attribution evidence", () => {
  const result = buildExperimentPortfolioV1({
    experiments: [
      experiment("randomized", {
        observation: observation({
          value: 16,
          observedAt: windowEnd,
          attributionClass: "CAUSAL_SUPPORTED",
          attributionEvidenceRefs: ["randomization:audit"],
          evidenceRefs: ["outcome:randomized"]
        })
      })
    ],
    capacity,
    generatedAt
  });

  assert.equal(result.items[0].reviewState, "SCALE_REVIEW");
  assert.equal(result.items[0].causalClaimAllowed, true);
  assert.equal(result.items[0].calibration, "ABOVE_PREDICTED_RANGE");
});

test("fails closed on stale or conflicted observed outcomes instead of manufacturing a decision", () => {
  const result = buildExperimentPortfolioV1({
    experiments: [
      experiment("stale-outcome", {
        observation: observation({
          truthState: "STALE",
          evidenceRefs: ["outcome:stale"],
          attributionEvidenceRefs: ["attribution:stale"]
        })
      })
    ],
    capacity,
    generatedAt
  });

  assert.equal(result.items[0].reviewState, "VERIFY_REQUIRED");
  assert.ok(result.items[0].verificationReasons.includes("OBSERVATION_STALE"));
  assert.equal(result.items[0].causalClaimAllowed, false);
});

test("keeps policy learning shadow-only and requires multiple independent replication references before review", () => {
  const one = buildExperimentPortfolioV1({
    experiments: [
      experiment("one", {
        policyUpdateCandidate: {
          statement: "Prefer this checkout treatment when the same eligibility rules hold.",
          rollbackPlan: "Restore the prior presentation if later evidence contradicts the effect.",
          minimumIndependentReplications: 2,
          independentReplicationEvidenceRefs: ["replication:one"]
        }
      })
    ],
    capacity,
    generatedAt
  });
  assert.equal(one.items[0].policyUpdate.mode, "SHADOW_ONLY");
  assert.equal(one.items[0].policyUpdate.eligibleForIndependentReview, false);
  assert.equal(one.items[0].policyUpdate.canPromoteAutomatically, false);

  const two = buildExperimentPortfolioV1({
    experiments: [
      experiment("two", {
        policyUpdateCandidate: {
          statement: "Prefer this checkout treatment when the same eligibility rules hold.",
          rollbackPlan: "Restore the prior presentation if later evidence contradicts the effect.",
          minimumIndependentReplications: 2,
          independentReplicationEvidenceRefs: ["replication:one", "replication:two"]
        }
      })
    ],
    capacity,
    generatedAt
  });
  assert.equal(two.items[0].policyUpdate.eligibleForIndependentReview, true);
  assert.equal(two.items[0].policyUpdate.canPromoteAutomatically, false);
});

test("preserves declared confounders, remains deterministic, and does not mutate inputs", () => {
  const input = experiment("stable", {
    observation: observation({
      evidenceRefs: ["outcome:stable"],
      attributionEvidenceRefs: ["attribution:stable"],
      confounders: ["device_mix", "seasonality"]
    })
  });
  const before = structuredClone(input);
  const a = buildExperimentPortfolioV1({ experiments: [input], capacity, generatedAt });
  const b = buildExperimentPortfolioV1({ experiments: [input], capacity, generatedAt });

  assert.equal(a.portfolioId, b.portfolioId);
  assert.deepEqual(a.items[0].confounders, ["campaign_mix", "device_mix", "seasonality"]);
  assert.deepEqual(input, before);
  assert.ok(Object.isFrozen(a));
  assert.ok(Object.isFrozen(a.items[0]));
});
