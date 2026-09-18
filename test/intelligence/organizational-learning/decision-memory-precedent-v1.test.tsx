import assert from "node:assert/strict";
import test from "node:test";

import { retrieveDecisionPrecedentsV1 } from "../../../src/lib/executive-memory/retrieval";
import {
  attachDecisionOutcomeObservationV1,
  compileDecisionMemoryV1,
  type DecisionMemoryInputV1,
  type DecisionOutcomeObservationInputV1
} from "../../../src/lib/intelligence/organizational-learning/decision-memory-v1";
import { compileDecisionMemoryPrecedentV1 } from "../../../src/lib/intelligence/organizational-learning/decision-memory-precedent-v1";

function decisionInput(overrides: Partial<DecisionMemoryInputV1> = {}): DecisionMemoryInputV1 {
  return {
    decisionId: "decision-pricing-history-1",
    decisionClass: "PRICING",
    decidedAt: "2026-09-01T10:00:00.000Z",
    actorRef: "person:keegan",
    context: {
      state: "KNOWN",
      value: "Choose a documented pricing posture for a collector opportunity.",
      evidenceRefs: ["evidence:context"]
    },
    selectedAlternativeId: "alt-hold",
    alternatives: [
      {
        alternativeId: "alt-hold",
        label: "Hold documented asking price",
        description: {
          state: "KNOWN",
          value: "Keep the documented asking price unchanged.",
          evidenceRefs: ["evidence:alt:hold"]
        }
      },
      {
        alternativeId: "alt-adjust",
        label: "Prepare a bounded alternative",
        description: {
          state: "INFERRED",
          value: "Prepare another structure only if new evidence supports it.",
          evidenceRefs: ["evidence:alt:adjust"]
        }
      }
    ],
    rationale: {
      state: "KNOWN",
      value: "Current evidence does not support an unsupported concession.",
      evidenceRefs: ["evidence:rationale"]
    },
    assumptions: [
      {
        assumptionId: "assumption-budget",
        statement: {
          state: "KNOWN",
          value: "The documented buyer budget remains unchanged.",
          evidenceRefs: ["evidence:budget"]
        },
        material: false,
        revisitTrigger: null
      },
      {
        assumptionId: "assumption-timing",
        statement: {
          state: "INFERRED",
          value: "Timing may remain flexible.",
          evidenceRefs: ["evidence:timing"]
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
    expectedOutcomes: [],
    successCriteria: [],
    failureCriteria: [],
    revisitTriggers: [],
    validUntil: "2026-10-01T10:00:00.000Z",
    approval: {
      authorityClass: "KEEGAN_BUSINESS_JUDGMENT",
      approvalState: "APPROVED",
      approvedByRef: "person:keegan",
      approvedAt: "2026-09-01T10:00:00.000Z",
      evidenceRefs: ["evidence:approval"]
    },
    actionState: "TAKEN",
    actionEvidenceRefs: ["evidence:action"],
    supersedesDecisionId: null,
    sourceRefs: ["source:crm:opportunity-1"],
    ...overrides
  };
}

function outcomeInput(overrides: Partial<DecisionOutcomeObservationInputV1> = {}): DecisionOutcomeObservationInputV1 {
  return {
    observedAt: "2026-09-10T10:00:00.000Z",
    outcomes: [
      {
        outcomeId: "outcome-agreement",
        metricRef: "deal:agreement",
        description: {
          state: "KNOWN",
          value: "A documented agreement was reached.",
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
      evidenceRefs: ["evidence:assessment"]
    },
    attributionClass: "CORRELATIONAL",
    attributionEvidenceRefs: ["evidence:sequence"],
    confounders: [
      {
        confounderId: "confounder-buyer-preference",
        description: "Buyer preference may have independently contributed.",
        evidenceRefs: ["evidence:buyer-preference"]
      }
    ],
    assumptionAssessments: [],
    lessonCandidate: {
      statement: "This single result must not become a universal pricing rule.",
      evidenceRefs: ["evidence:agreement"]
    },
    sourceRefs: ["source:crm:closed-deal-1"],
    ...overrides
  };
}

test("projects durable decision memory into a conservative precedent without inventing outcomes or confidence", () => {
  const record = attachDecisionOutcomeObservationV1(
    compileDecisionMemoryV1(decisionInput()),
    outcomeInput()
  );
  const projection = compileDecisionMemoryPrecedentV1({
    record,
    generatedAt: "2026-09-18T10:00:00.000Z"
  });

  assert.equal(projection.state, "READY");
  assert.ok(projection.precedent);
  assert.equal(projection.precedent?.CHOSEN_ACTION, "Hold documented asking price");
  assert.equal(projection.precedent?.OUTCOME.status, "UNKNOWN");
  assert.equal(projection.precedent?.OUTCOME.summary, "A documented agreement was reached.");
  assert.deepEqual(projection.precedent?.OUTCOME.evidence_refs, ["evidence:agreement"]);
  assert.equal(projection.precedent?.ATTRIBUTION_CONFIDENCE, "UNKNOWN");
  assert.equal(projection.precedent?.LESSON, "UNKNOWN");
  assert.equal(projection.precedent?.PREFERENCE_SIGNAL_CLASS, "WEAK_SIGNAL_ONLY");
  assert.deepEqual(projection.precedent?.KEY_ASSUMPTIONS, [
    "The documented buyer budget remains unchanged."
  ]);
  assert.equal(projection.actionAuthority.preferencePromotionAuthorized, false);
  assert.equal(projection.actionAuthority.pricingChangeAuthorized, false);
});

test("includes only evidence-backed KNOWN caller context tags", () => {
  const projection = compileDecisionMemoryPrecedentV1({
    record: compileDecisionMemoryV1(decisionInput()),
    generatedAt: "2026-09-18T10:00:00.000Z",
    contextTags: [
      {
        tag: "collector",
        state: "KNOWN",
        evidenceRefs: ["evidence:collector"]
      },
      {
        tag: "urgent",
        state: "INFERRED",
        evidenceRefs: ["evidence:timing"]
      },
      {
        tag: "celebrity",
        state: "KNOWN",
        evidenceRefs: []
      }
    ]
  });

  assert.deepEqual(projection.precedent?.CONTEXT_TAGS, ["collector", "decision-class:pricing"]);
  assert.deepEqual(projection.omittedContextTags, [
    { tag: "celebrity", reason: "MISSING_EVIDENCE" },
    { tag: "urgent", reason: "NOT_KNOWN" }
  ]);
  assert.equal(
    projection.precedent?.KEY_EVIDENCE.some((item) => item.evidence_id === "evidence:collector"),
    true
  );
});

test("preserves evidence truth downgrades instead of upgrading inferred evidence", () => {
  const projection = compileDecisionMemoryPrecedentV1({
    record: compileDecisionMemoryV1(decisionInput()),
    generatedAt: "2026-09-18T10:00:00.000Z"
  });

  const inferred = projection.precedent?.KEY_EVIDENCE.find(
    (item) => item.evidence_id === "evidence:alt:adjust"
  );
  assert.equal(inferred?.truth_state, "INFERRED");
  assert.equal(
    projection.precedent?.KEY_ASSUMPTIONS.includes("Timing may remain flexible."),
    false
  );
});

test("fails closed when canonical decision memory has integrity flags", () => {
  const record = compileDecisionMemoryV1(decisionInput({
    rationale: {
      state: "UNKNOWN",
      value: "Unsupported rationale must not survive.",
      evidenceRefs: []
    }
  }));
  const projection = compileDecisionMemoryPrecedentV1({
    record,
    generatedAt: "2026-09-18T10:00:00.000Z"
  });

  assert.equal(record.rationale.value, null);
  assert.ok(record.integrityFlags.includes("RATIONALE_UNSUPPORTED"));
  assert.equal(projection.state, "VERIFY_RECORD");
  assert.equal(projection.precedent, null);
});

test("fails closed on future decisions and impossible outcome chronology", () => {
  const future = compileDecisionMemoryPrecedentV1({
    record: compileDecisionMemoryV1(decisionInput({
      decidedAt: "2026-09-20T10:00:00.000Z"
    })),
    generatedAt: "2026-09-18T10:00:00.000Z"
  });
  assert.equal(future.state, "VERIFY_RECORD");
  assert.equal(future.precedent, null);

  const record = compileDecisionMemoryV1(decisionInput());
  const impossibleOutcome = attachDecisionOutcomeObservationV1(record, outcomeInput({
    observedAt: "2026-08-31T10:00:00.000Z"
  }));
  const impossible = compileDecisionMemoryPrecedentV1({
    record: impossibleOutcome,
    generatedAt: "2026-09-18T10:00:00.000Z"
  });
  assert.equal(impossible.state, "VERIFY_RECORD");
  assert.equal(impossible.precedent, null);
});

test("feeds a ready durable-memory precedent into the hardened caller-supplied retrieval path", () => {
  const projection = compileDecisionMemoryPrecedentV1({
    record: compileDecisionMemoryV1(decisionInput()),
    generatedAt: "2026-09-18T10:00:00.000Z",
    contextTags: [
      {
        tag: "collector",
        state: "KNOWN",
        evidenceRefs: ["evidence:collector"]
      }
    ]
  });
  assert.ok(projection.precedent);

  const retrieval = retrieveDecisionPrecedentsV1(
    {
      decision_id: "decision-pricing-current",
      recommendation_id: "recommendation-current",
      context_tags: ["collector", "decision-class:pricing"],
      option_tags: ["alt-hold", "hold-documented-asking-price"],
      evidence_refs: ["evidence:collector", "evidence:context"],
      key_assumptions: ["The documented buyer budget remains unchanged."]
    },
    [projection.precedent!],
    "2026-09-18T10:00:00.000Z"
  );

  assert.equal(retrieval.source_mode, "CALLER_SUPPLIED");
  assert.equal(retrieval.matches.length, 1);
  assert.equal(retrieval.matches[0].precedent.DECISION_ID, "decision-pricing-history-1");
  assert.equal(retrieval.matches[0].dashboard_flags.can_become_preference_rule, false);
  assert.equal(retrieval.matches[0].precedent.ATTRIBUTION_CONFIDENCE, "UNKNOWN");
});
