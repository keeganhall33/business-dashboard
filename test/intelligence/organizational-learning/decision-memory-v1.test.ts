import assert from "node:assert/strict";
import test from "node:test";

import {
  attachDecisionOutcomeObservationV1,
  compileDecisionMemoryV1,
  DecisionMemoryError,
  type DecisionMemoryInputV1,
  type DecisionOutcomeObservationInputV1
} from "../../../src/lib/intelligence/organizational-learning/decision-memory-v1";

function decisionInput(overrides: Partial<DecisionMemoryInputV1> = {}): DecisionMemoryInputV1 {
  return {
    decisionId: "decision-pricing-1",
    decisionClass: "PRICING",
    decidedAt: "2026-09-18T06:00:00.000Z",
    actorRef: "person:keegan",
    context: {
      state: "KNOWN",
      value: "Choose a bounded price for a documented collector offer.",
      evidenceRefs: ["evidence:context"]
    },
    selectedAlternativeId: "alt-hold",
    alternatives: [
      {
        alternativeId: "alt-hold",
        label: "Hold current asking price",
        description: {
          state: "KNOWN",
          value: "Keep the documented asking price unchanged.",
          evidenceRefs: ["evidence:alternative:hold"]
        }
      },
      {
        alternativeId: "alt-discount",
        label: "Offer a bounded concession",
        description: {
          state: "INFERRED",
          value: "Consider a concession only if supported by negotiation context.",
          evidenceRefs: ["evidence:alternative:discount"]
        }
      }
    ],
    rationale: {
      state: "KNOWN",
      value: "Preserve pricing position while the buyer has not supplied evidence requiring a concession.",
      evidenceRefs: ["evidence:rationale"]
    },
    assumptions: [
      {
        assumptionId: "assumption-budget",
        statement: {
          state: "INFERRED",
          value: "The buyer may still have flexibility inside the stated budget.",
          evidenceRefs: ["evidence:budget-context"]
        },
        material: true,
        revisitTrigger: "Buyer documents a hard budget ceiling."
      },
      {
        assumptionId: "assumption-timing",
        statement: {
          state: "UNKNOWN",
          value: "This unsupported timing guess must not survive.",
          evidenceRefs: []
        },
        material: false,
        revisitTrigger: null
      }
    ],
    confidence: {
      state: "KNOWN",
      value: "MEDIUM",
      evidenceRefs: ["evidence:confidence"]
    },
    expectedOutcomes: [
      {
        outcomeId: "outcome-price",
        metricRef: "deal:asking-price",
        description: {
          state: "KNOWN",
          value: "Maintain the documented asking position until new evidence arrives.",
          evidenceRefs: ["evidence:expected:position"]
        },
        expectedRange: {
          state: "KNOWN",
          value: { min: 40_000, max: 75_000, unit: "USD" },
          evidenceRefs: ["evidence:expected:range"]
        },
        evaluationWindowEndsAt: "2026-10-18T06:00:00.000Z"
      }
    ],
    successCriteria: [
      {
        state: "KNOWN",
        value: "A documented agreement is reached without an unsupported price concession.",
        evidenceRefs: ["evidence:success"]
      }
    ],
    failureCriteria: [
      {
        state: "KNOWN",
        value: "New evidence shows the current structure is no longer viable.",
        evidenceRefs: ["evidence:failure"]
      }
    ],
    revisitTriggers: ["Buyer documents a different budget.", "Rights or scope materially change."],
    validUntil: "2026-10-18T06:00:00.000Z",
    approval: {
      authorityClass: "KEEGAN_BUSINESS_JUDGMENT",
      approvalState: "APPROVED",
      approvedByRef: "person:keegan",
      approvedAt: "2026-09-18T06:00:00.000Z",
      evidenceRefs: ["evidence:approval"]
    },
    actionState: "PLANNED",
    actionEvidenceRefs: ["evidence:action-plan"],
    supersedesDecisionId: null,
    sourceRefs: ["source:crm:opportunity-1", "source:conversation:1"],
    ...overrides
  };
}

function outcomeInput(
  overrides: Partial<DecisionOutcomeObservationInputV1> = {}
): DecisionOutcomeObservationInputV1 {
  return {
    observedAt: "2026-10-01T06:00:00.000Z",
    outcomes: [
      {
        outcomeId: "outcome-price",
        metricRef: "deal:agreed-price",
        description: {
          state: "KNOWN",
          value: "The documented agreement was reached at a price inside the supported range.",
          evidenceRefs: ["evidence:agreement"]
        },
        observedRange: {
          state: "KNOWN",
          value: { min: 50_000, max: 50_000, unit: "USD" },
          evidenceRefs: ["evidence:agreement:price"]
        }
      }
    ],
    assessment: {
      state: "KNOWN",
      value: "POSITIVE",
      evidenceRefs: ["evidence:outcome:assessment"]
    },
    attributionClass: "CORRELATIONAL",
    attributionEvidenceRefs: ["evidence:sequence-only"],
    confounders: [
      {
        confounderId: "confounder-buyer-preference",
        description: "The buyer's independent preference may have affected the result.",
        evidenceRefs: ["evidence:buyer-preference"]
      }
    ],
    assumptionAssessments: [
      {
        assumptionId: "assumption-budget",
        assessment: "SUPPORTED",
        evidenceRefs: ["evidence:budget-followup"]
      }
    ],
    lessonCandidate: {
      statement: "Holding price may be useful when budget flexibility is evidenced, but this single outcome is not a universal pricing rule.",
      evidenceRefs: ["evidence:agreement", "evidence:budget-followup"]
    },
    sourceRefs: ["source:crm:closed-deal-1"],
    ...overrides
  };
}

test("preserves evidence-linked decision rationale, alternatives, assumptions, and revisit triggers", () => {
  const record = compileDecisionMemoryV1(decisionInput());

  assert.equal(record.decisionClass, "PRICING");
  assert.equal(record.selectedAlternativeId, "alt-hold");
  assert.equal(record.rationale.value?.startsWith("Preserve pricing position"), true);
  assert.equal(record.alternatives.length, 2);
  assert.equal(record.assumptions.length, 2);
  assert.deepEqual(record.revisitTriggers, [
    "Buyer documents a different budget.",
    "Rights or scope materially change."
  ]);
  assert.equal(record.assumptions[1].statement.state, "UNKNOWN");
  assert.equal(record.assumptions[1].statement.value, null);
  assert.deepEqual(record.assumptions[1].statement.evidenceRefs, []);
});

test("keeps unresolved and conflicted assumptions explicit instead of upgrading them to truth", () => {
  const request = decisionInput();
  request.assumptions = [
    {
      assumptionId: "assumption-conflict",
      statement: {
        state: "CONFLICTED",
        value: "One narrative says this is settled.",
        evidenceRefs: ["evidence:a", "evidence:b"]
      },
      material: true,
      revisitTrigger: "Resolve the conflicting sources."
    }
  ];

  const record = compileDecisionMemoryV1(request);
  assert.equal(record.assumptions[0].statement.state, "CONFLICTED");
  assert.equal(record.assumptions[0].statement.value, null);
  assert.ok(record.integrityFlags.includes("MATERIAL_ASSUMPTION_UNRESOLVED"));
});

test("refuses unsupported confidence and monetary precision", () => {
  const request = decisionInput({
    confidence: {
      state: "INFERRED",
      value: "HIGH",
      evidenceRefs: []
    },
    expectedOutcomes: [
      {
        outcomeId: "outcome-price",
        metricRef: "deal:price",
        description: {
          state: "UNKNOWN",
          value: "Unsupported expected outcome",
          evidenceRefs: []
        },
        expectedRange: {
          state: "KNOWN",
          value: { min: 100_000, max: 200_000, unit: "USD" },
          evidenceRefs: []
        },
        evaluationWindowEndsAt: null
      }
    ]
  });

  const record = compileDecisionMemoryV1(request);
  assert.equal(record.confidence.value, null);
  assert.ok(record.integrityFlags.includes("CONFIDENCE_UNSUPPORTED"));
  assert.equal(record.expectedOutcomes[0].description.value, null);
  assert.equal(record.expectedOutcomes[0].expectedRange.value, null);
  assert.ok(record.integrityFlags.includes("EXPECTED_OUTCOME_UNSUPPORTED"));
});

test("attaches observed outcomes without converting correlation into causality", () => {
  const base = compileDecisionMemoryV1(decisionInput());
  const observed = attachDecisionOutcomeObservationV1(base, outcomeInput());

  assert.equal(observed.priorRecordId, base.recordId);
  assert.equal(base.outcomeObservation, null);
  assert.equal(observed.outcomeObservation?.attributionClass, "CORRELATIONAL");
  assert.equal(observed.outcomeObservation?.outcomes[0].observedRange.value?.min, 50_000);
  assert.equal(observed.outcomeObservation?.confounders.length, 1);
  assert.equal(
    observed.outcomeObservation?.confounders[0].description,
    "The buyer's independent preference may have affected the result."
  );
});

test("fails closed when a causal attribution has no supporting attribution evidence", () => {
  const base = compileDecisionMemoryV1(decisionInput());
  const observed = attachDecisionOutcomeObservationV1(
    base,
    outcomeInput({ attributionClass: "CAUSAL", attributionEvidenceRefs: [] })
  );

  assert.equal(observed.outcomeObservation?.attributionClass, "UNKNOWN");
  assert.deepEqual(observed.outcomeObservation?.attributionEvidenceRefs, []);
});

test("does not retain unsupported observed outcomes or assessments", () => {
  const base = compileDecisionMemoryV1(decisionInput());
  const observed = attachDecisionOutcomeObservationV1(
    base,
    outcomeInput({
      outcomes: [
        {
          outcomeId: "outcome-price",
          metricRef: "deal:agreed-price",
          description: {
            state: "UNKNOWN",
            value: "Unsupported narrative",
            evidenceRefs: []
          },
          observedRange: {
            state: "KNOWN",
            value: { min: 80_000, max: 80_000, unit: "USD" },
            evidenceRefs: []
          }
        }
      ],
      assessment: {
        state: "INFERRED",
        value: "POSITIVE",
        evidenceRefs: []
      }
    })
  );

  assert.equal(observed.outcomeObservation?.outcomes[0].description.value, null);
  assert.equal(observed.outcomeObservation?.outcomes[0].observedRange.value, null);
  assert.equal(observed.outcomeObservation?.assessment.value, null);
});

test("keeps pricing and negotiation lessons as governed review candidates only", () => {
  for (const decisionClass of ["PRICING", "NEGOTIATION"] as const) {
    const base = compileDecisionMemoryV1(decisionInput({ decisionClass }));
    const observed = attachDecisionOutcomeObservationV1(base, outcomeInput());
    const lesson = observed.outcomeObservation?.lessonCandidate;

    assert.equal(lesson?.reviewState, "GOVERNED_REVIEW_REQUIRED");
    assert.equal(lesson?.policyPromotionAuthorized, false);
    assert.equal(lesson?.pricingRulePromotionAuthorized, false);
    assert.equal(lesson?.negotiationRulePromotionAuthorized, false);
    assert.equal(lesson?.capabilityPromotionAuthorized, false);
  }
});

test("preserves supersession lineage instead of silently overwriting the prior decision", () => {
  const prior = compileDecisionMemoryV1(decisionInput());
  const successor = compileDecisionMemoryV1(
    decisionInput({
      decisionId: "decision-pricing-2",
      supersedesDecisionId: prior.decisionId,
      decidedAt: "2026-09-25T06:00:00.000Z",
      rationale: {
        state: "KNOWN",
        value: "New documented buyer information changes the preferred structure.",
        evidenceRefs: ["evidence:new-buyer-info"]
      }
    })
  );

  assert.equal(successor.supersedesDecisionId, prior.decisionId);
  assert.notEqual(successor.recordId, prior.recordId);
  assert.equal(prior.supersedesDecisionId, null);
});

test("unresolved assumption outcomes remain unresolved when evidence is missing", () => {
  const base = compileDecisionMemoryV1(decisionInput());
  const observed = attachDecisionOutcomeObservationV1(
    base,
    outcomeInput({
      assumptionAssessments: [
        {
          assumptionId: "assumption-budget",
          assessment: "SUPPORTED",
          evidenceRefs: []
        }
      ]
    })
  );

  assert.equal(observed.outcomeObservation?.assumptionAssessments[0].assessment, "UNRESOLVED");
});

test("rejects an outcome assessment for an assumption that was never part of the decision", () => {
  const base = compileDecisionMemoryV1(decisionInput());
  assert.throws(
    () =>
      attachDecisionOutcomeObservationV1(
        base,
        outcomeInput({
          assumptionAssessments: [
            {
              assumptionId: "assumption-invented-later",
              assessment: "SUPPORTED",
              evidenceRefs: ["evidence:invented"]
            }
          ]
        })
      ),
    (error: unknown) => error instanceof DecisionMemoryError && error.code === "UNKNOWN_ASSUMPTION"
  );
});

test("is deterministic, immutable, and does not mutate inputs", () => {
  const request = decisionInput();
  const before = structuredClone(request);
  const first = compileDecisionMemoryV1(request);
  const second = compileDecisionMemoryV1(request);

  assert.deepEqual(request, before);
  assert.deepEqual(first, second);
  assert.equal(first.recordId, second.recordId);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.alternatives));
  assert.ok(Object.isFrozen(first.assumptions));

  const observationRequest = outcomeInput();
  const observationBefore = structuredClone(observationRequest);
  const observedA = attachDecisionOutcomeObservationV1(first, observationRequest);
  const observedB = attachDecisionOutcomeObservationV1(first, observationRequest);
  assert.deepEqual(observationRequest, observationBefore);
  assert.deepEqual(observedA, observedB);
  assert.ok(Object.isFrozen(observedA.outcomeObservation));
});

test("grants no canonical persistence or consequential business action authority", () => {
  const record = compileDecisionMemoryV1(decisionInput());

  assert.deepEqual(record.actionAuthority, {
    analysisOnly: true,
    persistenceAuthorized: false,
    externalActionAuthorized: false,
    pricingChangeAuthorized: false,
    negotiationAuthorized: false,
    spendAuthorized: false,
    publishAuthorized: false
  });

  const observed = attachDecisionOutcomeObservationV1(record, outcomeInput());
  assert.deepEqual(observed.actionAuthority, record.actionAuthority);
});

test("rejects malformed ranges and selected-alternative gaps are visible integrity flags", () => {
  assert.throws(
    () =>
      compileDecisionMemoryV1(
        decisionInput({
          expectedOutcomes: [
            {
              outcomeId: "bad-range",
              metricRef: "deal:price",
              description: {
                state: "KNOWN",
                value: "Malformed expected range.",
                evidenceRefs: ["evidence:description"]
              },
              expectedRange: {
                state: "KNOWN",
                value: { min: 20, max: 10, unit: "USD" },
                evidenceRefs: ["evidence:range"]
              },
              evaluationWindowEndsAt: null
            }
          ]
        })
      ),
    (error: unknown) => error instanceof DecisionMemoryError && error.code === "INVALID_RANGE"
  );

  const missingSelected = compileDecisionMemoryV1(
    decisionInput({ selectedAlternativeId: "alt-does-not-exist" })
  );
  assert.ok(missingSelected.integrityFlags.includes("SELECTED_ALTERNATIVE_MISSING"));
});
