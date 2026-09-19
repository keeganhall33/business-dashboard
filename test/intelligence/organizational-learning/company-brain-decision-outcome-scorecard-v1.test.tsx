import assert from "node:assert/strict";
import test from "node:test";

import {
  attachDecisionOutcomeObservationV1,
  compileDecisionMemoryV1,
  type DecisionActionStateV1,
  type DecisionAttributionClassV1,
  type DecisionMemoryClassV1,
  type DecisionMemoryRecordV1,
  type DecisionMemoryTruthStateV1,
  type DecisionOutcomeAssessmentV1
} from "@/lib/intelligence/organizational-learning/decision-memory-v1";
import {
  compileCompanyBrainDecisionOutcomeScorecardV1,
  type CompanyBrainDecisionOutcomeScorecardInputV1
} from "@/lib/intelligence/organizational-learning/company-brain-decision-outcome-scorecard-v1";

const periodStart = "2026-09-01T00:00:00.000Z";
const periodEnd = "2026-09-30T23:59:59.000Z";
const generatedAt = "2026-10-01T00:30:00.000Z";
const sourceSnapshotAt = "2026-10-01T00:25:00.000Z";
const oneHour = 60 * 60 * 1000;

function bound<T>(
  value: T,
  evidenceRef: string,
  state: DecisionMemoryTruthStateV1 = "KNOWN"
) {
  return { state, value, evidenceRefs: [evidenceRef] };
}

function baseRecord(args: {
  id: string;
  decidedAt: string;
  decisionClass?: DecisionMemoryClassV1;
  actionState?: DecisionActionStateV1;
  actionEvidence?: boolean;
  withExpectedOutcome?: boolean;
}): DecisionMemoryRecordV1 {
  const decisionClass = args.decisionClass ?? "STRATEGY";
  const actionState = args.actionState ?? "TAKEN";
  const withExpectedOutcome = args.withExpectedOutcome ?? true;
  return compileDecisionMemoryV1({
    decisionId: args.id,
    decisionClass,
    decidedAt: args.decidedAt,
    actorRef: "actor:keegan",
    context: bound(`Context for ${args.id}`, `evidence:${args.id}:context`),
    selectedAlternativeId: "go",
    alternatives: [
      {
        alternativeId: "go",
        label: "Proceed",
        description: bound("Proceed with the bounded option.", `evidence:${args.id}:alternative`)
      },
      {
        alternativeId: "wait",
        label: "Wait",
        description: bound("Wait for more evidence.", `evidence:${args.id}:wait`)
      }
    ],
    rationale: bound("Use the observed evidence without widening authority.", `evidence:${args.id}:rationale`),
    assumptions: [
      {
        assumptionId: "assumption:1",
        statement: bound("The source evidence remains current.", `evidence:${args.id}:assumption`),
        material: true,
        revisitTrigger: "Source evidence becomes stale."
      }
    ],
    confidence: bound("MEDIUM" as const, `evidence:${args.id}:confidence`),
    expectedOutcomes: withExpectedOutcome
      ? [
          {
            outcomeId: "outcome:1",
            metricRef: "metric:1",
            description: bound("Observe the declared metric.", `evidence:${args.id}:expected`),
            expectedRange: bound(
              { min: 1, max: 2, unit: "observed-units" },
              `evidence:${args.id}:range`
            ),
            evaluationWindowEndsAt: "2026-09-25T00:00:00.000Z"
          }
        ]
      : [],
    successCriteria: [bound("Declared success criterion.", `evidence:${args.id}:success`)],
    failureCriteria: [bound("Declared failure criterion.", `evidence:${args.id}:failure`)],
    revisitTriggers: ["Material evidence changes"],
    validUntil: null,
    approval: {
      authorityClass: "INTERNAL_REVIEW",
      approvalState: "NOT_REQUIRED",
      approvedByRef: null,
      approvedAt: null,
      evidenceRefs: []
    },
    actionState,
    actionEvidenceRefs: args.actionEvidence === false ? [] : [`evidence:${args.id}:action`],
    supersedesDecisionId: null,
    sourceRefs: [`source:${args.id}`]
  });
}

function withOutcome(
  record: DecisionMemoryRecordV1,
  args: {
    observedAt: string;
    assessment: DecisionOutcomeAssessmentV1;
    assessmentState?: DecisionMemoryTruthStateV1;
    attribution?: DecisionAttributionClassV1;
    attributionEvidence?: boolean;
    withConfounder?: boolean;
    withLesson?: boolean;
  }
): DecisionMemoryRecordV1 {
  return attachDecisionOutcomeObservationV1(record, {
    observedAt: args.observedAt,
    outcomes: [
      {
        outcomeId: "outcome:1",
        metricRef: "metric:1",
        description: bound("Observed declared metric movement.", `evidence:${record.decisionId}:observed`),
        observedRange: bound(
          { min: 1, max: 1, unit: "observed-units" },
          `evidence:${record.decisionId}:observed-range`
        )
      }
    ],
    assessment: bound(
      args.assessment,
      `evidence:${record.decisionId}:assessment`,
      args.assessmentState ?? "KNOWN"
    ),
    attributionClass: args.attribution ?? "CORRELATIONAL",
    attributionEvidenceRefs: args.attributionEvidence === false
      ? []
      : [`evidence:${record.decisionId}:attribution`],
    confounders: args.withConfounder
      ? [
          {
            confounderId: "confounder:1",
            description: "A separately observed contextual change.",
            evidenceRefs: [`evidence:${record.decisionId}:confounder`]
          }
        ]
      : [],
    assumptionAssessments: [
      {
        assumptionId: "assumption:1",
        assessment: "SUPPORTED",
        evidenceRefs: [`evidence:${record.decisionId}:assumption-outcome`]
      }
    ],
    lessonCandidate: args.withLesson
      ? {
          statement: "Review whether this observed pattern repeats across independent decisions.",
          evidenceRefs: [`evidence:${record.decisionId}:lesson`]
        }
      : null,
    sourceRefs: [`source:${record.decisionId}:outcome`]
  });
}

function records(): readonly DecisionMemoryRecordV1[] {
  const positive = withOutcome(
    baseRecord({
      id: "decision:positive",
      decidedAt: "2026-09-10T12:00:00.000Z",
      decisionClass: "STRATEGY",
      actionState: "TAKEN"
    }),
    {
      observedAt: "2026-09-20T12:00:00.000Z",
      assessment: "POSITIVE",
      attribution: "CAUSAL",
      withConfounder: true,
      withLesson: true
    }
  );
  const deferred = baseRecord({
    id: "decision:deferred",
    decidedAt: "2026-09-12T12:00:00.000Z",
    decisionClass: "PRICING",
    actionState: "DEFERRED",
    actionEvidence: false
  });
  const actionWithoutEvidence = baseRecord({
    id: "decision:no-action-evidence",
    decidedAt: "2026-09-15T12:00:00.000Z",
    decisionClass: "CAMPAIGN",
    actionState: "TAKEN",
    actionEvidence: false,
    withExpectedOutcome: false
  });
  const olderDecisionWithPeriodOutcome = withOutcome(
    baseRecord({
      id: "decision:older",
      decidedAt: "2026-08-20T12:00:00.000Z",
      decisionClass: "EXPERIMENT",
      actionState: "TAKEN"
    }),
    {
      observedAt: "2026-09-18T12:00:00.000Z",
      assessment: "NEGATIVE",
      attribution: "CORRELATIONAL"
    }
  );
  return [positive, deferred, actionWithoutEvidence, olderDecisionWithPeriodOutcome];
}

function input(
  overrides: Partial<CompanyBrainDecisionOutcomeScorecardInputV1> = {}
): CompanyBrainDecisionOutcomeScorecardInputV1 {
  return {
    records: records(),
    periodStart,
    periodEnd,
    generatedAt,
    sourceSnapshotAt,
    maximumSourceAgeMs: oneHour,
    sourceCoverage: "COMPLETE",
    sourceRefs: ["snapshot:decision-memory:2026-10-01"],
    ...overrides
  };
}

test("summarizes decision closure and outcome activity without causal or monetary synthesis", () => {
  const value = compileCompanyBrainDecisionOutcomeScorecardV1(input());

  assert.equal(value.state, "READY");
  assert.deepEqual(value.verificationReasons, []);
  assert.ok(value.metrics);
  assert.equal(value.metrics.decisionCohort.total, 3);
  assert.equal(value.metrics.decisionCohort.byClass.STRATEGY, 1);
  assert.equal(value.metrics.decisionCohort.byClass.PRICING, 1);
  assert.equal(value.metrics.decisionCohort.byClass.CAMPAIGN, 1);
  assert.equal(value.metrics.decisionCohort.actionState.TAKEN, 2);
  assert.equal(value.metrics.decisionCohort.actionState.DEFERRED, 1);
  assert.equal(value.metrics.decisionCohort.actionObservedWithEvidence, 1);
  assert.equal(value.metrics.decisionCohort.actionStateWithoutEvidence, 1);
  assert.equal(value.metrics.decisionCohort.withExpectedOutcomePlan, 2);
  assert.equal(value.metrics.decisionCohort.withoutExpectedOutcomePlan, 1);
  assert.equal(value.metrics.decisionCohort.withOutcomeObservationAsOfReport, 1);
  assert.equal(value.metrics.decisionCohort.withDecisionGradeOutcomeAsOfReport, 1);

  assert.equal(value.metrics.outcomeActivity.observedDecisionCount, 2);
  assert.equal(value.metrics.outcomeActivity.decisionGradeAssessmentCount, 2);
  assert.equal(value.metrics.outcomeActivity.assessment.POSITIVE, 1);
  assert.equal(value.metrics.outcomeActivity.assessment.NEGATIVE, 1);
  assert.equal(value.metrics.outcomeActivity.attributionAsRecorded.CAUSAL, 1);
  assert.equal(value.metrics.outcomeActivity.attributionAsRecorded.CORRELATIONAL, 1);
  assert.equal(value.metrics.outcomeActivity.withRecordedConfounders, 1);
  assert.equal(value.metrics.outcomeActivity.lessonCandidatesAwaitingGovernedReview, 1);

  assert.equal(value.metrics.closure.actionObservedWithEvidence, 1);
  assert.equal(value.metrics.closure.outcomeObserved, 1);
  assert.equal(value.metrics.closure.decisionGradeOutcomeObserved, 1);
  assert.equal(value.metrics.closure.actionAndDecisionGradeOutcomeObserved, 1);
  assert.equal(value.metrics.closure.causalOutcomeClaims, "NOT_ESTABLISHED");
  assert.equal(value.causalConclusion, "NOT_ESTABLISHED");
  assert.equal(value.confidence, "NOT_ESTABLISHED");
  assert.equal(value.monetaryValue, null);
  assert.equal(value.inferredOutcome, null);
});

test("fails closed when source coverage is partial", () => {
  const value = compileCompanyBrainDecisionOutcomeScorecardV1(
    input({ sourceCoverage: "PARTIAL" })
  );

  assert.equal(value.state, "VERIFY_SOURCE");
  assert.equal(value.metrics, null);
  assert.ok(value.verificationReasons.includes("SOURCE_COVERAGE_NOT_COMPLETE"));
});

test("fails closed on stale source snapshots", () => {
  const value = compileCompanyBrainDecisionOutcomeScorecardV1(
    input({ sourceSnapshotAt: "2026-09-30T20:00:00.000Z" })
  );

  assert.equal(value.state, "VERIFY_SOURCE");
  assert.equal(value.metrics, null);
  assert.ok(value.verificationReasons.includes("SOURCE_SNAPSHOT_STALE"));
});

test("fails closed when multiple record versions for one decision are mixed", () => {
  const original = baseRecord({
    id: "decision:versioned",
    decidedAt: "2026-09-10T12:00:00.000Z"
  });
  const revised = withOutcome(original, {
    observedAt: "2026-09-20T12:00:00.000Z",
    assessment: "POSITIVE"
  });
  const value = compileCompanyBrainDecisionOutcomeScorecardV1(
    input({ records: [original, revised] })
  );

  assert.equal(value.state, "VERIFY_SOURCE");
  assert.equal(value.metrics, null);
  assert.ok(value.verificationReasons.includes("DUPLICATE_DECISION_ID"));
});

test("keeps unsupported assessment direction out of directional outcome counts", () => {
  const inferred = withOutcome(
    baseRecord({
      id: "decision:inferred-outcome",
      decidedAt: "2026-09-05T12:00:00.000Z"
    }),
    {
      observedAt: "2026-09-20T12:00:00.000Z",
      assessment: "POSITIVE",
      assessmentState: "INFERRED",
      attribution: "CONTRIBUTORY",
      attributionEvidence: false
    }
  );
  const value = compileCompanyBrainDecisionOutcomeScorecardV1(
    input({ records: [inferred] })
  );

  assert.equal(value.state, "READY");
  assert.ok(value.metrics);
  assert.equal(value.metrics.outcomeActivity.observedDecisionCount, 1);
  assert.equal(value.metrics.outcomeActivity.decisionGradeAssessmentCount, 0);
  assert.equal(value.metrics.outcomeActivity.unsupportedOrUnknownAssessmentCount, 1);
  assert.equal(value.metrics.outcomeActivity.assessment.POSITIVE, 0);
  assert.equal(value.metrics.outcomeActivity.attributionAsRecorded.CONTRIBUTORY, 1);
  assert.equal(value.metrics.outcomeActivity.attributionEvidenceMissing, 1);
  assert.equal(value.causalConclusion, "NOT_ESTABLISHED");
});

test("fails closed on future outcome chronology and missing relevant provenance", () => {
  const future = withOutcome(
    baseRecord({
      id: "decision:future-outcome",
      decidedAt: "2026-09-10T12:00:00.000Z"
    }),
    {
      observedAt: "2026-10-02T12:00:00.000Z",
      assessment: "POSITIVE"
    }
  );
  const provenanceFree = {
    ...baseRecord({
      id: "decision:no-provenance",
      decidedAt: "2026-09-11T12:00:00.000Z"
    }),
    sourceRefs: []
  } as DecisionMemoryRecordV1;
  const value = compileCompanyBrainDecisionOutcomeScorecardV1(
    input({ records: [future, provenanceFree] })
  );

  assert.equal(value.state, "VERIFY_SOURCE");
  assert.equal(value.metrics, null);
  assert.ok(value.verificationReasons.includes("INVALID_RECORD_CHRONOLOGY"));
  assert.ok(value.verificationReasons.includes("RELEVANT_RECORD_PROVENANCE_MISSING"));
});

test("keeps the scorecard immutable and analysis-only", () => {
  const value = compileCompanyBrainDecisionOutcomeScorecardV1(input());

  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.metrics), true);
  assert.equal(value.authority.analysisOnly, true);
  assert.equal(value.authority.persistenceAuthorized, false);
  assert.equal(value.authority.decisionMutationAuthorized, false);
  assert.equal(value.authority.outcomeMutationAuthorized, false);
  assert.equal(value.authority.portfolioMutationAuthorized, false);
  assert.equal(value.authority.allocationChangeAuthorized, false);
  assert.equal(value.authority.reallocationAuthorized, false);
  assert.equal(value.authority.learningPromotionAuthorized, false);
  assert.equal(value.authority.policyPromotionAuthorized, false);
  assert.equal(value.authority.pricingChangeAuthorized, false);
  assert.equal(value.authority.negotiationActionAuthorized, false);
  assert.equal(value.authority.experimentExecutionAuthorized, false);
  assert.equal(value.authority.campaignExecutionAuthorized, false);
  assert.equal(value.authority.externalActionAuthorized, false);
  assert.equal(value.authority.approvalBypassAuthorized, false);
});
