import assert from "node:assert/strict";
import test from "node:test";

import {
  reviewCommercialLearningApplicationV1,
  type CommercialLearningApplicationReviewV1
} from "@/lib/intelligence/organizational-learning/commercial-learning-application-review-v1";
import {
  reviewCommercialLearningOutcomeV1,
  type CommercialLearningOutcomeReviewInputV1
} from "@/lib/intelligence/organizational-learning/commercial-learning-outcome-review-v1";
import type { DecisionMemoryRecordV1 } from "@/lib/intelligence/organizational-learning/decision-memory-v1";
import type { RecurringDecisionLessonReviewV1 } from "@/lib/intelligence/organizational-learning/recurring-decision-lessons-v1";

const applicationReviewedAt = "2026-09-18T18:30:00.000Z";
const outcomeObservedAt = "2026-09-18T20:00:00.000Z";
const reviewedAt = "2026-09-18T21:00:00.000Z";
const fourHours = 4 * 60 * 60 * 1000;

function recurringReview(
  overrides: Partial<RecurringDecisionLessonReviewV1> = {}
): RecurringDecisionLessonReviewV1 {
  return {
    version: "RECURRING_DECISION_LESSONS_V1",
    state: "REVIEW_CANDIDATE",
    reason_code: "REPEATED_APPROVED_LESSON",
    domain: "PRICING",
    pattern_key: "deposit-before-production",
    lesson_title: "Verify terms before committing production time",
    lesson_content: "In the observed cases, explicit commercial terms were reviewed before production time was committed.",
    source_learning_ids: ["lesson:1", "lesson:2"],
    decision_refs: ["decision:past:1", "decision:past:2"],
    outcome_refs: ["outcome:past:1", "outcome:past:2"],
    evidence_refs: ["evidence:lesson:1", "evidence:lesson:2"],
    source_lineage_ids: ["lineage:1", "lineage:2"],
    duplicate_observation_ids: [],
    verification_reasons: [],
    causal_interpretation: "NOT_ESTABLISHED",
    review_required: true,
    policy_promotion_allowed: false,
    pricing_change_allowed: false,
    negotiation_action_allowed: false,
    external_action_allowed: false,
    persistence_authority: false,
    ...overrides
  };
}

function application(
  domain: "PRICING" | "NEGOTIATION" = "PRICING"
): CommercialLearningApplicationReviewV1 {
  const patternKey = domain === "PRICING" ? "deposit-before-production" : "scope-before-concession";
  return reviewCommercialLearningApplicationV1({
    source: {
      review: recurringReview({ domain, pattern_key: patternKey }),
      observedAt: "2026-09-18T17:00:00.000Z",
      evidenceRefs: ["evidence:lesson:1"]
    },
    current: {
      decisionRef: "decision:current",
      domain,
      patternKey,
      observedAt: "2026-09-18T18:00:00.000Z",
      truthState: "KNOWN",
      evidenceRefs: ["evidence:current:terms", "evidence:current:pattern"],
      applicationLinkEvidenceRefs: ["evidence:current:pattern"]
    },
    reviewedAt: applicationReviewedAt
  });
}

function decision(
  overrides: Partial<DecisionMemoryRecordV1> = {}
): DecisionMemoryRecordV1 {
  return {
    contractVersion: "DecisionMemoryV1",
    policyVersion: "decision_memory_v1.0.0",
    recordId: "decision-memory:current:v1",
    decisionId: "decision:current",
    decisionClass: "PRICING",
    decidedAt: "2026-09-18T18:10:00.000Z",
    actorRef: "person:keegan",
    context: {
      state: "KNOWN",
      value: "Commercial terms for the current project",
      evidenceRefs: ["evidence:current:terms"]
    },
    selectedAlternativeId: "alternative:terms-first",
    alternatives: [
      {
        alternativeId: "alternative:terms-first",
        label: "Review terms first",
        description: {
          state: "KNOWN",
          value: "Review explicit terms before committing production time.",
          evidenceRefs: ["evidence:current:terms"]
        }
      }
    ],
    rationale: {
      state: "KNOWN",
      value: "Keep the commercial commitment explicit before production starts.",
      evidenceRefs: ["evidence:current:terms"]
    },
    assumptions: [],
    confidence: {
      state: "KNOWN",
      value: "UNKNOWN",
      evidenceRefs: ["evidence:current:terms"]
    },
    expectedOutcomes: [
      {
        outcomeId: "outcome:current:commercial",
        metricRef: null,
        description: {
          state: "KNOWN",
          value: "Observe the commercial result after the decision.",
          evidenceRefs: ["evidence:current:terms"]
        },
        expectedRange: {
          state: "UNKNOWN",
          value: null,
          evidenceRefs: []
        },
        evaluationWindowEndsAt: "2026-09-18T19:00:00.000Z"
      }
    ],
    successCriteria: [],
    failureCriteria: [],
    revisitTriggers: [],
    validUntil: null,
    approval: {
      authorityClass: "KEEGAN",
      approvalState: "APPROVED",
      approvedByRef: "person:keegan",
      approvedAt: "2026-09-18T18:10:00.000Z",
      evidenceRefs: ["evidence:approval"]
    },
    actionState: "TAKEN",
    actionEvidenceRefs: ["evidence:action:taken"],
    supersedesDecisionId: null,
    sourceRefs: ["source:commercial-current"],
    integrityFlags: [],
    outcomeObservation: {
      observationId: "observation:commercial-current",
      observedAt: outcomeObservedAt,
      outcomes: [
        {
          outcomeId: "outcome:current:commercial",
          metricRef: null,
          description: {
            state: "KNOWN",
            value: "The observed commercial outcome was recorded.",
            evidenceRefs: ["evidence:outcome:description"]
          },
          observedRange: {
            state: "UNKNOWN",
            value: null,
            evidenceRefs: []
          }
        }
      ],
      assessment: {
        state: "KNOWN",
        value: "POSITIVE",
        evidenceRefs: ["evidence:outcome:assessment"]
      },
      attributionClass: "UNKNOWN",
      attributionEvidenceRefs: [],
      confounders: [],
      assumptionAssessments: [],
      lessonCandidate: null,
      sourceRefs: ["source:outcome:current"]
    },
    priorRecordId: null,
    actionAuthority: {
      analysisOnly: true,
      persistenceAuthorized: false,
      externalActionAuthorized: false,
      pricingChangeAuthorized: false,
      negotiationAuthorized: false,
      spendAuthorized: false,
      publishAuthorized: false
    },
    ...overrides
  };
}

function input(
  overrides: Partial<CommercialLearningOutcomeReviewInputV1> = {}
): CommercialLearningOutcomeReviewInputV1 {
  return {
    application: application(),
    decision: decision(),
    reviewedAt,
    maximumOutcomeAgeMs: fourHours,
    ...overrides
  };
}

test("closes a pricing lesson application into bounded positive review evidence", () => {
  const value = reviewCommercialLearningOutcomeV1(input());

  assert.equal(value.state, "READY_FOR_LEARNING_REVIEW");
  assert.deepEqual(value.reasonCodes, ["POSITIVE_OUTCOME_READY_FOR_REVIEW"]);
  assert.equal(value.outcomeSignal, "POSITIVE_ASSOCIATION");
  assert.equal(value.observedAssessment, "POSITIVE");
  assert.equal(value.recordedAttributionClass, "UNKNOWN");
  assert.equal(value.nextInternalStep, "REVIEW_COMMERCIAL_LESSON_WITH_CURRENT_OUTCOME");
  assert.equal(value.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(value.confidence, "NOT_ESTABLISHED");
  assert.equal(value.monetaryValue, null);
  assert.equal(value.recommendedPrice, null);
  assert.equal(value.recommendedNegotiationAction, null);
  assert.equal(value.policyUpdateCandidate, null);
  assert.deepEqual(value.authority, {
    analysisOnly: true,
    lessonValidationAuthorized: false,
    priceChangeAuthorized: false,
    negotiationActionAuthorized: false,
    persistenceAuthorized: false,
    policyPromotionAuthorized: false,
    confidenceMutationAuthorized: false,
    monetaryMutationAuthorized: false,
    externalActionAuthorized: false,
    approvalBypassAuthorized: false
  });
});

test("preserves negative, neutral, and inconclusive outcomes as review signals only", () => {
  const cases = [
    ["NEGATIVE", "NEGATIVE_ASSOCIATION", "NEGATIVE_OUTCOME_READY_FOR_REVIEW"],
    ["NEUTRAL", "NEUTRAL_OBSERVATION", "NEUTRAL_OUTCOME_READY_FOR_REVIEW"],
    ["INCONCLUSIVE", "INCONCLUSIVE_OBSERVATION", "INCONCLUSIVE_OUTCOME_READY_FOR_REVIEW"]
  ] as const;

  for (const [assessment, signal, reason] of cases) {
    const base = decision();
    const value = reviewCommercialLearningOutcomeV1(input({
      decision: {
        ...base,
        outcomeObservation: {
          ...base.outcomeObservation!,
          assessment: {
            state: "KNOWN",
            value: assessment,
            evidenceRefs: ["evidence:outcome:assessment"]
          }
        }
      }
    }));
    assert.equal(value.state, "READY_FOR_LEARNING_REVIEW");
    assert.equal(value.outcomeSignal, signal);
    assert.deepEqual(value.reasonCodes, [reason]);
    assert.equal(value.causalInterpretation, "NOT_ESTABLISHED");
  }
});

test("supports negotiation review without granting negotiation authority", () => {
  const current = decision({ decisionClass: "NEGOTIATION" });
  const value = reviewCommercialLearningOutcomeV1(input({
    application: application("NEGOTIATION"),
    decision: current
  }));

  assert.equal(value.state, "READY_FOR_LEARNING_REVIEW");
  assert.equal(value.domain, "NEGOTIATION");
  assert.equal(value.recommendedNegotiationAction, null);
  assert.equal(value.authority.negotiationActionAuthorized, false);
});

test("waits when no outcome exists instead of inventing success or failure", () => {
  const value = reviewCommercialLearningOutcomeV1(input({
    decision: decision({ outcomeObservation: null })
  }));

  assert.equal(value.state, "WAITING_FOR_OUTCOME");
  assert.deepEqual(value.reasonCodes, ["OUTCOME_NOT_OBSERVED"]);
  assert.equal(value.observedAssessment, null);
  assert.equal(value.outcomeSignal, null);
  assert.equal(value.nextInternalStep, null);
});

test("waits on an explicitly unknown outcome assessment", () => {
  const base = decision();
  const value = reviewCommercialLearningOutcomeV1(input({
    decision: {
      ...base,
      outcomeObservation: {
        ...base.outcomeObservation!,
        assessment: {
          state: "KNOWN",
          value: "UNKNOWN",
          evidenceRefs: ["evidence:outcome:assessment"]
        }
      }
    }
  }));

  assert.equal(value.state, "WAITING_FOR_OUTCOME");
  assert.deepEqual(value.reasonCodes, ["OUTCOME_ASSESSMENT_UNKNOWN"]);
  assert.equal(value.outcomeSignal, null);
});

test("preserves the recorded attribution class but never upgrades causal interpretation", () => {
  for (const attributionClass of ["CAUSAL", "CONTRIBUTORY", "CORRELATIONAL", "UNKNOWN"] as const) {
    const base = decision();
    const value = reviewCommercialLearningOutcomeV1(input({
      decision: {
        ...base,
        outcomeObservation: {
          ...base.outcomeObservation!,
          attributionClass,
          attributionEvidenceRefs: attributionClass === "UNKNOWN" ? [] : ["evidence:attribution"]
        }
      }
    }));
    assert.equal(value.state, "READY_FOR_LEARNING_REVIEW");
    assert.equal(value.recordedAttributionClass, attributionClass);
    assert.equal(value.causalInterpretation, "NOT_ESTABLISHED");
  }
});

test("requires exact decision identity and commercial domain", () => {
  const wrongId = reviewCommercialLearningOutcomeV1(input({
    decision: decision({ decisionId: "decision:other" })
  }));
  assert.equal(wrongId.state, "VERIFY");
  assert.ok(wrongId.reasonCodes.includes("DECISION_ID_MISMATCH"));

  const wrongDomain = reviewCommercialLearningOutcomeV1(input({
    decision: decision({ decisionClass: "CAMPAIGN" })
  }));
  assert.equal(wrongDomain.state, "VERIFY");
  assert.ok(wrongDomain.reasonCodes.includes("DECISION_DOMAIN_MISMATCH"));
});

test("fails closed on decision integrity or missing action evidence", () => {
  const integrity = reviewCommercialLearningOutcomeV1(input({
    decision: decision({ integrityFlags: ["RATIONALE_UNSUPPORTED"] })
  }));
  assert.equal(integrity.state, "VERIFY");
  assert.ok(integrity.reasonCodes.includes("DECISION_INTEGRITY_FAILED"));

  const planned = reviewCommercialLearningOutcomeV1(input({
    decision: decision({ actionState: "PLANNED" })
  }));
  assert.equal(planned.state, "VERIFY");
  assert.ok(planned.reasonCodes.includes("ACTION_NOT_OBSERVED"));

  const noActionEvidence = reviewCommercialLearningOutcomeV1(input({
    decision: decision({ actionEvidenceRefs: [] })
  }));
  assert.equal(noActionEvidence.state, "VERIFY");
  assert.ok(noActionEvidence.reasonCodes.includes("ACTION_EVIDENCE_MISSING"));
});

test("requires a known evidence-backed assessment", () => {
  const base = decision();
  const inferred = reviewCommercialLearningOutcomeV1(input({
    decision: {
      ...base,
      outcomeObservation: {
        ...base.outcomeObservation!,
        assessment: {
          state: "INFERRED",
          value: "POSITIVE",
          evidenceRefs: ["evidence:outcome:assessment"]
        }
      }
    }
  }));
  assert.equal(inferred.state, "VERIFY");
  assert.ok(inferred.reasonCodes.includes("OUTCOME_ASSESSMENT_NOT_KNOWN"));

  const noEvidence = reviewCommercialLearningOutcomeV1(input({
    decision: {
      ...base,
      outcomeObservation: {
        ...base.outcomeObservation!,
        assessment: {
          state: "KNOWN",
          value: "POSITIVE",
          evidenceRefs: []
        }
      }
    }
  }));
  assert.equal(noEvidence.state, "VERIFY");
  assert.ok(noEvidence.reasonCodes.includes("OUTCOME_ASSESSMENT_EVIDENCE_MISSING"));
});

test("refuses stale, future, or pre-application outcomes", () => {
  const staleBase = decision();
  const stale = reviewCommercialLearningOutcomeV1(input({
    decision: {
      ...staleBase,
      outcomeObservation: {
        ...staleBase.outcomeObservation!,
        observedAt: "2026-09-18T19:00:00.000Z"
      }
    },
    reviewedAt: "2026-09-19T01:00:00.000Z",
    maximumOutcomeAgeMs: 60 * 60 * 1000
  }));
  assert.equal(stale.state, "VERIFY");
  assert.ok(stale.reasonCodes.includes("OUTCOME_STALE"));

  const futureBase = decision();
  const future = reviewCommercialLearningOutcomeV1(input({
    decision: {
      ...futureBase,
      outcomeObservation: {
        ...futureBase.outcomeObservation!,
        observedAt: "2026-09-19T01:00:00.000Z"
      }
    }
  }));
  assert.equal(future.state, "VERIFY");
  assert.ok(future.reasonCodes.includes("OUTCOME_IN_FUTURE"));

  const earlyBase = decision();
  const early = reviewCommercialLearningOutcomeV1(input({
    decision: {
      ...earlyBase,
      outcomeObservation: {
        ...earlyBase.outcomeObservation!,
        observedAt: "2026-09-18T18:20:00.000Z"
      }
    }
  }));
  assert.equal(early.state, "VERIFY");
  assert.ok(early.reasonCodes.includes("OUTCOME_OBSERVED_BEFORE_APPLICATION_REVIEW"));
});

test("rejects observed outcome ids outside the recorded measurement plan", () => {
  const base = decision();
  const value = reviewCommercialLearningOutcomeV1(input({
    decision: {
      ...base,
      outcomeObservation: {
        ...base.outcomeObservation!,
        outcomes: [
          {
            ...base.outcomeObservation!.outcomes[0],
            outcomeId: "outcome:unexpected"
          }
        ]
      }
    }
  }));

  assert.equal(value.state, "VERIFY");
  assert.ok(value.reasonCodes.includes("OUTCOME_ID_UNEXPECTED"));
});

test("rejects a forged application that widens price or negotiation authority", () => {
  const canonical = application();
  const forged = {
    ...canonical,
    authority: {
      ...canonical.authority,
      priceChangeAuthorized: true
    }
  } as unknown as CommercialLearningApplicationReviewV1;
  const value = reviewCommercialLearningOutcomeV1(input({ application: forged }));

  assert.equal(value.state, "VERIFY");
  assert.ok(value.reasonCodes.includes("APPLICATION_AUTHORITY_INVARIANT_FAILED"));
  assert.equal(value.recommendedPrice, null);
  assert.equal(value.authority.priceChangeAuthorized, false);
});

test("output is deterministic, deeply immutable, and does not mutate caller input", () => {
  const original = input();
  const before = structuredClone(original);
  const first = reviewCommercialLearningOutcomeV1(original);
  const second = reviewCommercialLearningOutcomeV1(structuredClone(original));

  assert.deepEqual(first, second);
  assert.deepEqual(original, before);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.authority));
  assert.ok(Object.isFrozen(first.outcomeEvidenceRefs));
  assert.ok(Object.isFrozen(first.limitations));
  assert.throws(() => (first.outcomeEvidenceRefs as string[]).push("evidence:forged"));
});
