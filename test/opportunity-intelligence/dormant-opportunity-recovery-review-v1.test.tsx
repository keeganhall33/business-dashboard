import assert from "node:assert/strict";
import test from "node:test";

import {
  reviewDormantOpportunityRecoveryV1,
  type DormantOpportunityHistoryV1,
  type DormantOpportunityRecoverySignalV1,
} from "@/lib/opportunity-intelligence/dormant-opportunity-recovery-review-v1";

const OPPORTUNITY_ID = "opportunity:dormant-1";
const EVALUATED_AT = "2026-09-19T06:00:00.000Z";

function history(overrides: Partial<DormantOpportunityHistoryV1> = {}): DormantOpportunityHistoryV1 {
  return {
    opportunityId: OPPORTUNITY_ID,
    lifecycleState: "DORMANT",
    lastMeaningfulActivityAt: "2026-05-01T06:00:00.000Z",
    recordObservedAt: "2026-09-18T06:00:00.000Z",
    evidenceRefs: ["crm:opportunity:dormant-1"],
    integrity: "SUPPORTED",
    doNotContact: false,
    ...overrides,
  };
}

function signal(overrides: Partial<DormantOpportunityRecoverySignalV1> = {}): DormantOpportunityRecoverySignalV1 {
  return {
    signalId: "signal:planning-1",
    opportunityId: OPPORTUNITY_ID,
    signalType: "PLANNING_WINDOW",
    observedAt: "2026-09-18T12:00:00.000Z",
    sourceRef: "source:planning-window:1",
    evidenceRefs: ["evidence:planning-window:1"],
    integrity: "SUPPORTED",
    requiresVerification: false,
    ...overrides,
  };
}

test("a dormant canonical opportunity plus fresh exact supported evidence becomes an internal recovery candidate only", () => {
  const result = reviewDormantOpportunityRecoveryV1({
    history: history(),
    signals: [signal()],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "LIVE");
  assert.equal(result.disposition, "RECOVERY_CANDIDATE");
  assert.equal(result.opportunityId, OPPORTUNITY_ID);
  assert.deepEqual(result.qualifyingSignalIds, ["signal:planning-1"]);
  assert.ok(result.dormantForDays !== null && result.dormantForDays >= 60);
  assert.equal(result.currentInterest, "NOT_ESTABLISHED");
  assert.equal(result.opportunityCertainty, "NOT_ESTABLISHED");
  assert.equal(result.buyerAuthority, "NOT_ESTABLISHED");
  assert.equal(result.introductionWillingness, "NOT_ESTABLISHED");
  assert.equal(result.budgetAvailability, "NOT_ESTABLISHED");
  assert.equal(result.timingCertainty, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.authority.outreachAllowed, false);
  assert.equal(result.authority.externalActionAllowed, false);
});

test("a fresh signal tied to another canonical opportunity cannot reactivate this opportunity", () => {
  const result = reviewDormantOpportunityRecoveryV1({
    history: history(),
    signals: [signal({ opportunityId: "opportunity:other" })],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "LIVE");
  assert.equal(result.disposition, "DORMANT_NO_RECOVERY_SIGNAL");
  assert.deepEqual(result.qualifyingSignalIds, []);
  assert.ok(result.reasonCodes.includes("OTHER_OPPORTUNITY_SIGNAL_IGNORED"));
});

test("terminal opportunity states stay suppressed even when new signals exist", () => {
  const result = reviewDormantOpportunityRecoveryV1({
    history: history({ lifecycleState: "CLOSED_LOST" }),
    signals: [signal()],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "LIVE");
  assert.equal(result.disposition, "SUPPRESSED");
  assert.ok(result.reasonCodes.includes("TERMINAL_OPPORTUNITY_STATE"));
  assert.deepEqual(result.qualifyingSignalIds, []);
});

test("do-not-contact state suppresses recovery and never grants outreach", () => {
  const result = reviewDormantOpportunityRecoveryV1({
    history: history({ doNotContact: true }),
    signals: [signal()],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.disposition, "SUPPRESSED");
  assert.ok(result.reasonCodes.includes("DO_NOT_CONTACT"));
  assert.equal(result.authority.outreachAllowed, false);
});

test("recently active opportunities are not mislabeled dormant", () => {
  const result = reviewDormantOpportunityRecoveryV1({
    history: history({ lastMeaningfulActivityAt: "2026-09-10T06:00:00.000Z", lifecycleState: "ACTIVE" }),
    signals: [signal()],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.disposition, "NOT_DORMANT");
  assert.ok(result.reasonCodes.includes("DORMANCY_THRESHOLD_NOT_MET"));
});

test("stale recovery evidence is retained as a reason but cannot create a recovery candidate", () => {
  const result = reviewDormantOpportunityRecoveryV1({
    history: history(),
    signals: [signal({ observedAt: "2026-07-01T06:00:00.000Z" })],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "LIVE");
  assert.equal(result.disposition, "DORMANT_NO_RECOVERY_SIGNAL");
  assert.ok(result.reasonCodes.includes("STALE_RECOVERY_SIGNAL_IGNORED"));
});

test("conflicted recovery evidence fails closed to verification", () => {
  const result = reviewDormantOpportunityRecoveryV1({
    history: history(),
    signals: [signal({ integrity: "CONFLICTED" })],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.disposition, "VERIFY_REQUIRED");
  assert.ok(result.reasonCodes.includes("RECOVERY_SIGNAL_CONFLICTED"));
});

test("future-dated recovery evidence fails closed", () => {
  const result = reviewDormantOpportunityRecoveryV1({
    history: history(),
    signals: [signal({ observedAt: "2026-09-20T06:00:00.000Z" })],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.disposition, "VERIFY_REQUIRED");
  assert.ok(result.reasonCodes.includes("RECOVERY_SIGNAL_FUTURE_DATED"));
});

test("a supported signal explicitly marked for verification cannot become a candidate", () => {
  const result = reviewDormantOpportunityRecoveryV1({
    history: history(),
    signals: [signal({ requiresVerification: true })],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.disposition, "VERIFY_REQUIRED");
  assert.ok(result.reasonCodes.includes("RECOVERY_SIGNAL_REQUIRES_VERIFICATION"));
});

test("partial or source-less signal evidence fails closed instead of being ignored as truth", () => {
  const partial = reviewDormantOpportunityRecoveryV1({
    history: history(),
    signals: [signal({ integrity: "PARTIAL" })],
    evaluatedAt: EVALUATED_AT,
  });
  assert.equal(partial.status, "BLOCKED");
  assert.equal(partial.disposition, "VERIFY_REQUIRED");
  assert.ok(partial.reasonCodes.includes("RECOVERY_SIGNAL_EVIDENCE_INCOMPLETE"));

  const sourceLess = reviewDormantOpportunityRecoveryV1({
    history: history(),
    signals: [signal({ sourceRef: "" })],
    evaluatedAt: EVALUATED_AT,
  });
  assert.equal(sourceLess.status, "BLOCKED");
  assert.equal(sourceLess.disposition, "VERIFY_REQUIRED");
});

test("unsupported historical opportunity truth blocks recovery review", () => {
  const result = reviewDormantOpportunityRecoveryV1({
    history: history({ integrity: "PARTIAL" }),
    signals: [signal()],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.disposition, "VERIFY_REQUIRED");
  assert.ok(result.reasonCodes.includes("HISTORY_EVIDENCE_INCOMPLETE"));
});

test("missing canonical history remains unavailable rather than creating an opportunity", () => {
  const result = reviewDormantOpportunityRecoveryV1({
    history: null,
    signals: [signal()],
    evaluatedAt: EVALUATED_AT,
  });

  assert.equal(result.status, "UNAVAILABLE");
  assert.equal(result.opportunityId, null);
  assert.equal(result.disposition, "UNAVAILABLE");
  assert.equal(result.authority.opportunityMutationAllowed, false);
});
