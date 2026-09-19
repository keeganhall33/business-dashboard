import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCompanyBrainAssumptionReviewV1
} from "../../../src/lib/intelligence/organizational-learning/company-brain-assumption-review-v1";
import {
  attachDecisionOutcomeObservationV1,
  compileDecisionMemoryV1,
  type AssumptionOutcomeV1,
  type DecisionMemoryClassV1,
  type DecisionMemoryRecordV1
} from "../../../src/lib/intelligence/organizational-learning/decision-memory-v1";

const generatedAt = "2026-09-19T01:00:00.000Z";

function record(args: {
  decisionId: string;
  decisionClass?: DecisionMemoryClassV1;
  assumptionId?: string;
  validUntil?: string | null;
}): DecisionMemoryRecordV1 {
  const assumptionId = args.assumptionId ?? `assumption:${args.decisionId}`;
  return compileDecisionMemoryV1({
    decisionId: args.decisionId,
    decisionClass: args.decisionClass ?? "STRATEGY",
    decidedAt: "2026-09-18T18:00:00.000Z",
    actorRef: "person:keegan",
    context: {
      state: "KNOWN",
      value: "A material business decision with recorded evidence.",
      evidenceRefs: [`evidence:context:${args.decisionId}`]
    },
    selectedAlternativeId: `alternative:${args.decisionId}`,
    alternatives: [{
      alternativeId: `alternative:${args.decisionId}`,
      label: "Evidence-bounded option",
      description: {
        state: "KNOWN",
        value: "Proceed only while the recorded assumptions remain supportable.",
        evidenceRefs: [`evidence:alternative:${args.decisionId}`]
      }
    }],
    rationale: {
      state: "KNOWN",
      value: "The selected option preserves reversibility while evidence is gathered.",
      evidenceRefs: [`evidence:rationale:${args.decisionId}`]
    },
    assumptions: [{
      assumptionId,
      statement: {
        state: "KNOWN",
        value: `Material assumption for ${args.decisionId}`,
        evidenceRefs: [`evidence:assumption:${args.decisionId}`]
      },
      material: true,
      revisitTrigger: "Revisit when direct outcome evidence changes this assumption."
    }],
    confidence: {
      state: "KNOWN",
      value: "MEDIUM",
      evidenceRefs: [`evidence:confidence:${args.decisionId}`]
    },
    expectedOutcomes: [],
    successCriteria: [],
    failureCriteria: [],
    revisitTriggers: [],
    validUntil: args.validUntil ?? "2026-09-25T00:00:00.000Z",
    approval: {
      authorityClass: "KEEGAN_BUSINESS_JUDGMENT",
      approvalState: "NOT_REQUIRED",
      approvedByRef: null,
      approvedAt: null,
      evidenceRefs: []
    },
    actionState: "TAKEN",
    actionEvidenceRefs: [`evidence:action:${args.decisionId}`],
    supersedesDecisionId: null,
    sourceRefs: [`source:${args.decisionId}`]
  });
}

function withAssumptionOutcome(
  source: DecisionMemoryRecordV1,
  assessment: AssumptionOutcomeV1
): DecisionMemoryRecordV1 {
  const assumption = source.assumptions[0];
  assert.ok(assumption);
  return attachDecisionOutcomeObservationV1(source, {
    observedAt: "2026-09-19T00:30:00.000Z",
    outcomes: [],
    assessment: {
      state: "KNOWN",
      value: "INCONCLUSIVE",
      evidenceRefs: [`evidence:outcome:${source.decisionId}`]
    },
    attributionClass: "UNKNOWN",
    attributionEvidenceRefs: [],
    confounders: [],
    assumptionAssessments: [{
      assumptionId: assumption.assumptionId,
      assessment,
      evidenceRefs: [`evidence:assessment:${source.decisionId}`]
    }],
    lessonCandidate: null,
    sourceRefs: [`source:outcome:${source.decisionId}`]
  });
}

test("separates refuted, unresolved, supported, and not-yet-observed material assumptions", () => {
  const pricingRefuted = withAssumptionOutcome(record({
    decisionId: "decision:pricing-refuted",
    decisionClass: "PRICING"
  }), "REFUTED");
  const negotiationRefuted = withAssumptionOutcome(record({
    decisionId: "decision:negotiation-refuted",
    decisionClass: "NEGOTIATION"
  }), "REFUTED");
  const supported = withAssumptionOutcome(record({
    decisionId: "decision:supported"
  }), "SUPPORTED");
  const unresolved = withAssumptionOutcome(record({
    decisionId: "decision:unresolved"
  }), "UNRESOLVED");
  const waiting = record({ decisionId: "decision:waiting" });

  const result = compileCompanyBrainAssumptionReviewV1({
    records: [waiting, supported, negotiationRefuted, unresolved, pricingRefuted],
    generatedAt
  });

  assert.equal(result.state, "READY");
  assert.deepEqual(result.verificationReasons, []);
  assert.deepEqual(result.summary, {
    suppliedRecords: 5,
    acceptedRecords: 5,
    rejectedRecords: 0,
    materialAssumptions: 5,
    supported: 1,
    refuted: 2,
    unresolved: 1,
    notObserved: 1,
    verificationRequired: 0,
    decisionRevisit: 2,
    evidenceNeeded: 1,
    supportedReview: 1,
    waitingOutcome: 1,
    pricingAssumptionsRequiringRevisit: 1,
    negotiationAssumptionsRequiringRevisit: 1
  });
  assert.deepEqual(result.decisionRevisit.map((item) => item.decisionId), [
    "decision:negotiation-refuted",
    "decision:pricing-refuted"
  ]);
  assert.equal(result.evidenceNeeded[0]?.assessment, "UNRESOLVED");
  assert.equal(result.supportedReview[0]?.assessment, "SUPPORTED");
  assert.equal(result.waitingOutcome[0]?.assessment, "NOT_OBSERVED");
  assert.equal(result.supportedReview[0]?.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.supportedReview[0]?.confidence, "NOT_ESTABLISHED");
  assert.equal(result.supportedReview[0]?.monetaryValue, null);
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.inferredOutcome, null);
  assert.equal(result.authority.learningPromotionAuthorized, false);
  assert.equal(result.authority.policyPromotionAuthorized, false);
  assert.equal(result.authority.pricingChangeAuthorized, false);
  assert.equal(result.authority.negotiationActionAuthorized, false);
  assert.equal(result.authority.reallocationAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
  assert.equal(result.authority.approvalBypassAuthorized, false);
});

test("routes an expired decision to review without pretending the assumption was refuted", () => {
  const supportedButExpired = withAssumptionOutcome(record({
    decisionId: "decision:expired",
    decisionClass: "PRICING",
    validUntil: "2026-09-18T23:00:00.000Z"
  }), "SUPPORTED");

  const result = compileCompanyBrainAssumptionReviewV1({
    records: [supportedButExpired],
    generatedAt
  });

  assert.equal(result.state, "READY");
  assert.equal(result.summary.supported, 1);
  assert.equal(result.summary.refuted, 0);
  assert.equal(result.summary.decisionRevisit, 1);
  assert.equal(result.decisionRevisit[0]?.assessment, "SUPPORTED");
  assert.deepEqual(result.decisionRevisit[0]?.reasonCodes, ["DECISION_VALIDITY_EXPIRED"]);
});

test("fails closed on widened authority and future outcome chronology while preserving valid records", () => {
  const valid = withAssumptionOutcome(record({ decisionId: "decision:valid" }), "SUPPORTED");
  const canonicalWidened = record({ decisionId: "decision:widened" });
  const widened = {
    ...structuredClone(canonicalWidened),
    actionAuthority: {
      ...structuredClone(canonicalWidened.actionAuthority),
      pricingChangeAuthorized: true
    }
  } as unknown as DecisionMemoryRecordV1;
  const futureBase = record({ decisionId: "decision:future" });
  const future = attachDecisionOutcomeObservationV1(futureBase, {
    observedAt: "2026-09-20T00:00:00.000Z",
    outcomes: [],
    assessment: {
      state: "KNOWN",
      value: "INCONCLUSIVE",
      evidenceRefs: ["evidence:future-outcome"]
    },
    attributionClass: "UNKNOWN",
    attributionEvidenceRefs: [],
    confounders: [],
    assumptionAssessments: [{
      assumptionId: futureBase.assumptions[0]!.assumptionId,
      assessment: "SUPPORTED",
      evidenceRefs: ["evidence:future-assessment"]
    }],
    lessonCandidate: null,
    sourceRefs: ["source:future-outcome"]
  });

  const result = compileCompanyBrainAssumptionReviewV1({
    records: [valid, widened, future],
    generatedAt
  });

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.equal(result.summary.suppliedRecords, 3);
  assert.equal(result.summary.acceptedRecords, 1);
  assert.equal(result.summary.rejectedRecords, 2);
  assert.equal(result.summary.materialAssumptions, 1);
  assert.equal(result.supportedReview[0]?.decisionId, "decision:valid");
  assert.ok(result.verificationReasons.some((reason) =>
    reason === "decision:widened:AUTHORITY_WIDENED"
  ));
  assert.ok(result.verificationReasons.some((reason) =>
    reason === "decision:future:DECISION_BRIEF_VERIFY_INTEGRITY"
  ));
  assert.equal(result.sourceDecisionIds.includes("decision:widened"), false);
  assert.equal(result.sourceDecisionIds.includes("decision:future"), false);
});

test("keeps observed outcomes without an assumption assessment as an evidence gap", () => {
  const source = record({ decisionId: "decision:not-assessed" });
  const observed = attachDecisionOutcomeObservationV1(source, {
    observedAt: "2026-09-19T00:30:00.000Z",
    outcomes: [],
    assessment: {
      state: "KNOWN",
      value: "POSITIVE",
      evidenceRefs: ["evidence:observed-outcome"]
    },
    attributionClass: "CORRELATIONAL",
    attributionEvidenceRefs: ["evidence:correlation-only"],
    confounders: [{
      confounderId: "confounder:timing",
      description: "Another timing change occurred during the same window.",
      evidenceRefs: ["evidence:timing-change"]
    }],
    assumptionAssessments: [],
    lessonCandidate: null,
    sourceRefs: ["source:observed-outcome"]
  });

  const result = compileCompanyBrainAssumptionReviewV1({ records: [observed], generatedAt });

  assert.equal(result.state, "READY");
  assert.equal(result.summary.evidenceNeeded, 1);
  assert.equal(result.evidenceNeeded[0]?.assessment, "UNRESOLVED");
  assert.deepEqual(result.evidenceNeeded[0]?.reasonCodes, ["ASSUMPTION_NOT_ASSESSED"]);
  assert.equal(result.evidenceNeeded[0]?.causalInterpretation, "NOT_ESTABLISHED");
});

test("is deterministic, deeply immutable, and does not mutate canonical Decision Memory", () => {
  const records = [
    withAssumptionOutcome(record({ decisionId: "decision:a" }), "SUPPORTED"),
    record({ decisionId: "decision:b" })
  ];
  const before = structuredClone(records);

  const first = compileCompanyBrainAssumptionReviewV1({ records, generatedAt });
  const second = compileCompanyBrainAssumptionReviewV1({ records: [...records].reverse(), generatedAt });

  assert.deepEqual(first.summary, second.summary);
  assert.deepEqual(first.supportedReview, second.supportedReview);
  assert.deepEqual(first.waitingOutcome, second.waitingOutcome);
  assert.deepEqual(records, before);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.summary));
  assert.ok(Object.isFrozen(first.supportedReview));
  assert.ok(Object.isFrozen(first.supportedReview[0]));
  assert.ok(first.evidenceRefs.includes("evidence:assessment:decision:a"));
  assert.ok(first.sourceRefs.includes("source:outcome:decision:a"));
});
