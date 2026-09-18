import assert from "node:assert/strict";
import test from "node:test";

import type { DecisionMemoryRecordV1 } from "@/lib/intelligence/organizational-learning/decision-memory-v1";
import {
  reviewDecisionAssumptionsForRevisitV1,
  type DecisionAssumptionEvidenceLineageV1,
  type DecisionAssumptionRevisitReviewInputV1
} from "@/lib/strategy-engine/decision-assumption-revisit-review-v1";

const DECIDED_AT = "2026-09-01T16:00:00.000Z";
const OBSERVED_AT = "2026-09-17T16:00:00.000Z";
const REVIEWED_AT = "2026-09-18T18:00:00.000Z";
const ASSUMPTION_EVIDENCE = "evidence:assumption:planning-window";
const ASSESSMENT_EVIDENCE = "evidence:assessment:planning-window-refuted";

function record(overrides: Partial<DecisionMemoryRecordV1> = {}): DecisionMemoryRecordV1 {
  return {
    contractVersion: "DecisionMemoryV1",
    policyVersion: "decision_memory_v1.0.0",
    recordId: "decision-memory:campaign-priority:v1",
    decisionId: "decision:campaign-priority",
    decisionClass: "STRATEGY",
    decidedAt: DECIDED_AT,
    actorRef: "actor:keegan",
    context: {
      state: "KNOWN",
      value: "Choose whether to reserve capacity for a time-sensitive campaign.",
      evidenceRefs: ["evidence:decision-context"]
    },
    selectedAlternativeId: "alternative:reserve-capacity",
    alternatives: [
      {
        alternativeId: "alternative:reserve-capacity",
        label: "Reserve capacity",
        description: {
          state: "KNOWN",
          value: "Protect a bounded capacity block while the opportunity remains live.",
          evidenceRefs: ["evidence:alternative"]
        }
      }
    ],
    rationale: {
      state: "KNOWN",
      value: "The planning window was expected to remain open through the evaluation period.",
      evidenceRefs: ["evidence:rationale"]
    },
    assumptions: [
      {
        assumptionId: "assumption:planning-window-open",
        statement: {
          state: "KNOWN",
          value: "The planning window remains open.",
          evidenceRefs: [ASSUMPTION_EVIDENCE]
        },
        material: true,
        revisitTrigger: "Reassess if evidence shows the planning window closed."
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
    revisitTriggers: ["Material planning-window change"],
    validUntil: "2026-10-01T00:00:00.000Z",
    approval: {
      authorityClass: "ANALYSIS_ONLY",
      approvalState: "NOT_REQUIRED",
      approvedByRef: null,
      approvedAt: null,
      evidenceRefs: []
    },
    actionState: "TAKEN",
    actionEvidenceRefs: ["evidence:action"],
    supersedesDecisionId: null,
    sourceRefs: ["source:decision-memory"],
    integrityFlags: [],
    outcomeObservation: {
      observationId: "outcome-observation:planning-window",
      observedAt: OBSERVED_AT,
      outcomes: [],
      assessment: {
        state: "KNOWN",
        value: "NEUTRAL",
        evidenceRefs: ["evidence:outcome-assessment"]
      },
      attributionClass: "UNKNOWN",
      attributionEvidenceRefs: [],
      confounders: [],
      assumptionAssessments: [
        {
          assumptionId: "assumption:planning-window-open",
          assessment: "REFUTED",
          evidenceRefs: [ASSESSMENT_EVIDENCE]
        }
      ],
      lessonCandidate: null,
      sourceRefs: ["source:outcome"]
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

function lineage(overrides: Partial<DecisionAssumptionEvidenceLineageV1>[] = []): DecisionAssumptionEvidenceLineageV1[] {
  const base: DecisionAssumptionEvidenceLineageV1[] = [
    {
      evidenceId: ASSUMPTION_EVIDENCE,
      sourceLineageId: "lineage:assumption-source",
      observedAt: "2026-08-31T16:00:00.000Z"
    },
    {
      evidenceId: ASSESSMENT_EVIDENCE,
      sourceLineageId: "lineage:assessment-source",
      observedAt: OBSERVED_AT
    }
  ];
  return base.map((entry, index) => ({ ...entry, ...(overrides[index] ?? {}) }));
}

function input(overrides: Partial<DecisionAssumptionRevisitReviewInputV1> = {}): DecisionAssumptionRevisitReviewInputV1 {
  return {
    record: record(),
    reviewedAt: REVIEWED_AT,
    evidenceLineage: lineage(),
    ...overrides
  };
}

test("refuted material assumption creates review-only decision and portfolio reassessment", () => {
  const result = reviewDecisionAssumptionsForRevisitV1(input());

  assert.equal(result.state, "READY_FOR_REVIEW");
  assert.deepEqual(result.reasonCodes, ["MATERIAL_ASSUMPTION_REFUTED"]);
  assert.equal(result.refutedCount, 1);
  assert.equal(result.supportedCount, 0);
  assert.equal(result.unresolvedCount, 0);
  assert.equal(result.nextInternalStep, "REASSESS_DECISION_AND_CURRENT_PORTFOLIO_CONTEXT");
  assert.equal(result.attributionClass, "UNKNOWN");
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.outcomePrediction, null);
  assert.deepEqual(result.authority, {
    analysisOnly: true,
    decisionMutationAuthorized: false,
    portfolioMutationAuthorized: false,
    allocationChangeAuthorized: false,
    scoreMutationAuthorized: false,
    confidenceMutationAuthorized: false,
    monetaryMutationAuthorized: false,
    policyPromotionAuthorized: false,
    pricingChangeAuthorized: false,
    negotiationActionAuthorized: false,
    campaignExecutionAuthorized: false,
    experimentExecutionAuthorized: false,
    externalActionAuthorized: false,
    persistenceAuthorized: false,
    approvalBypassAuthorized: false
  });
});

test("supported material assumptions do not manufacture a reason to revisit", () => {
  const current = record();
  const observation = current.outcomeObservation!;
  const result = reviewDecisionAssumptionsForRevisitV1(input({
    record: {
      ...current,
      outcomeObservation: {
        ...observation,
        assumptionAssessments: [
          {
            assumptionId: "assumption:planning-window-open",
            assessment: "SUPPORTED",
            evidenceRefs: [ASSESSMENT_EVIDENCE]
          }
        ]
      }
    }
  }));

  assert.equal(result.state, "NO_REVIEW_NEEDED");
  assert.deepEqual(result.reasonCodes, ["ALL_MATERIAL_ASSUMPTIONS_SUPPORTED"]);
  assert.equal(result.nextInternalStep, null);
});

test("missing outcome waits for evidence instead of guessing an assumption result", () => {
  const current = record({ outcomeObservation: null });
  const result = reviewDecisionAssumptionsForRevisitV1(input({
    record: current,
    evidenceLineage: [lineage()[0]]
  }));

  assert.equal(result.state, "WAIT_FOR_EVIDENCE");
  assert.deepEqual(result.reasonCodes, ["MATERIAL_ASSUMPTION_UNRESOLVED", "OUTCOME_NOT_OBSERVED"]);
  assert.equal(result.unresolvedCount, 1);
  assert.equal(result.nextInternalStep, "COLLECT_MISSING_MATERIAL_ASSUMPTION_EVIDENCE");
});

test("duplicate assumption assessments fail closed", () => {
  const current = record();
  const observation = current.outcomeObservation!;
  const result = reviewDecisionAssumptionsForRevisitV1(input({
    record: {
      ...current,
      outcomeObservation: {
        ...observation,
        assumptionAssessments: [
          ...observation.assumptionAssessments,
          {
            assumptionId: "assumption:planning-window-open",
            assessment: "SUPPORTED",
            evidenceRefs: ["evidence:duplicate-assessment"]
          }
        ]
      }
    }
  }));

  assert.equal(result.state, "VERIFY");
  assert.ok(result.reasonCodes.includes("DUPLICATE_ASSUMPTION_ASSESSMENT"));
  assert.equal(result.nextInternalStep, "VERIFY_DECISION_MEMORY_AND_EVIDENCE_LINEAGE");
});

test("assessment for an unknown assumption target fails closed", () => {
  const current = record();
  const observation = current.outcomeObservation!;
  const result = reviewDecisionAssumptionsForRevisitV1(input({
    record: {
      ...current,
      outcomeObservation: {
        ...observation,
        assumptionAssessments: [
          ...observation.assumptionAssessments,
          {
            assumptionId: "assumption:not-in-decision",
            assessment: "REFUTED",
            evidenceRefs: ["evidence:unknown-target"]
          }
        ]
      }
    }
  }));

  assert.equal(result.state, "VERIFY");
  assert.ok(result.reasonCodes.includes("ASSESSMENT_TARGET_UNKNOWN"));
});

test("missing evidence lineage cannot turn a refutation into strategy truth", () => {
  const result = reviewDecisionAssumptionsForRevisitV1(input({
    evidenceLineage: [lineage()[0]]
  }));

  assert.equal(result.state, "VERIFY");
  assert.ok(result.reasonCodes.includes("EVIDENCE_LINEAGE_MISSING"));
  assert.equal(result.authority.portfolioMutationAuthorized, false);
});

test("conflicting or future evidence lineage fails closed", () => {
  const conflicting = reviewDecisionAssumptionsForRevisitV1(input({
    evidenceLineage: [
      ...lineage(),
      {
        evidenceId: ASSESSMENT_EVIDENCE,
        sourceLineageId: "lineage:conflicting-source",
        observedAt: OBSERVED_AT
      }
    ]
  }));
  assert.equal(conflicting.state, "VERIFY");
  assert.ok(conflicting.reasonCodes.includes("EVIDENCE_LINEAGE_CONFLICT"));

  const future = reviewDecisionAssumptionsForRevisitV1(input({
    evidenceLineage: lineage([{}, { observedAt: "2026-09-19T18:00:00.000Z" }])
  }));
  assert.equal(future.state, "VERIFY");
  assert.ok(future.reasonCodes.includes("FUTURE_EVIDENCE"));
  assert.ok(future.reasonCodes.includes("EVIDENCE_LINEAGE_MISSING"));
});

test("unsupported non-unknown attribution is rejected rather than treated as causal evidence", () => {
  const current = record();
  const observation = current.outcomeObservation!;
  const result = reviewDecisionAssumptionsForRevisitV1(input({
    record: {
      ...current,
      outcomeObservation: {
        ...observation,
        attributionClass: "CONTRIBUTORY",
        attributionEvidenceRefs: []
      }
    }
  }));

  assert.equal(result.state, "VERIFY");
  assert.ok(result.reasonCodes.includes("ATTRIBUTION_EVIDENCE_MISSING"));
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
});

test("decision integrity flags remain a verification boundary", () => {
  const result = reviewDecisionAssumptionsForRevisitV1(input({
    record: record({ integrityFlags: ["RATIONALE_UNSUPPORTED"] })
  }));

  assert.equal(result.state, "VERIFY");
  assert.ok(result.reasonCodes.includes("DECISION_INTEGRITY_FLAGS"));
});

test("output is deterministic, deeply frozen, and leaves inputs unchanged", () => {
  const currentInput = input();
  const snapshot = structuredClone(currentInput);
  const first = reviewDecisionAssumptionsForRevisitV1(currentInput);
  const second = reviewDecisionAssumptionsForRevisitV1(currentInput);

  assert.deepEqual(first, second);
  assert.deepEqual(currentInput, snapshot);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.reviewSignals));
  assert.ok(Object.isFrozen(first.reviewSignals[0]));
  assert.ok(Object.isFrozen(first.authority));
  assert.throws(() => {
    (first.evidenceRefs as string[]).push("evidence:mutation");
  });
});
