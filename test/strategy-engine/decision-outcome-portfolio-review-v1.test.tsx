import assert from "node:assert/strict";
import test from "node:test";

import {
  attachDecisionOutcomeObservationV1,
  compileDecisionMemoryV1,
  type DecisionMemoryRecordV1,
  type DecisionOutcomeAssessmentV1
} from "@/lib/intelligence/organizational-learning/decision-memory-v1";
import {
  reviewDecisionOutcomeForPortfolioV1,
  type DecisionOutcomePortfolioReviewInputV1
} from "@/lib/strategy-engine/decision-outcome-portfolio-review-v1";
import type { DecisionPortfolioV1 } from "@/lib/strategy-engine/decision-portfolio-v1";

const SHARED_EVIDENCE = "evidence:decision-link";
const DECIDED_AT = "2026-09-17T10:00:00.000Z";
const OBSERVED_AT = "2026-09-18T10:00:00.000Z";
const PORTFOLIO_AT = "2026-09-18T11:00:00.000Z";
const REVIEWED_AT = "2026-09-18T12:00:00.000Z";
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

function decisionRecord(
  assessment: DecisionOutcomeAssessmentV1 = "NEGATIVE",
  overrides: {
    attributionClass?: "CAUSAL" | "CONTRIBUTORY" | "CORRELATIONAL" | "UNKNOWN";
    attributionEvidenceRefs?: readonly string[];
    assessmentState?: "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED";
    assessmentEvidenceRefs?: readonly string[];
    observedAt?: string;
  } = {}
): DecisionMemoryRecordV1 {
  const base = compileDecisionMemoryV1({
    decisionId: "decision:growth",
    decisionClass: "STRATEGY",
    decidedAt: DECIDED_AT,
    actorRef: "person:keegan",
    context: {
      state: "KNOWN",
      value: "Choose the next growth initiative from current evidence.",
      evidenceRefs: [SHARED_EVIDENCE]
    },
    selectedAlternativeId: "alt:execute",
    alternatives: [
      {
        alternativeId: "alt:execute",
        label: "Execute bounded initiative",
        description: {
          state: "KNOWN",
          value: "Proceed with the bounded initiative.",
          evidenceRefs: ["evidence:alternative-execute"]
        }
      },
      {
        alternativeId: "alt:wait",
        label: "Wait for more evidence",
        description: {
          state: "KNOWN",
          value: "Delay and collect additional evidence.",
          evidenceRefs: ["evidence:alternative-wait"]
        }
      }
    ],
    rationale: {
      state: "KNOWN",
      value: "The bounded initiative had the strongest current strategic case.",
      evidenceRefs: ["evidence:rationale"]
    },
    assumptions: [
      {
        assumptionId: "assumption:capacity",
        statement: {
          state: "KNOWN",
          value: "The initiative fits current capacity.",
          evidenceRefs: ["evidence:assumption"]
        },
        material: true,
        revisitTrigger: "Observed capacity pressure"
      }
    ],
    confidence: {
      state: "KNOWN",
      value: "MEDIUM",
      evidenceRefs: ["evidence:confidence"]
    },
    expectedOutcomes: [
      {
        outcomeId: "outcome:qualified-demand",
        metricRef: "metric:qualified-demand",
        description: {
          state: "KNOWN",
          value: "Observe qualified demand during the evaluation window.",
          evidenceRefs: ["evidence:expected-outcome"]
        },
        expectedRange: {
          state: "KNOWN",
          value: { min: 1, max: 3, unit: "qualified-signals" },
          evidenceRefs: ["evidence:expected-range"]
        },
        evaluationWindowEndsAt: "2026-09-30T00:00:00.000Z"
      }
    ],
    successCriteria: [
      {
        state: "KNOWN",
        value: "The predeclared success criterion is observed.",
        evidenceRefs: ["evidence:success-criterion"]
      }
    ],
    failureCriteria: [
      {
        state: "KNOWN",
        value: "The predeclared stop criterion is observed.",
        evidenceRefs: ["evidence:failure-criterion"]
      }
    ],
    revisitTriggers: ["Outcome observation materially differs from expectation"],
    validUntil: null,
    approval: {
      authorityClass: "STRATEGY_REVIEW",
      approvalState: "NOT_REQUIRED",
      approvedByRef: null,
      approvedAt: null,
      evidenceRefs: []
    },
    actionState: "TAKEN",
    actionEvidenceRefs: [SHARED_EVIDENCE, "evidence:action"],
    supersedesDecisionId: null,
    sourceRefs: ["source:strategy"]
  });

  return attachDecisionOutcomeObservationV1(base, {
    observedAt: overrides.observedAt ?? OBSERVED_AT,
    outcomes: [
      {
        outcomeId: "outcome:qualified-demand",
        metricRef: "metric:qualified-demand",
        description: {
          state: "KNOWN",
          value: "Observed qualified demand after the bounded initiative.",
          evidenceRefs: ["evidence:observed-description"]
        },
        observedRange: {
          state: "KNOWN",
          value: { min: 1, max: 1, unit: "qualified-signals" },
          evidenceRefs: ["evidence:observed-range"]
        }
      }
    ],
    assessment: {
      state: overrides.assessmentState ?? "KNOWN",
      value: assessment,
      evidenceRefs: overrides.assessmentEvidenceRefs ?? [SHARED_EVIDENCE, "evidence:assessment"]
    },
    attributionClass: overrides.attributionClass ?? "CONTRIBUTORY",
    attributionEvidenceRefs: overrides.attributionEvidenceRefs ?? ["evidence:attribution"],
    confounders: [],
    assumptionAssessments: [
      {
        assumptionId: "assumption:capacity",
        assessment: "SUPPORTED",
        evidenceRefs: ["evidence:assumption-outcome"]
      }
    ],
    lessonCandidate: null,
    sourceRefs: ["source:outcome"]
  });
}

function portfolio(overrides: {
  candidateId?: string;
  evidenceState?: "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED";
  evidenceRefs?: readonly string[];
  generatedAt?: string;
} = {}): DecisionPortfolioV1 {
  const candidateId = overrides.candidateId ?? "decision:growth";
  return {
    contractVersion: "DecisionPortfolioV1",
    policyVersion: "decision_portfolio_policy_v1.0.0",
    generatedAt: overrides.generatedAt ?? PORTFOLIO_AT,
    portfolioId: "portfolio:current",
    items: [
      {
        candidate: {
          id: candidateId,
          title: "Current growth decision",
          candidateType: "DECISION",
          owner: "JEEVES",
          approvalClass: "KEEGAN",
          evidenceState: overrides.evidenceState ?? "KNOWN",
          evidenceRefs: overrides.evidenceRefs ?? [SHARED_EVIDENCE, "evidence:candidate-current"],
          sourceRefs: ["source:portfolio"],
          monetaryCase: null,
          value: {
            strategicFit: 80,
            compoundingAdvantage: 75,
            relationshipAccess: 40,
            futureOptions: 70,
            learningValue: 80,
            urgency: 60,
            reversibility: 90
          },
          risk: { execution: 20, reputation: 10, rights: 10 },
          resources: { keeganHours: 1, ioanaHours: 0, jeevesHours: 4, cashCents: 0 },
          dependencyIds: [],
          conflictKeys: [],
          blockers: [],
          informationGainAction: null,
          safeNextStep: "Review the current decision evidence before any change.",
          successMetric: "Canonical outcome observation",
          evaluationWindow: {
            start: "2026-09-01T00:00:00.000Z",
            end: "2026-09-30T23:59:59.000Z"
          }
        },
        disposition: "SELECTED",
        score: {
          monetaryExpectedCents: null,
          monetaryScore: 0,
          strategicScore: 70,
          riskPenalty: 10,
          totalScore: 60,
          components: {}
        },
        rank: 1,
        rationale: "Canonical portfolio rationale",
        exclusionReason: null,
        displacedBy: []
      }
    ],
    selectedIds: [candidateId],
    ownerQueues: { KEEGAN: [], IOANA: [], JEEVES: [candidateId] },
    keeganDecisionIds: [candidateId],
    informationGainIds: [],
    usedCapacity: { keeganHours: 1, ioanaHours: 0, jeevesHours: 4, cashCents: 0 },
    remainingCapacity: { keeganHours: 4, ioanaHours: 4, jeevesHours: 12, cashCents: 0 },
    evidenceRefs: ["evidence:portfolio"],
    sourceRefs: ["source:portfolio"],
    audit: {
      candidatesConsidered: 1,
      feasiblePortfoliosEvaluated: 1,
      duplicateCandidatesSuppressed: 0,
      exactOptimization: true
    }
  };
}

function validInput(
  overrides: Partial<DecisionOutcomePortfolioReviewInputV1> = {}
): DecisionOutcomePortfolioReviewInputV1 {
  return {
    portfolio: portfolio(),
    record: decisionRecord(),
    targetLink: {
      candidateId: "decision:growth",
      evidenceRefs: [SHARED_EVIDENCE]
    },
    reviewedAt: REVIEWED_AT,
    maximumOutcomeAgeMs: FORTY_EIGHT_HOURS_MS,
    ...overrides
  };
}

test("negative observed outcome requests bounded portfolio reassessment only", () => {
  const result = reviewDecisionOutcomeForPortfolioV1(validInput());

  assert.equal(result.state, "READY_FOR_REVIEW");
  assert.ok(result.reasonCodes.includes("NEGATIVE_OUTCOME_REQUIRES_REASSESSMENT"));
  assert.equal(result.previousDisposition, "SELECTED");
  assert.equal(result.nextInternalStep, "REASSESS_CANONICAL_CANDIDATE_EVIDENCE");
  assert.equal(result.outcomeAssessment, "NEGATIVE");
  assert.equal(result.attributionClass, "CONTRIBUTORY");
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.outcomePrediction, null);
  assert.equal(result.authority.portfolioMutationAuthorized, false);
  assert.equal(result.authority.allocationChangeAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("positive outcome is reviewable but cannot become automatic scaling", () => {
  const result = reviewDecisionOutcomeForPortfolioV1(validInput({
    record: decisionRecord("POSITIVE")
  }));

  assert.equal(result.state, "READY_FOR_REVIEW");
  assert.ok(result.reasonCodes.includes("POSITIVE_OUTCOME_READY_FOR_REVIEW"));
  assert.equal(result.nextInternalStep, "REVIEW_OUTCOME_WITHOUT_AUTOMATIC_SCALING");
  assert.equal(result.authority.allocationChangeAuthorized, false);
  assert.equal(result.authority.campaignExecutionAuthorized, false);
  assert.equal(result.authority.experimentExecutionAuthorized, false);
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
});

test("neutral outcome creates no reallocation signal", () => {
  const result = reviewDecisionOutcomeForPortfolioV1(validInput({
    record: decisionRecord("NEUTRAL")
  }));

  assert.equal(result.state, "NO_ACTION");
  assert.deepEqual(result.reasonCodes, ["NEUTRAL_OUTCOME_NO_REALLOCATION_SIGNAL"]);
  assert.equal(result.nextInternalStep, null);
});

test("inconclusive or missing outcome waits for evidence", () => {
  const inconclusive = reviewDecisionOutcomeForPortfolioV1(validInput({
    record: decisionRecord("INCONCLUSIVE")
  }));
  assert.equal(inconclusive.state, "WAIT_FOR_EVIDENCE");
  assert.ok(inconclusive.reasonCodes.includes("OUTCOME_INCONCLUSIVE"));

  const noOutcome = compileDecisionMemoryV1({
    decisionId: "decision:growth",
    decisionClass: "STRATEGY",
    decidedAt: DECIDED_AT,
    actorRef: "person:keegan",
    context: { state: "KNOWN", value: "Context", evidenceRefs: [SHARED_EVIDENCE] },
    selectedAlternativeId: "alt:execute",
    alternatives: [{
      alternativeId: "alt:execute",
      label: "Execute",
      description: { state: "KNOWN", value: "Execute", evidenceRefs: ["evidence:alt"] }
    }],
    rationale: { state: "KNOWN", value: "Rationale", evidenceRefs: ["evidence:rationale"] },
    assumptions: [],
    confidence: { state: "KNOWN", value: "MEDIUM", evidenceRefs: ["evidence:confidence"] },
    expectedOutcomes: [],
    successCriteria: [],
    failureCriteria: [],
    revisitTriggers: [],
    validUntil: null,
    approval: {
      authorityClass: "STRATEGY_REVIEW",
      approvalState: "NOT_REQUIRED",
      approvedByRef: null,
      approvedAt: null,
      evidenceRefs: []
    },
    actionState: "TAKEN",
    actionEvidenceRefs: [SHARED_EVIDENCE],
    supersedesDecisionId: null,
    sourceRefs: ["source:strategy"]
  });
  const missing = reviewDecisionOutcomeForPortfolioV1(validInput({ record: noOutcome }));
  assert.equal(missing.state, "WAIT_FOR_EVIDENCE");
  assert.ok(missing.reasonCodes.includes("OUTCOME_NOT_OBSERVED"));
});

test("stale outcomes fail closed under the caller-owned freshness policy", () => {
  const result = reviewDecisionOutcomeForPortfolioV1(validInput({
    record: decisionRecord("NEGATIVE", { observedAt: "2026-08-01T10:00:00.000Z" }),
    maximumOutcomeAgeMs: 24 * 60 * 60 * 1000
  }));

  assert.equal(result.state, "VERIFY");
  assert.ok(result.reasonCodes.includes("OUTCOME_STALE"));
  assert.equal(result.nextInternalStep, "VERIFY_DECISION_OUTCOME_AND_PORTFOLIO_LINK");
});

test("target candidate must be current, exact, and evidence-linked", () => {
  const nonKnown = reviewDecisionOutcomeForPortfolioV1(validInput({
    portfolio: portfolio({ evidenceState: "INFERRED" })
  }));
  assert.equal(nonKnown.state, "VERIFY");
  assert.ok(nonKnown.reasonCodes.includes("TARGET_CANDIDATE_NOT_KNOWN"));

  const mismatch = reviewDecisionOutcomeForPortfolioV1(validInput({
    portfolio: portfolio({ candidateId: "decision:other" }),
    targetLink: { candidateId: "decision:other", evidenceRefs: [SHARED_EVIDENCE] }
  }));
  assert.equal(mismatch.state, "VERIFY");
  assert.ok(mismatch.reasonCodes.includes("TARGET_DECISION_ID_MISMATCH"));

  const unshared = reviewDecisionOutcomeForPortfolioV1(validInput({
    targetLink: { candidateId: "decision:growth", evidenceRefs: ["evidence:not-shared"] }
  }));
  assert.equal(unshared.state, "VERIFY");
  assert.ok(unshared.reasonCodes.includes("TARGET_LINK_EVIDENCE_NOT_SHARED"));
});

test("decision integrity flags and unsupported assessment evidence cannot steer allocation", () => {
  const degraded = structuredClone(decisionRecord());
  degraded.integrityFlags = ["RATIONALE_UNSUPPORTED"];
  const integrity = reviewDecisionOutcomeForPortfolioV1(validInput({ record: degraded }));
  assert.equal(integrity.state, "VERIFY");
  assert.ok(integrity.reasonCodes.includes("DECISION_INTEGRITY_FLAGS"));

  const unsupported = reviewDecisionOutcomeForPortfolioV1(validInput({
    record: decisionRecord("NEGATIVE", {
      assessmentState: "UNKNOWN",
      assessmentEvidenceRefs: []
    })
  }));
  assert.equal(unsupported.state, "VERIFY");
  assert.ok(unsupported.reasonCodes.includes("OUTCOME_NOT_DECISION_GRADE"));
  assert.ok(unsupported.reasonCodes.includes("OUTCOME_EVIDENCE_MISSING"));
});

test("non-unknown attribution requires explicit attribution evidence", () => {
  const result = reviewDecisionOutcomeForPortfolioV1(validInput({
    record: decisionRecord("NEGATIVE", {
      attributionClass: "CONTRIBUTORY",
      attributionEvidenceRefs: []
    })
  }));

  assert.equal(result.state, "VERIFY");
  assert.ok(result.reasonCodes.includes("ATTRIBUTION_EVIDENCE_MISSING"));
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
});

test("future chronology and unsafe source authority fail closed", () => {
  const future = reviewDecisionOutcomeForPortfolioV1(validInput({
    record: decisionRecord("NEGATIVE", { observedAt: "2026-09-20T10:00:00.000Z" })
  }));
  assert.equal(future.state, "VERIFY");
  assert.ok(future.reasonCodes.includes("INVALID_CHRONOLOGY"));

  const unsafe = structuredClone(decisionRecord()) as DecisionMemoryRecordV1 & {
    actionAuthority: DecisionMemoryRecordV1["actionAuthority"] & { externalActionAuthorized: boolean };
  };
  unsafe.actionAuthority.externalActionAuthorized = true;
  const authority = reviewDecisionOutcomeForPortfolioV1(validInput({ record: unsafe }));
  assert.equal(authority.state, "VERIFY");
  assert.ok(authority.reasonCodes.includes("SOURCE_AUTHORITY_INVARIANT_FAILED"));
  assert.equal(authority.authority.externalActionAuthorized, false);
});

test("output is deterministic, deeply frozen, and inputs remain unchanged", () => {
  const input = validInput();
  const snapshot = structuredClone(input);
  const first = reviewDecisionOutcomeForPortfolioV1(input);
  const second = reviewDecisionOutcomeForPortfolioV1(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input, snapshot);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.authority));
  assert.ok(Object.isFrozen(first.evidenceRefs));
  assert.throws(() => {
    (first.evidenceRefs as string[]).push("evidence:mutation");
  });
});
