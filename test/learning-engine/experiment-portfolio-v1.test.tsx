import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExperimentPortfolioV1,
  compileShadowPolicyReviewV1,
  evaluateExperimentOutcomeV1,
  ExperimentPortfolioError,
  type ExperimentCandidateV1,
  type ExperimentObservationV1
} from "../../src/lib/learning-engine/experiment-portfolio-v1";

const portfolioNow = "2026-09-18T10:30:00.000Z";
const outcomeNow = "2026-09-26T12:00:00.000Z";

function candidate(id: string, overrides: Partial<ExperimentCandidateV1> = {}): ExperimentCandidateV1 {
  return {
    id,
    title: id,
    domain: "WEBSITE",
    owner: "JEEVES",
    approvalClass: "REVIEW",
    truthState: "KNOWN",
    evidenceRefs: [`evidence:${id}`],
    sourceRefs: [`source:${id}`],
    hypothesis: `Hypothesis for ${id}`,
    causalMechanismHypothesis: `Mechanism hypothesis for ${id}`,
    design: {
      type: "RANDOMIZED_HOLDOUT",
      controlDefinition: "Existing experience held unchanged",
      assignmentMethod: "Server-side random assignment",
      evidenceRefs: [`design:${id}`]
    },
    primaryMetric: { id: "conversion_rate_bps", unit: "BASIS_POINTS_DELTA" },
    criteria: {
      success: { operator: "GTE", threshold: 5, evidenceRefs: [`success:${id}`] },
      stop: { operator: "LTE", threshold: -5, evidenceRefs: [`stop:${id}`] },
      scale: { operator: "GTE", threshold: 10, evidenceRefs: [`scale:${id}`] }
    },
    preRegistration: {
      registeredAt: "2026-09-17T12:00:00.000Z",
      evidenceRefs: [`prereg:${id}`]
    },
    evaluationWindow: {
      start: "2026-09-18T12:00:00.000Z",
      earliestDecisionAt: "2026-09-20T12:00:00.000Z",
      end: "2026-09-25T12:00:00.000Z"
    },
    minimumSampleSize: 100,
    resources: { keeganHours: 0, ioanaHours: 0, jeevesHours: 2, cashCents: 0, exposureCount: 1000 },
    priorityPoints: 50,
    priorityEvidenceRefs: [`priority:${id}`],
    dependencyIds: [],
    conflictKeys: [],
    blockers: [],
    confoundersToTrack: ["traffic mix"],
    attributionPlan: { targetClass: "RANDOMIZED", evidenceRefs: [`attribution-plan:${id}`] },
    rollbackPlan: "Restore the prior experience.",
    safeNextStep: `Prepare ${id} for approval without launching it.`,
    ...overrides
  };
}

function observation(experimentId: string, overrides: Partial<ExperimentObservationV1> = {}): ExperimentObservationV1 {
  return {
    experimentId,
    observedAt: "2026-09-25T13:00:00.000Z",
    completionState: "FINAL",
    truthState: "KNOWN",
    evidenceRefs: [`outcome:${experimentId}`],
    sampleSize: 500,
    metric: { id: "conversion_rate_bps", unit: "BASIS_POINTS_DELTA", value: 12 },
    attributionClass: "RANDOMIZED",
    attributionEvidenceRefs: [`assignment-proof:${experimentId}`],
    confounders: [],
    ...overrides
  };
}

const capacity = {
  maxConcurrent: 3,
  keeganHours: 4,
  ioanaHours: 4,
  jeevesHours: 8,
  cashCents: 100_000,
  exposureCount: 4000
};

test("selects the highest caller-priority capacity-feasible experiment portfolio", () => {
  const expensive = candidate("expensive", {
    priorityPoints: 90,
    resources: { keeganHours: 0, ioanaHours: 0, jeevesHours: 8, cashCents: 0, exposureCount: 4000 }
  });
  const pairA = candidate("pair-a", {
    priorityPoints: 60,
    resources: { keeganHours: 0, ioanaHours: 0, jeevesHours: 4, cashCents: 0, exposureCount: 2000 }
  });
  const pairB = candidate("pair-b", {
    priorityPoints: 60,
    resources: { keeganHours: 0, ioanaHours: 0, jeevesHours: 4, cashCents: 0, exposureCount: 2000 }
  });

  const result = buildExperimentPortfolioV1({ candidates: [expensive, pairB, pairA], capacity, generatedAt: portfolioNow });

  assert.deepEqual(result.selectedIds, ["pair-a", "pair-b"]);
  assert.equal(result.usedCapacity.jeevesHours, 8);
  assert.equal(result.audit.priorityMeaning, "CALLER_SUPPLIED_DECISION_PRIORITY_NOT_CONFIDENCE_OR_MONETARY_VALUE");
  assert.equal(result.items.find((item) => item.candidate.id === "expensive")?.disposition, "DEFERRED_CAPACITY");
  assert.ok(result.audit.feasiblePortfoliosEvaluated > 1);
  assert.deepEqual(result.authority, {
    launch: false,
    spend: false,
    pricing: false,
    send: false,
    publish: false,
    externalAction: false,
    policyPromotion: false,
    approvalBypass: false
  });
});

test("fails closed on missing provenance, weak truth, unsupported attribution design, and blockers", () => {
  const result = buildExperimentPortfolioV1({
    candidates: [
      candidate("unknown", { truthState: "UNKNOWN" }),
      candidate("no-source", { sourceRefs: [] }),
      candidate("bad-attribution", {
        design: {
          type: "OBSERVATIONAL",
          controlDefinition: null,
          assignmentMethod: "No assignment",
          evidenceRefs: ["design:bad-attribution"]
        },
        attributionPlan: { targetClass: "RANDOMIZED", evidenceRefs: ["attribution-plan:bad-attribution"] }
      }),
      candidate("rights-blocked", { blockers: ["Rights review required"] })
    ],
    capacity,
    generatedAt: portfolioNow
  });

  assert.equal(result.selectedIds.length, 0);
  assert.equal(result.items.find((item) => item.candidate.id === "unknown")?.disposition, "VERIFY");
  assert.match(result.items.find((item) => item.candidate.id === "no-source")!.verificationReasons.join(" "), /source provenance/i);
  assert.match(result.items.find((item) => item.candidate.id === "bad-attribution")!.verificationReasons.join(" "), /unsupported/i);
  assert.equal(result.items.find((item) => item.candidate.id === "rights-blocked")?.disposition, "BLOCKED");
});

test("enforces dependencies and conflict keys without granting launch authority", () => {
  const dependent = candidate("dependent", { dependencyIds: ["tracking-ready"], priorityPoints: 80 });
  const resultBlocked = buildExperimentPortfolioV1({ candidates: [dependent], capacity, generatedAt: portfolioNow });
  assert.equal(resultBlocked.selectedIds.length, 0);

  const conflictA = candidate("conflict-a", { conflictKeys: ["homepage-hero"], priorityPoints: 70 });
  const conflictB = candidate("conflict-b", { conflictKeys: ["homepage-hero"], priorityPoints: 60 });
  const result = buildExperimentPortfolioV1({
    candidates: [dependent, conflictB, conflictA],
    capacity,
    generatedAt: portfolioNow,
    satisfiedDependencyIds: ["tracking-ready"]
  });

  assert.ok(result.selectedIds.includes("dependent"));
  assert.ok(result.selectedIds.includes("conflict-a"));
  assert.ok(!result.selectedIds.includes("conflict-b"));
  assert.equal(result.authority.launch, false);
});

test("rejects late pre-registration rather than allowing retrospective success criteria", () => {
  assert.throws(
    () =>
      buildExperimentPortfolioV1({
        candidates: [
          candidate("late", {
            preRegistration: {
              registeredAt: "2026-09-18T13:00:00.000Z",
              evidenceRefs: ["prereg:late"]
            }
          })
        ],
        capacity,
        generatedAt: "2026-09-18T14:00:00.000Z"
      }),
    (error: unknown) => error instanceof ExperimentPortfolioError && error.code === "LATE_PREREGISTRATION"
  );
});

test("resists peeking before the pre-registered decision point even when the metric looks strong", () => {
  const experiment = candidate("peek");
  const result = evaluateExperimentOutcomeV1({
    experiment,
    observation: observation("peek", {
      observedAt: "2026-09-19T12:00:00.000Z",
      completionState: "INTERIM",
      metric: { id: "conversion_rate_bps", unit: "BASIS_POINTS_DELTA", value: 50 }
    }),
    generatedAt: outcomeNow
  });

  assert.equal(result.decision, "CONTINUE");
  assert.match(result.reasons.join(" "), /earliest decision/i);
  assert.equal(result.externalActionAuthorized, false);
  assert.equal(result.policyUpdateAuthorized, false);
});

test("requires minimum sample size before stop or scale review", () => {
  const experiment = candidate("small-sample");
  const result = evaluateExperimentOutcomeV1({
    experiment,
    observation: observation("small-sample", {
      sampleSize: 20,
      metric: { id: "conversion_rate_bps", unit: "BASIS_POINTS_DELTA", value: -20 }
    }),
    generatedAt: outcomeNow
  });

  assert.equal(result.decision, "CONTINUE");
  assert.match(result.reasons.join(" "), /sample size/i);
});

test("surfaces pre-registered stop criteria as review, never autonomous shutdown", () => {
  const experiment = candidate("stop");
  const result = evaluateExperimentOutcomeV1({
    experiment,
    observation: observation("stop", {
      observedAt: "2026-09-21T12:00:00.000Z",
      completionState: "INTERIM",
      metric: { id: "conversion_rate_bps", unit: "BASIS_POINTS_DELTA", value: -8 }
    }),
    generatedAt: outcomeNow
  });

  assert.equal(result.decision, "STOP_REVIEW");
  assert.equal(result.stopCriterionMet, true);
  assert.equal(result.externalActionAuthorized, false);
});

test("surfaces a final scale candidate without turning it into causal truth or execution authority", () => {
  const experiment = candidate("scale");
  const result = evaluateExperimentOutcomeV1({
    experiment,
    observation: observation("scale"),
    generatedAt: outcomeNow
  });

  assert.equal(result.decision, "SCALE_REVIEW");
  assert.equal(result.successCriterionMet, true);
  assert.equal(result.scaleCriterionMet, true);
  assert.equal(result.causalReviewState, "REVIEW_ELIGIBLE");
  assert.equal(result.attributionClass, "RANDOMIZED");
  assert.equal(result.policyUpdateAuthorized, false);
  assert.equal(result.externalActionAuthorized, false);
});

test("keeps correlational outcomes explicitly non-causal and preserves confounders", () => {
  const experiment = candidate("correlation", {
    design: {
      type: "OBSERVATIONAL",
      controlDefinition: null,
      assignmentMethod: "Observed exposure only",
      evidenceRefs: ["design:correlation"]
    },
    attributionPlan: { targetClass: "CORRELATIONAL", evidenceRefs: ["attribution-plan:correlation"] }
  });
  const result = evaluateExperimentOutcomeV1({
    experiment,
    observation: observation("correlation", {
      attributionClass: "CORRELATIONAL",
      attributionEvidenceRefs: ["correlation-link"],
      confounders: ["promotion overlap", "seasonality"]
    }),
    generatedAt: outcomeNow
  });

  assert.equal(result.decision, "SCALE_REVIEW");
  assert.equal(result.causalReviewState, "NOT_ESTABLISHED");
  assert.deepEqual(result.confounders, ["promotion overlap", "seasonality"]);
});

test("rejects attribution stronger than the pre-registered design supports", () => {
  const experiment = candidate("unsupported", {
    design: {
      type: "OBSERVATIONAL",
      controlDefinition: null,
      assignmentMethod: "Observed exposure only",
      evidenceRefs: ["design:unsupported"]
    },
    attributionPlan: { targetClass: "CORRELATIONAL", evidenceRefs: ["attribution-plan:unsupported"] }
  });
  const result = evaluateExperimentOutcomeV1({
    experiment,
    observation: observation("unsupported", { attributionClass: "RANDOMIZED" }),
    generatedAt: outcomeNow
  });

  assert.equal(result.decision, "VERIFY");
  assert.match(result.reasons.join(" "), /unsupported/i);
  assert.equal(result.causalReviewState, "NOT_ESTABLISHED");
});

test("one outcome can never promote a policy and two independent outcomes only unlock shadow review", () => {
  const one = compileShadowPolicyReviewV1({
    policyCandidateId: "policy:pricing-copy",
    statement: "Consider this presentation pattern for comparable future tests.",
    policyEvidenceRefs: ["policy-evidence"],
    supportingOutcomes: [
      {
        experimentId: "exp-1",
        outcomeRef: "outcome-1",
        observedAt: "2026-09-25T13:00:00.000Z",
        truthState: "KNOWN",
        attributionClass: "RANDOMIZED",
        evidenceRefs: ["evidence:outcome-1"]
      }
    ],
    minimumIndependentOutcomes: 2,
    shadowEvaluationPlan: "Evaluate against comparable future recommendations without changing production behavior.",
    rollbackPlan: "Discard the shadow candidate and preserve prior policy.",
    generatedAt: outcomeNow
  });

  assert.equal(one.state, "INSUFFICIENT_EVIDENCE");
  assert.equal(one.promotionAuthorized, false);

  const two = compileShadowPolicyReviewV1({
    policyCandidateId: "policy:pricing-copy",
    statement: "Consider this presentation pattern for comparable future tests.",
    policyEvidenceRefs: ["policy-evidence"],
    supportingOutcomes: [
      {
        experimentId: "exp-1",
        outcomeRef: "outcome-1",
        observedAt: "2026-09-25T13:00:00.000Z",
        truthState: "KNOWN",
        attributionClass: "RANDOMIZED",
        evidenceRefs: ["evidence:outcome-1"]
      },
      {
        experimentId: "exp-2",
        outcomeRef: "outcome-2",
        observedAt: "2026-09-26T10:00:00.000Z",
        truthState: "KNOWN",
        attributionClass: "QUASI_EXPERIMENTAL",
        evidenceRefs: ["evidence:outcome-2"]
      }
    ],
    minimumIndependentOutcomes: 2,
    shadowEvaluationPlan: "Evaluate against comparable future recommendations without changing production behavior.",
    rollbackPlan: "Discard the shadow candidate and preserve prior policy.",
    generatedAt: outcomeNow
  });

  assert.equal(two.state, "SHADOW_REVIEW_READY");
  assert.equal(two.shadowOnly, true);
  assert.equal(two.reviewRequired, true);
  assert.equal(two.promotionAuthorized, false);
  assert.equal(two.externalActionAuthorized, false);
  assert.deepEqual(two.independentExperimentIds, ["exp-1", "exp-2"]);
});

test("future, weak, or duplicate policy evidence fails closed", () => {
  const result = compileShadowPolicyReviewV1({
    policyCandidateId: "policy:weak",
    statement: "Do not promote this yet.",
    policyEvidenceRefs: ["policy-evidence"],
    supportingOutcomes: [
      {
        experimentId: "exp-1",
        outcomeRef: "duplicate",
        observedAt: "2026-09-25T13:00:00.000Z",
        truthState: "KNOWN",
        attributionClass: "CORRELATIONAL",
        evidenceRefs: ["evidence:one"]
      },
      {
        experimentId: "exp-2",
        outcomeRef: "duplicate",
        observedAt: "2026-09-25T14:00:00.000Z",
        truthState: "KNOWN",
        attributionClass: "CORRELATIONAL",
        evidenceRefs: ["evidence:two"]
      },
      {
        experimentId: "exp-3",
        outcomeRef: "future",
        observedAt: "2026-09-27T14:00:00.000Z",
        truthState: "KNOWN",
        attributionClass: "RANDOMIZED",
        evidenceRefs: ["evidence:future"]
      }
    ],
    minimumIndependentOutcomes: 2,
    shadowEvaluationPlan: "Shadow only.",
    rollbackPlan: "Retain the current policy.",
    generatedAt: outcomeNow
  });

  assert.equal(result.state, "VERIFY");
  assert.match(result.reasons.join(" "), /duplicate/i);
  assert.match(result.reasons.join(" "), /future/i);
  assert.equal(result.promotionAuthorized, false);
});

test("portfolio construction is deterministic and does not mutate input candidates", () => {
  const candidates = [candidate("stable-a", { priorityPoints: 75 }), candidate("stable-b", { priorityPoints: 50 })];
  const before = JSON.stringify(candidates);
  const first = buildExperimentPortfolioV1({ candidates, capacity, generatedAt: portfolioNow });
  const second = buildExperimentPortfolioV1({ candidates: [...candidates].reverse(), capacity, generatedAt: portfolioNow });

  assert.deepEqual(first.selectedIds, second.selectedIds);
  assert.equal(first.portfolioId, second.portfolioId);
  assert.equal(JSON.stringify(candidates), before);
});
