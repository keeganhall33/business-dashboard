import assert from "node:assert/strict";
import test from "node:test";

import {
  compileDecisionMeasurementAttentionBriefV1,
  type DecisionMeasurementAttentionBriefInputV1
} from "@/lib/intelligence/organizational-learning/decision-measurement-attention-brief-v1";
import type {
  DecisionMeasurementQueueItemV1,
  DecisionMeasurementQueueStateV1,
  DecisionMeasurementQueueV1
} from "@/lib/intelligence/organizational-learning/decision-measurement-queue-v1";

const sourceGeneratedAt = "2026-09-18T20:00:00.000Z";
const compiledAt = "2026-09-18T20:05:00.000Z";
const oneHour = 60 * 60 * 1000;

const reasonByState: Record<DecisionMeasurementQueueStateV1, string> = {
  WAITING_ACTION: "ACTION_NOT_OBSERVED",
  WAITING_WINDOW: "WINDOW_NOT_ENDED",
  DUE: "MEASUREMENT_DUE",
  OVERDUE: "MEASUREMENT_OVERDUE",
  COMPLETE: "ALL_EXPECTED_OUTCOMES_OBSERVED",
  NO_MEASUREMENT_PLAN: "NO_EXPECTED_OUTCOMES",
  VERIFY_RECORD: "DECISION_INTEGRITY_FLAGS"
};

function item(
  decisionId: string,
  state: DecisionMeasurementQueueStateV1,
  overrides: Partial<DecisionMeasurementQueueItemV1> = {}
): DecisionMeasurementQueueItemV1 {
  const expected = state === "NO_MEASUREMENT_PLAN" ? [] : [`outcome:${decisionId}`];
  const complete = state === "COMPLETE";
  const waitingAction = state === "WAITING_ACTION";
  const waitingWindow = state === "WAITING_WINDOW";
  const due = state === "DUE";
  const overdue = state === "OVERDUE";
  const verify = state === "VERIFY_RECORD";
  return {
    decisionId,
    decisionClass: "STRATEGY",
    state,
    reasonCodes: [reasonByState[state] as DecisionMeasurementQueueItemV1["reasonCodes"][number]],
    decidedAt: "2026-09-18T10:00:00.000Z",
    actionState: waitingAction ? "PLANNED" : "TAKEN",
    expectedOutcomeIds: expected,
    observedOutcomeIds: complete ? expected : [],
    pendingOutcomeIds: complete || state === "NO_MEASUREMENT_PLAN" ? [] : expected,
    nextMeasurementAt: waitingWindow
      ? "2026-09-18T22:00:00.000Z"
      : due
        ? "2026-09-18T20:00:00.000Z"
        : overdue
          ? "2026-09-18T18:00:00.000Z"
          : null,
    overdueOutcomeIds: overdue ? expected : [],
    evidenceRefs: [`evidence:${decisionId}`],
    sourceRefs: [`source:${decisionId}`],
    causalInterpretation: "NOT_ESTABLISHED",
    outcomeStatusInterpretation: "MEASUREMENT_COVERAGE_ONLY",
    ...(verify ? { nextMeasurementAt: null } : {}),
    ...overrides
  };
}

function queue(
  items: readonly DecisionMeasurementQueueItemV1[] = [
    item("decision:overdue", "OVERDUE"),
    item("decision:due", "DUE"),
    item("decision:verify", "VERIFY_RECORD"),
    item("decision:no-plan", "NO_MEASUREMENT_PLAN"),
    item("decision:waiting-window", "WAITING_WINDOW"),
    item("decision:waiting-action", "WAITING_ACTION"),
    item("decision:complete", "COMPLETE")
  ],
  overrides: Partial<DecisionMeasurementQueueV1> = {}
): DecisionMeasurementQueueV1 {
  const summary = {
    total: items.length,
    waitingAction: items.filter((entry) => entry.state === "WAITING_ACTION").length,
    waitingWindow: items.filter((entry) => entry.state === "WAITING_WINDOW").length,
    due: items.filter((entry) => entry.state === "DUE").length,
    overdue: items.filter((entry) => entry.state === "OVERDUE").length,
    complete: items.filter((entry) => entry.state === "COMPLETE").length,
    noMeasurementPlan: items.filter((entry) => entry.state === "NO_MEASUREMENT_PLAN").length,
    verifyRecord: items.filter((entry) => entry.state === "VERIFY_RECORD").length
  };
  return {
    contractVersion: "DecisionMeasurementQueueV1",
    policyVersion: "decision_measurement_queue_v1.0.0",
    generatedAt: sourceGeneratedAt,
    overdueGraceMs: 30 * 60 * 1000,
    items,
    summary,
    limitations: ["canonical source limitation"],
    authority: {
      persistenceAllowed: false,
      measurementExecutionAllowed: false,
      portfolioMutationAllowed: false,
      reallocationAllowed: false,
      policyPromotionAllowed: false,
      pricingChangeAllowed: false,
      negotiationActionAllowed: false,
      campaignExecutionAllowed: false,
      experimentExecutionAllowed: false,
      externalActionAllowed: false,
      approvalBypassAllowed: false
    },
    ...overrides
  };
}

function input(
  overrides: Partial<DecisionMeasurementAttentionBriefInputV1> = {}
): DecisionMeasurementAttentionBriefInputV1 {
  return {
    queue: queue(),
    compiledAt,
    maximumQueueAgeMs: oneHour,
    ...overrides
  };
}

test("turns canonical measurement coverage into bounded chief-of-staff attention buckets", () => {
  const value = compileDecisionMeasurementAttentionBriefV1(input());

  assert.equal(value.state, "READY");
  assert.deepEqual(value.verificationReasons, []);
  assert.deepEqual(value.measurementNow.map((entry) => entry.decisionId), [
    "decision:overdue",
    "decision:due"
  ]);
  assert.deepEqual(value.verificationRequired.map((entry) => entry.decisionId), ["decision:verify"]);
  assert.deepEqual(value.measurementPlanMissing.map((entry) => entry.decisionId), ["decision:no-plan"]);
  assert.deepEqual(value.waitingWindow.map((entry) => entry.decisionId), ["decision:waiting-window"]);
  assert.deepEqual(value.waitingAction.map((entry) => entry.decisionId), ["decision:waiting-action"]);
  assert.deepEqual(value.coverageComplete.map((entry) => entry.decisionId), ["decision:complete"]);
  assert.deepEqual(value.summary, {
    total: 7,
    measurementNow: 2,
    overdue: 1,
    due: 1,
    verificationRequired: 1,
    measurementPlanMissing: 1,
    waitingWindow: 1,
    waitingAction: 1,
    coverageComplete: 1
  });
});

test("safe next steps preserve preparation-only measurement boundaries", () => {
  const value = compileDecisionMeasurementAttentionBriefV1(input());
  const byId = new Map([
    ...value.measurementNow,
    ...value.verificationRequired,
    ...value.measurementPlanMissing,
    ...value.waitingWindow,
    ...value.waitingAction,
    ...value.coverageComplete
  ].map((entry) => [entry.decisionId, entry]));

  assert.equal(byId.get("decision:overdue")?.safeNextStep, "PREPARE_MEASUREMENT_EVIDENCE_REVIEW");
  assert.equal(byId.get("decision:due")?.safeNextStep, "PREPARE_MEASUREMENT_EVIDENCE_REVIEW");
  assert.equal(byId.get("decision:verify")?.safeNextStep, "VERIFY_DECISION_RECORD");
  assert.equal(byId.get("decision:no-plan")?.safeNextStep, "REVIEW_MEASUREMENT_PLAN");
  assert.equal(byId.get("decision:waiting-window")?.safeNextStep, "WAIT_FOR_RECORDED_MEASUREMENT_WINDOW");
  assert.equal(byId.get("decision:waiting-action")?.safeNextStep, "WAIT_FOR_ACTION_EVIDENCE");
  assert.equal(byId.get("decision:complete")?.safeNextStep, "NO_MEASUREMENT_COVERAGE_ACTION");

  assert.equal(value.authority.analysisOnly, true);
  assert.equal(value.authority.measurementExecutionAuthorized, false);
  assert.equal(value.authority.evidenceCollectionAuthorized, false);
  assert.equal(value.authority.persistenceAuthorized, false);
  assert.equal(value.authority.portfolioMutationAuthorized, false);
  assert.equal(value.authority.reallocationAuthorized, false);
  assert.equal(value.authority.externalActionAuthorized, false);
  assert.equal(value.authority.approvalBypassAuthorized, false);
});

test("never converts measurement coverage into outcome, causality, confidence, or money", () => {
  const value = compileDecisionMeasurementAttentionBriefV1(input());

  assert.equal(value.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(value.confidence, "NOT_ESTABLISHED");
  assert.equal(value.monetaryValue, null);
  assert.equal(value.inferredOutcome, null);
  for (const entry of [...value.measurementNow, ...value.coverageComplete]) {
    assert.equal(entry.causalInterpretation, "NOT_ESTABLISHED");
    assert.equal(entry.outcomeInterpretation, "MEASUREMENT_COVERAGE_ONLY");
    assert.equal(entry.confidence, "NOT_ESTABLISHED");
    assert.equal(entry.monetaryValue, null);
  }
});

test("fails closed when queue evidence is stale or from the future", () => {
  const stale = compileDecisionMeasurementAttentionBriefV1(input({
    compiledAt: "2026-09-18T23:00:00.000Z",
    maximumQueueAgeMs: oneHour
  }));
  assert.equal(stale.state, "VERIFY_SOURCE");
  assert.ok(stale.verificationReasons.includes("SOURCE_STALE"));

  const future = compileDecisionMeasurementAttentionBriefV1(input({
    compiledAt: "2026-09-18T19:59:00.000Z"
  }));
  assert.equal(future.state, "VERIFY_SOURCE");
  assert.ok(future.verificationReasons.includes("SOURCE_IN_FUTURE"));
});

test("requires an explicit positive caller-owned queue freshness policy", () => {
  for (const maximumQueueAgeMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const value = compileDecisionMeasurementAttentionBriefV1(input({ maximumQueueAgeMs }));
    assert.equal(value.state, "VERIFY_SOURCE");
    assert.ok(value.verificationReasons.includes("INVALID_MAXIMUM_QUEUE_AGE"));
  }
});

test("rejects widened source action authority", () => {
  const canonical = queue();
  const forged = {
    ...canonical,
    authority: {
      ...canonical.authority,
      measurementExecutionAllowed: true
    }
  } as unknown as DecisionMeasurementQueueV1;
  const value = compileDecisionMeasurementAttentionBriefV1(input({ queue: forged }));

  assert.equal(value.state, "VERIFY_SOURCE");
  assert.ok(value.verificationReasons.includes("SOURCE_AUTHORITY_INVARIANT_FAILED"));
  assert.equal(value.authority.measurementExecutionAuthorized, false);
});

test("reconciles source summary instead of trusting a forged aggregate", () => {
  const canonical = queue();
  const forged = {
    ...canonical,
    summary: {
      ...canonical.summary,
      due: canonical.summary.due + 1
    }
  };
  const value = compileDecisionMeasurementAttentionBriefV1(input({ queue: forged }));

  assert.equal(value.state, "VERIFY_SOURCE");
  assert.ok(value.verificationReasons.includes("SOURCE_SUMMARY_MISMATCH"));
});

test("duplicate canonical decision ids cannot multiply measurement attention", () => {
  const duplicateItems = [
    item("decision:duplicate", "DUE"),
    item("decision:duplicate", "DUE")
  ];
  const value = compileDecisionMeasurementAttentionBriefV1(input({ queue: queue(duplicateItems) }));

  assert.equal(value.state, "VERIFY_SOURCE");
  assert.ok(value.verificationReasons.includes("DUPLICATE_DECISION_ID:decision:duplicate"));
});

test("fails closed on state, chronology, and interpretation tampering", () => {
  const badDue = item("decision:bad-due", "DUE", {
    nextMeasurementAt: "2026-09-18T22:00:00.000Z"
  });
  const badCausality = {
    ...item("decision:bad-causality", "COMPLETE"),
    causalInterpretation: "CAUSAL"
  } as unknown as DecisionMeasurementQueueItemV1;
  const value = compileDecisionMeasurementAttentionBriefV1(input({
    queue: queue([badDue, badCausality])
  }));

  assert.equal(value.state, "VERIFY_SOURCE");
  assert.ok(value.verificationReasons.includes("DUE_INVARIANT_FAILED:decision:bad-due"));
  assert.ok(value.verificationReasons.includes("CAUSALITY_INVARIANT_FAILED:decision:bad-causality"));
});

test("overdue ids must remain a subset of pending expected outcomes", () => {
  const forged = item("decision:bad-overdue", "OVERDUE", {
    overdueOutcomeIds: ["outcome:not-pending"]
  });
  const value = compileDecisionMeasurementAttentionBriefV1(input({ queue: queue([forged]) }));

  assert.equal(value.state, "VERIFY_SOURCE");
  assert.ok(value.verificationReasons.includes("OVERDUE_OUTCOME_NOT_PENDING:decision:bad-overdue"));
});

test("output is deterministic, deeply immutable, and does not mutate caller input", () => {
  const original = input();
  const before = structuredClone(original);
  const first = compileDecisionMeasurementAttentionBriefV1(original);
  const second = compileDecisionMeasurementAttentionBriefV1(structuredClone(original));

  assert.deepEqual(first, second);
  assert.deepEqual(original, before);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.measurementNow));
  assert.ok(Object.isFrozen(first.measurementNow[0]));
  assert.ok(Object.isFrozen(first.measurementNow[0].evidenceRefs));
  assert.ok(Object.isFrozen(first.authority));
  assert.throws(() => (first.measurementNow as DecisionMeasurementQueueItemV1[]).push(item("decision:new", "DUE")));
});
