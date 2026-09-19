import assert from "node:assert/strict";
import test from "node:test";

import {
  PolicyLongitudinalControlError,
  reviewPolicyLongitudinalOutcomesV1,
  type GovernedPolicyCandidateV1,
  type PolicyLongitudinalControlInputV1,
  type PolicyOutcomeObservationV1
} from "../../src/lib/decision-simulation/policy-longitudinal-control-v1";

const CANDIDATE: GovernedPolicyCandidateV1 = {
  policyCandidateId: "policy:offer-framing",
  policyCandidateVersion: "v3",
  policyCandidateRef: "learning:offer-framing:v3",
  domain: "commerce.offer",
  promotedAt: "2026-09-01T00:00:00.000Z",
  candidateEvidenceRefs: ["evidence:policy-review:v3"],
  candidateSourceRefs: ["source:learning-engine"]
};

function observation(
  id: string,
  outcomeAssessment: PolicyOutcomeObservationV1["outcomeAssessment"] = "NEGATIVE",
  overrides: Partial<PolicyOutcomeObservationV1> = {}
): PolicyOutcomeObservationV1 {
  const day = String(Number(id.replace(/\D/g, "")) + 10).padStart(2, "0");
  return {
    observationId: `observation:${id}`,
    canonicalOutcomeRef: `outcome:${id}`,
    policyCandidateId: CANDIDATE.policyCandidateId,
    policyCandidateVersion: CANDIDATE.policyCandidateVersion,
    policyCandidateRef: CANDIDATE.policyCandidateRef,
    domain: CANDIDATE.domain,
    observedAt: `2026-09-${day}T12:00:00.000Z`,
    truthState: "KNOWN",
    outcomeAssessment,
    attributionClass: "OBSERVATIONAL_ASSOCIATION",
    outcomeEvidenceRef: `evidence:outcome:${id}`,
    sourceRefs: [`source:measurement:${id}`],
    confounderRefs: [`confounder-review:${id}`],
    ...overrides
  };
}

function input(
  observations: readonly PolicyOutcomeObservationV1[],
  overrides: Partial<PolicyLongitudinalControlInputV1> = {}
): PolicyLongitudinalControlInputV1 {
  return {
    candidate: CANDIDATE,
    observations,
    generatedAt: "2026-09-20T12:00:00.000Z",
    maximumObservationAgeMs: 30 * 24 * 60 * 60 * 1000,
    requiredNegativeObservations: 2,
    ...overrides
  };
}

test("routes repeated evidenced negative outcomes to experiment review without granting execution authority", () => {
  const result = reviewPolicyLongitudinalOutcomesV1(
    input([observation("1"), observation("2")])
  );

  assert.equal(result.state, "RETURN_TO_EXPERIMENT_REVIEW_REQUIRED");
  assert.equal(result.negativeObservationCount, 2);
  assert.deepEqual(result.countedNegativeObservationIds, ["observation:1", "observation:2"]);
  assert.ok(result.reasons.includes("NEGATIVE_OBSERVATION_THRESHOLD_MET"));
  assert.equal(result.policyMutationAuthorized, false);
  assert.equal(result.policyDemotionAuthorized, false);
  assert.equal(result.experimentLaunchAuthorized, false);
  assert.equal(result.rollbackExecutionAuthorized, false);
  assert.equal(result.externalActionAuthorized, false);
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.expectedOutcome, null);
});

test("does not manufacture a review trigger from one negative outcome", () => {
  const result = reviewPolicyLongitudinalOutcomesV1(input([observation("1")]));

  assert.equal(result.state, "CONTINUE_OBSERVATION");
  assert.equal(result.negativeObservationCount, 1);
  assert.ok(result.reasons.includes("INSUFFICIENT_NEGATIVE_OBSERVATIONS"));
});

test("uses an explicit caller-owned repetition threshold rather than a hidden threshold", () => {
  const observations = [observation("1"), observation("2")];
  const result = reviewPolicyLongitudinalOutcomesV1(
    input(observations, { requiredNegativeObservations: 3 })
  );

  assert.equal(result.state, "CONTINUE_OBSERVATION");
  assert.equal(result.requiredNegativeObservations, 3);
});

test("fails closed when any observation truth is partial even if another negative is known", () => {
  const result = reviewPolicyLongitudinalOutcomesV1(
    input([
      observation("1"),
      observation("2", "NEGATIVE", { truthState: "PARTIAL" }),
      observation("3")
    ])
  );

  assert.equal(result.state, "EVIDENCE_REVIEW_REQUIRED");
  assert.equal(result.negativeObservationCount, 2);
  assert.equal(result.verificationObservationCount, 1);
  assert.ok(result.reasons.includes("OBSERVATION_TRUTH_NOT_KNOWN"));
});

test("duplicate canonical outcomes cannot inflate the negative repetition count", () => {
  const first = observation("1");
  const result = reviewPolicyLongitudinalOutcomesV1(
    input([first, observation("2", "NEGATIVE", { canonicalOutcomeRef: first.canonicalOutcomeRef })])
  );

  assert.equal(result.state, "EVIDENCE_REVIEW_REQUIRED");
  assert.equal(result.negativeObservationCount, 1);
  assert.equal(result.verificationObservationCount, 1);
  assert.ok(result.reasons.includes("DUPLICATE_OUTCOME_REF"));
});

test("duplicate outcome evidence cannot masquerade as independent longitudinal support", () => {
  const first = observation("1");
  const result = reviewPolicyLongitudinalOutcomesV1(
    input([first, observation("2", "NEGATIVE", { outcomeEvidenceRef: first.outcomeEvidenceRef })])
  );

  assert.equal(result.state, "EVIDENCE_REVIEW_REQUIRED");
  assert.equal(result.negativeObservationCount, 1);
  assert.ok(result.reasons.includes("DUPLICATE_OUTCOME_EVIDENCE_REF"));
});

test("stale, future-dated, and pre-candidate outcomes cannot satisfy the threshold", () => {
  const result = reviewPolicyLongitudinalOutcomesV1(
    input([
      observation("1", "NEGATIVE", { observedAt: "2026-08-15T12:00:00.000Z" }),
      observation("2", "NEGATIVE", { observedAt: "2026-09-21T12:00:00.000Z" }),
      observation("3", "NEGATIVE", { observedAt: "2026-09-10T12:00:00.000Z" })
    ], { maximumObservationAgeMs: 7 * 24 * 60 * 60 * 1000 })
  );

  assert.equal(result.state, "EVIDENCE_REVIEW_REQUIRED");
  assert.equal(result.negativeObservationCount, 0);
  assert.equal(result.verificationObservationCount, 3);
  assert.ok(result.reasons.includes("OBSERVATION_PRECEDES_CANDIDATE"));
  assert.ok(result.reasons.includes("OBSERVATION_FUTURE_DATED"));
  assert.ok(result.reasons.includes("OBSERVATION_STALE"));
});

test("mismatched policy lineage fails closed instead of borrowing another policy outcome", () => {
  const result = reviewPolicyLongitudinalOutcomesV1(
    input([
      observation("1"),
      observation("2", "NEGATIVE", { policyCandidateVersion: "v2" })
    ])
  );

  assert.equal(result.state, "EVIDENCE_REVIEW_REQUIRED");
  assert.equal(result.negativeObservationCount, 1);
  assert.ok(result.reasons.includes("OBSERVATION_CANDIDATE_MISMATCH"));
});

test("preserves mixed outcome and attribution evidence without synthesizing confidence", () => {
  const result = reviewPolicyLongitudinalOutcomesV1(
    input([
      observation("1", "POSITIVE", { attributionClass: "CONTROLLED_EXPERIMENT" }),
      observation("2", "NEGATIVE", { attributionClass: "OBSERVATIONAL_ASSOCIATION" }),
      observation("3", "INCONCLUSIVE", { attributionClass: "UNKNOWN" })
    ])
  );

  assert.equal(result.state, "CONTINUE_OBSERVATION");
  assert.equal(result.positiveObservationCount, 1);
  assert.equal(result.negativeObservationCount, 1);
  assert.equal(result.inconclusiveObservationCount, 1);
  assert.deepEqual(result.attributionClassesObserved, [
    "CONTROLLED_EXPERIMENT",
    "OBSERVATIONAL_ASSOCIATION",
    "UNKNOWN"
  ]);
  assert.equal(result.confidence, "NOT_ESTABLISHED");
});

test("missing candidate provenance fails closed even with otherwise known negative outcomes", () => {
  const result = reviewPolicyLongitudinalOutcomesV1(
    input([observation("1"), observation("2")], {
      candidate: { ...CANDIDATE, candidateSourceRefs: [] }
    })
  );

  assert.equal(result.state, "EVIDENCE_REVIEW_REQUIRED");
  assert.equal(result.negativeObservationCount, 0);
  assert.ok(result.reasons.includes("CANDIDATE_PROVENANCE_REQUIRED"));
});

test("returns a no-observations state without pretending the candidate is safe or successful", () => {
  const result = reviewPolicyLongitudinalOutcomesV1(input([]));

  assert.equal(result.state, "NO_OBSERVATIONS");
  assert.ok(result.reasons.includes("NO_OBSERVATIONS"));
  assert.equal(result.eligibleObservationCount, 0);
});

test("rejects a hidden one-observation demotion threshold", () => {
  assert.throws(
    () => reviewPolicyLongitudinalOutcomesV1(input([], { requiredNegativeObservations: 1 })),
    (error: unknown) => error instanceof PolicyLongitudinalControlError
      && error.code === "INVALID_NEGATIVE_THRESHOLD"
  );
});

test("does not mutate caller inputs and returns deeply frozen review output", () => {
  const observations = [observation("1"), observation("2")];
  const request = input(observations);
  const before = JSON.stringify(request);
  const result = reviewPolicyLongitudinalOutcomesV1(request);

  assert.equal(JSON.stringify(request), before);
  assert.equal(Object.isFrozen(request), false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.observationReviews), true);
  assert.equal(Object.isFrozen(result.observationReviews[0]), true);
});
