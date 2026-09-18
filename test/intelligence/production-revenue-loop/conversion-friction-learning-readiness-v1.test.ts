import assert from "node:assert/strict";
import test from "node:test";

import {
  compileConversionFrictionLearningReadinessV1,
} from "@/lib/intelligence/production-revenue-loop/conversion-friction-learning-readiness-v1";
import type { ConversionFrictionOutcomeReviewV1 } from "@/lib/intelligence/production-revenue-loop/conversion-friction-outcome-review-v1";
import type { RevenueOutcomeCriterionStatusV1 } from "@/lib/intelligence/production-revenue-loop/revenue-outcome-evaluation-v1";

type ReviewOptions = Readonly<{
  candidateId?: string;
  implementationRef?: string;
  recommendationId?: string;
  baselineStart?: string;
  baselineEnd?: string;
  outcomeStart?: string;
  outcomeEnd?: string;
  criterionStatus?: RevenueOutcomeCriterionStatusV1;
  threshold?: number;
  supportingFacts?: readonly string[];
  clarityRequired?: boolean;
  checkoutRequired?: boolean;
  withConfounder?: boolean;
  blocked?: boolean;
  unsafeAuthority?: boolean;
}>;

function review(options: ReviewOptions = {}): ConversionFrictionOutcomeReviewV1 {
  const withConfounder = options.withConfounder ?? false;
  const blocked = options.blocked ?? false;
  return {
    version: "CONVERSION_FRICTION_OUTCOME_REVIEW_V1",
    status: blocked
      ? "BLOCKED"
      : withConfounder
        ? "READY_WITH_CONFOUNDERS"
        : "READY_FOR_GOVERNED_REVIEW",
    reasonCode: blocked
      ? "OUTCOME_NOT_REVIEW_ELIGIBLE"
      : withConfounder
        ? "OBSERVED_OUTCOME_READY_WITH_CONFOUNDERS"
        : "OBSERVED_OUTCOME_READY",
    recommendationId: options.recommendationId ?? "conversion:checkout-friction",
    outcomeCandidateId: blocked ? null : options.candidateId ?? "candidate:1",
    implementationRef: blocked ? null : options.implementationRef ?? "implementation:1",
    measurementStatus: blocked ? "INSUFFICIENT_EVIDENCE" : withConfounder ? "MEASURED_WITH_CONFOUNDERS" : "MEASURED",
    canonicalWindows: blocked
      ? { baseline: null, outcome: null }
      : {
        baseline: {
          startDate: options.baselineStart ?? "2026-09-01",
          endDate: options.baselineEnd ?? "2026-09-07",
        },
        outcome: {
          startDate: options.outcomeStart ?? "2026-09-08",
          endDate: options.outcomeEnd ?? "2026-09-14",
        },
      },
    hypothesisBasis: {
      clarityRequired: options.clarityRequired ?? true,
      checkoutRequired: options.checkoutRequired ?? true,
      supportingFacts: options.supportingFacts ?? [
        "Clarity: dead-click friction is elevated.",
        "Checkout: completion evidence is reconciled.",
      ],
    },
    observedChanges: blocked
      ? []
      : [
        {
          source: "WOO",
          metric: "orders",
          unit: "count",
          baselineValue: 10,
          outcomeValue: 12,
          absoluteChange: 2,
          relativeChangeRatio: 0.2,
          direction: "UP",
          evidenceRefs: [`woo:${options.candidateId ?? "candidate:1"}`],
        },
        {
          source: "CLARITY",
          metric: "dead_click_rate",
          unit: "ratio",
          baselineValue: 0.15,
          outcomeValue: 0.08,
          absoluteChange: -0.07,
          relativeChangeRatio: -0.4666666667,
          direction: "DOWN",
          evidenceRefs: [`clarity:${options.candidateId ?? "candidate:1"}`],
        },
      ],
    criterion: blocked
      ? null
      : {
        status: options.criterionStatus ?? "MET",
        rule: {
          source: "WOO",
          metric: "orders",
          unit: "count",
          comparator: "AT_LEAST_ABSOLUTE_CHANGE",
          threshold: options.threshold ?? 1,
          evidenceRef: "criterion:registered-before-test",
        },
        observedValue: 2,
        evidenceRef: `criterion-result:${options.candidateId ?? "candidate:1"}`,
      },
    confounders: withConfounder
      ? [
        {
          label: "Concurrent campaign launch",
          truthState: "CURRENT",
          observedAt: "2026-09-14T20:00:00.000Z",
          evidenceRefs: ["confounder:campaign"],
        },
      ]
      : [],
    attribution: {
      causal: "NOT_ESTABLISHED",
      channel: "NOT_ESTABLISHED",
      mechanism: "NOT_ESTABLISHED",
    },
    limitations: ["Observed movement is not causal proof."],
    authority: {
      durableLearningPromotionAllowed: options.unsafeAuthority ? true as never : false,
      reallocationAllowed: false,
      externalMutationAllowed: false,
      metaWriteAllowed: false,
      actionExecutionAllowed: false,
      approvalBypassAllowed: false,
    },
  };
}

function secondReview(options: ReviewOptions = {}): ConversionFrictionOutcomeReviewV1 {
  return review({
    candidateId: "candidate:2",
    implementationRef: "implementation:2",
    baselineStart: "2026-09-15",
    baselineEnd: "2026-09-21",
    outcomeStart: "2026-09-22",
    outcomeEnd: "2026-09-28",
    ...options,
  });
}

test("surfaces repeated clean criterion results for governed lesson review without promoting a durable lesson", () => {
  const result = compileConversionFrictionLearningReadinessV1({
    reviews: [review(), secondReview()],
  });

  assert.equal(result.status, "READY_FOR_GOVERNED_LESSON_REVIEW");
  assert.equal(result.reasonCode, "REPEATED_CLEAN_CRITERION_RESULT");
  assert.equal(result.learningScope, "GOVERNED_LESSON_REVIEW_CANDIDATE");
  assert.equal(result.repeatedCriterionResult, "MET");
  assert.equal(result.independentRunCount, 2);
  assert.equal(result.minimumIndependentRuns, 2);
  assert.equal(result.attribution.causal, "NOT_ESTABLISHED");
  assert.equal(result.authority.durableLearningPromotionAllowed, false);
  assert.equal(result.authority.policyChangeAllowed, false);
  assert.equal(result.authority.reallocationAllowed, false);
  assert.equal(result.authority.metaWriteAllowed, false);
  assert.ok(result.evidenceRefs.includes("criterion:registered-before-test"));
  assert.match(result.limitations.join(" "), /not proof/i);
});

test("can repeat a NOT_MET criterion without calling the implementation causally ineffective", () => {
  const result = compileConversionFrictionLearningReadinessV1({
    reviews: [
      review({ criterionStatus: "NOT_MET" }),
      secondReview({ criterionStatus: "NOT_MET" }),
    ],
  });

  assert.equal(result.status, "READY_FOR_GOVERNED_LESSON_REVIEW");
  assert.equal(result.repeatedCriterionResult, "NOT_MET");
  assert.equal(result.attribution.mechanism, "NOT_ESTABLISHED");
  assert.equal(result.authority.actionExecutionAllowed, false);
});

test("keeps one clean outcome observational instead of overfitting one result", () => {
  const result = compileConversionFrictionLearningReadinessV1({ reviews: [review()] });

  assert.equal(result.status, "OBSERVATION_ONLY");
  assert.equal(result.reasonCode, "SINGLE_OBSERVATION_ONLY");
  assert.equal(result.learningScope, "OBSERVATIONAL_ONLY");
  assert.equal(result.independentRunCount, 1);
});

test("treats contradictory repeated criterion results as conflicted", () => {
  const result = compileConversionFrictionLearningReadinessV1({
    reviews: [review({ criterionStatus: "MET" }), secondReview({ criterionStatus: "NOT_MET" })],
  });

  assert.equal(result.status, "CONFLICTED");
  assert.equal(result.reasonCode, "CRITERION_RESULTS_CONFLICT");
  assert.equal(result.repeatedCriterionResult, null);
  assert.equal(result.authority.durableLearningPromotionAllowed, false);
});

test("preserves explicit confounders as observational-only even when the criterion repeats", () => {
  const result = compileConversionFrictionLearningReadinessV1({
    reviews: [review(), secondReview({ withConfounder: true })],
  });

  assert.equal(result.status, "OBSERVATION_ONLY");
  assert.equal(result.reasonCode, "CONFOUNDERS_PRESENT");
  assert.equal(result.repeatedCriterionResult, "MET");
  assert.equal(result.runs[1].confounderCount, 1);
});

test("fails closed on duplicate outcomes, reused implementations, and overlapping windows", () => {
  const duplicate = compileConversionFrictionLearningReadinessV1({
    reviews: [review(), secondReview({ candidateId: "candidate:1" })],
  });
  assert.equal(duplicate.status, "BLOCKED");
  assert.equal(duplicate.reasonCode, "DUPLICATE_OUTCOME_CANDIDATE");

  const reusedImplementation = compileConversionFrictionLearningReadinessV1({
    reviews: [review(), secondReview({ implementationRef: "implementation:1" })],
  });
  assert.equal(reusedImplementation.status, "BLOCKED");
  assert.equal(reusedImplementation.reasonCode, "IMPLEMENTATION_REUSE");

  const overlap = compileConversionFrictionLearningReadinessV1({
    reviews: [
      review(),
      secondReview({ outcomeStart: "2026-09-14", outcomeEnd: "2026-09-20" }),
    ],
  });
  assert.equal(overlap.status, "BLOCKED");
  assert.equal(overlap.reasonCode, "OUTCOME_WINDOW_OVERLAP");
});

test("fails closed when recommendation, hypothesis, or preregistered criterion identity drifts", () => {
  const recommendationMismatch = compileConversionFrictionLearningReadinessV1({
    reviews: [review(), secondReview({ recommendationId: "conversion:other" })],
  });
  assert.equal(recommendationMismatch.reasonCode, "RECOMMENDATION_IDENTITY_MISMATCH");

  const hypothesisMismatch = compileConversionFrictionLearningReadinessV1({
    reviews: [review(), secondReview({ supportingFacts: ["Clarity: different hypothesis."] })],
  });
  assert.equal(hypothesisMismatch.reasonCode, "HYPOTHESIS_IDENTITY_MISMATCH");

  const criterionMismatch = compileConversionFrictionLearningReadinessV1({
    reviews: [review(), secondReview({ threshold: 3 })],
  });
  assert.equal(criterionMismatch.reasonCode, "CRITERION_RULE_MISMATCH");
});

test("keeps unevaluated criteria observational and blocks unsafe or upstream-blocked reviews", () => {
  const unevaluated = compileConversionFrictionLearningReadinessV1({
    reviews: [review({ criterionStatus: "NOT_EVALUATED" }), secondReview({ criterionStatus: "NOT_EVALUATED" })],
  });
  assert.equal(unevaluated.status, "OBSERVATION_ONLY");
  assert.equal(unevaluated.reasonCode, "CRITERION_NOT_EVALUATED");

  const unsafe = compileConversionFrictionLearningReadinessV1({
    reviews: [review(), secondReview({ unsafeAuthority: true })],
  });
  assert.equal(unsafe.status, "BLOCKED");
  assert.equal(unsafe.reasonCode, "OUTCOME_RUN_INTEGRITY_FAILURE");

  const upstreamBlocked = compileConversionFrictionLearningReadinessV1({
    reviews: [review(), secondReview({ blocked: true })],
  });
  assert.equal(upstreamBlocked.status, "BLOCKED");
  assert.equal(upstreamBlocked.reasonCode, "UPSTREAM_REVIEW_BLOCKED");
});

test("is deterministic, deeply immutable, and does not mutate caller input", () => {
  const input = { reviews: [review(), secondReview()] } as const;
  const before = structuredClone(input);
  const first = compileConversionFrictionLearningReadinessV1(input);
  const second = compileConversionFrictionLearningReadinessV1(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.runs), true);
  assert.equal(Object.isFrozen(first.runs[0]), true);
  assert.equal(Object.isFrozen(first.authority), true);
});
