import assert from "node:assert/strict";
import test from "node:test";

import {
  attachDecisionOutcomeObservationV1,
  compileDecisionMemoryV1,
  type DecisionMemoryInputV1,
  type DecisionOutcomeObservationInputV1
} from "../../../src/lib/intelligence/organizational-learning/decision-memory-v1";
import { compileDecisionMemoryBriefV1 } from "../../../src/lib/intelligence/organizational-learning/decision-memory-brief-v1";

function decisionInput(overrides: Partial<DecisionMemoryInputV1> = {}): DecisionMemoryInputV1 {
  return {
    decisionId: "decision-pricing-current",
    decisionClass: "PRICING",
    decidedAt: "2026-09-18T10:00:00.000Z",
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
          value: "Prepare a different structure only if new evidence supports it.",
          evidenceRefs: ["evidence:alt:adjust"]
        }
      }
    ],
    rationale: {
      state: "KNOWN",
      value: "Preserve the documented price while the current evidence does not support a concession.",
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
        material: true,
        revisitTrigger: "Buyer provides a documented hard budget ceiling."
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
        metricRef: "deal:price",
        description: {
          state: "KNOWN",
          value: "Observe whether the documented structure remains viable.",
          evidenceRefs: ["evidence:expected"]
        },
        expectedRange: {
          state: "UNKNOWN",
          value: null,
          evidenceRefs: []
        },
        evaluationWindowEndsAt: "2026-10-18T10:00:00.000Z"
      }
    ],
    successCriteria: [
      {
        state: "KNOWN",
        value: "A documented agreement is reached without an unsupported concession.",
        evidenceRefs: ["evidence:success"]
      }
    ],
    failureCriteria: [
      {
        state: "KNOWN",
        value: "New evidence shows the current structure is not viable.",
        evidenceRefs: ["evidence:failure"]
      }
    ],
    revisitTriggers: ["Buyer documents a materially different budget."],
    validUntil: "2026-10-18T10:00:00.000Z",
    approval: {
      authorityClass: "KEEGAN_BUSINESS_JUDGMENT",
      approvalState: "APPROVED",
      approvedByRef: "person:keegan",
      approvedAt: "2026-09-18T10:00:00.000Z",
      evidenceRefs: ["evidence:approval"]
    },
    actionState: "PLANNED",
    actionEvidenceRefs: ["evidence:action"],
    supersedesDecisionId: null,
    sourceRefs: ["source:crm:opportunity-1"],
    ...overrides
  };
}

function outcomeInput(overrides: Partial<DecisionOutcomeObservationInputV1> = {}): DecisionOutcomeObservationInputV1 {
  return {
    observedAt: "2026-10-01T10:00:00.000Z",
    outcomes: [
      {
        outcomeId: "outcome-price",
        metricRef: "deal:price",
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
    attributionEvidenceRefs: ["evidence:sequence"] ,
    confounders: [
      {
        confounderId: "confounder-preference",
        description: "Buyer preference may have contributed independently.",
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
      statement: "This single outcome remains review-only and does not establish a universal pricing rule.",
      evidenceRefs: ["evidence:agreement", "evidence:budget-followup"]
    },
    sourceRefs: ["source:crm:closed-deal-1"],
    ...overrides
  };
}

test("projects a ready decision brief without inventing causality or execution authority", () => {
  const record = compileDecisionMemoryV1(decisionInput());
  const brief = compileDecisionMemoryBriefV1({
    record,
    generatedAt: "2026-09-19T10:00:00.000Z"
  });

  assert.equal(brief.state, "READY");
  assert.equal(brief.lineageState, "NO_PRIOR");
  assert.equal(brief.selectedAlternativeLabel, "Hold documented asking price");
  assert.equal(brief.rationale.value?.startsWith("Preserve the documented price"), true);
  assert.ok(brief.provenanceRefs.includes("evidence:rationale"));
  assert.equal(brief.outcome.state, "NOT_OBSERVED");
  assert.equal(brief.outcome.causalityClaimedByBrief, false);
  assert.equal(brief.actionAuthority.pricingChangeAuthorized, false);
  assert.equal(brief.actionAuthority.negotiationAuthorized, false);
  assert.equal(brief.actionAuthority.externalActionAuthorized, false);
});

test("reports only explicit structured changes across proven decision lineage", () => {
  const prior = compileDecisionMemoryV1(decisionInput({
    decisionId: "decision-pricing-prior",
    selectedAlternativeId: "alt-adjust",
    rationale: {
      state: "KNOWN",
      value: "Prepare a bounded alternative while evidence is incomplete.",
      evidenceRefs: ["evidence:rationale:prior"]
    },
    confidence: {
      state: "KNOWN",
      value: "LOW",
      evidenceRefs: ["evidence:confidence:prior"]
    },
    actionState: "DEFERRED",
    actionEvidenceRefs: ["evidence:action:prior"]
  }));
  const current = compileDecisionMemoryV1(decisionInput({
    supersedesDecisionId: prior.decisionId
  }));

  const brief = compileDecisionMemoryBriefV1({
    record: current,
    priorRecord: prior,
    generatedAt: "2026-09-19T10:00:00.000Z"
  });

  assert.equal(brief.lineageState, "EXPLICIT");
  assert.deepEqual(
    brief.changesSincePrior.map((item) => item.field),
    ["ACTION_STATE", "CONFIDENCE", "RATIONALE", "SELECTED_ALTERNATIVE"]
  );
  assert.ok(brief.changesSincePrior.every((item) => item.causality === "NOT_ESTABLISHED"));
  assert.ok(brief.provenanceRefs.includes("evidence:rationale:prior"));
});

test("withholds change comparison when a supplied prior record lacks explicit lineage", () => {
  const prior = compileDecisionMemoryV1(decisionInput({ decisionId: "decision-unrelated" }));
  const current = compileDecisionMemoryV1(decisionInput());
  const brief = compileDecisionMemoryBriefV1({
    record: current,
    priorRecord: prior,
    generatedAt: "2026-09-19T10:00:00.000Z"
  });

  assert.equal(brief.state, "VERIFY_LINEAGE");
  assert.equal(brief.lineageState, "UNPROVEN");
  assert.deepEqual(brief.changesSincePrior, []);
  assert.equal(brief.provenanceRefs.includes("source:crm:opportunity-1"), true);
  assert.ok(brief.limitations.some((item) => item.includes("not connected by explicit")));
});

test("expires decisions into review rather than silently treating stale rationale as current", () => {
  const record = compileDecisionMemoryV1(decisionInput({
    validUntil: "2026-09-18T12:00:00.000Z"
  }));
  const brief = compileDecisionMemoryBriefV1({
    record,
    generatedAt: "2026-09-19T10:00:00.000Z"
  });

  assert.equal(brief.state, "REVIEW_REQUIRED");
  assert.equal(brief.freshnessState, "EXPIRED");
  assert.ok(brief.revisitSignals.some((item) => item.kind === "VALIDITY_EXPIRED"));
});

test("fails closed on outcome chronology and unsupported attribution evidence", () => {
  const record = compileDecisionMemoryV1(decisionInput());
  const withOutcome = attachDecisionOutcomeObservationV1(record, outcomeInput({
    observedAt: "2026-09-18T09:00:00.000Z",
    attributionClass: "CONTRIBUTORY",
    attributionEvidenceRefs: []
  }));
  const brief = compileDecisionMemoryBriefV1({
    record: withOutcome,
    generatedAt: "2026-09-19T10:00:00.000Z"
  });

  assert.equal(brief.state, "VERIFY_INTEGRITY");
  assert.equal(brief.outcome.state, "OBSERVED_NEEDS_VERIFICATION");
  assert.equal(brief.outcome.attributionClass, "CONTRIBUTORY");
  assert.equal(brief.outcome.causalityClaimedByBrief, false);
  assert.ok(brief.limitations.some((item) => item.includes("chronology conflicts")));
});

test("preserves unsupported rationale as unknown and surfaces canonical integrity flags", () => {
  const record = compileDecisionMemoryV1(decisionInput({
    rationale: {
      state: "UNKNOWN",
      value: "This unsupported rationale must not survive normalization.",
      evidenceRefs: []
    }
  }));
  const brief = compileDecisionMemoryBriefV1({
    record,
    generatedAt: "2026-09-19T10:00:00.000Z"
  });

  assert.equal(brief.state, "VERIFY_INTEGRITY");
  assert.equal(brief.rationale.value, null);
  assert.ok(brief.integrityFlags.includes("RATIONALE_UNSUPPORTED"));
  assert.ok(brief.revisitSignals.some((item) => item.ref === "RATIONALE_UNSUPPORTED"));
});

test("is deterministic and immutable for the same canonical record", () => {
  const record = attachDecisionOutcomeObservationV1(
    compileDecisionMemoryV1(decisionInput()),
    outcomeInput()
  );
  const first = compileDecisionMemoryBriefV1({
    record,
    generatedAt: "2026-10-02T10:00:00.000Z"
  });
  const second = compileDecisionMemoryBriefV1({
    record,
    generatedAt: "2026-10-02T10:00:00.000Z"
  });

  assert.equal(first.briefId, second.briefId);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.provenanceRefs), true);
  assert.equal(first.outcome.state, "OBSERVED");
  assert.equal(first.outcome.causalityClaimedByBrief, false);
});
