import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateEarlyPlanningWindowsV1,
  type EarlyPlanningCandidateV1,
} from "../../src/lib/relationship-intelligence/early-planning-window-v1";
import {
  reviewNextPlanningCyclesV1,
  type PlanningCycleRecurrenceEvidenceV1,
} from "../../src/lib/relationship-intelligence/next-planning-cycle-review-v1";

const NOW = "2026-09-19T12:30:00.000Z";

function candidate(overrides: Partial<EarlyPlanningCandidateV1> = {}): EarlyPlanningCandidateV1 {
  return {
    candidateId: "opportunity:uw-sponsor-2027",
    canonicalOrganizationRef: "org:sponsor",
    canonicalOpportunityRef: "opportunity:uw-sponsor-2027",
    observedAt: "2026-09-18T16:00:00.000Z",
    evidenceRefs: ["evidence:planning-window"],
    planningWindow: {
      state: "KNOWN",
      startDate: "2026-06-01T00:00:00.000Z",
      endDate: "2026-07-31T23:59:59.000Z",
      evidenceRefs: ["evidence:planning-window"],
    },
    activationWindow: null,
    engagementLeadTimeDays: null,
    productionLeadTimeDays: null,
    ...overrides,
  };
}

function planning(candidates: readonly EarlyPlanningCandidateV1[] = [candidate()]) {
  return evaluateEarlyPlanningWindowsV1({ candidates, now: NOW });
}

function recurrence(overrides: Partial<PlanningCycleRecurrenceEvidenceV1> = {}): PlanningCycleRecurrenceEvidenceV1 {
  return {
    candidateId: "opportunity:uw-sponsor-2027",
    canonicalOpportunityRef: "opportunity:uw-sponsor-2027",
    canonicalOrganizationRef: "org:sponsor",
    state: "KNOWN",
    intervalMonths: 12,
    observedAt: "2026-09-18T18:00:00.000Z",
    evidenceRefs: ["evidence:annual-planning-cycle"],
    ...overrides,
  };
}

function review(
  recurrenceEvidence: readonly PlanningCycleRecurrenceEvidenceV1[],
  candidates: readonly EarlyPlanningCandidateV1[] = [candidate()],
) {
  return reviewNextPlanningCyclesV1({
    planning: planning(candidates),
    recurrenceEvidence,
    evaluatedAt: NOW,
  });
}

test("projects the next outreach range only from exact KNOWN recurrence evidence", () => {
  const result = review([recurrence()]);
  const decision = result.decisions[0];

  assert.equal(result.status, "READY");
  assert.equal(decision.disposition, "NEXT_CYCLE_CANDIDATE");
  assert.equal(decision.cycleState, "PLAN_AHEAD");
  assert.equal(decision.derivation, "EVIDENCED_RECURRENCE_FROM_PRIOR_WINDOW");
  assert.equal(decision.recurrenceIntervalMonths, 12);
  assert.equal(decision.cyclesAdvanced, 1);
  assert.deepEqual(decision.nextIdealOutreachDateRange, {
    startDate: "2027-06-01T00:00:00.000Z",
    endDate: "2027-07-31T23:59:59.000Z",
  });
  assert.deepEqual(decision.evidenceRefs, ["evidence:annual-planning-cycle", "evidence:planning-window"]);
  assert.equal(decision.confidence, "NOT_ESTABLISHED");
  assert.equal(decision.sponsorInterest, "NOT_ESTABLISHED");
  assert.equal(decision.budgetAvailability, "NOT_ESTABLISHED");
  assert.equal(decision.outreachAuthority, "NOT_GRANTED");
});

test("advances multiple evidenced cycles instead of reviving a still-missed window", () => {
  const old = candidate({
    observedAt: "2026-09-18T16:00:00.000Z",
    planningWindow: {
      state: "KNOWN",
      startDate: "2024-06-01T00:00:00.000Z",
      endDate: "2024-07-31T23:59:59.000Z",
      evidenceRefs: ["evidence:old-planning-window"],
    },
    evidenceRefs: ["evidence:old-planning-window"],
  });
  const result = review([recurrence()], [old]);
  const decision = result.decisions[0];

  assert.equal(decision.cyclesAdvanced, 3);
  assert.deepEqual(decision.nextIdealOutreachDateRange, {
    startDate: "2027-06-01T00:00:00.000Z",
    endDate: "2027-07-31T23:59:59.000Z",
  });
});

test("keeps a missed opportunity in research when recurrence evidence is absent or unknown", () => {
  const absent = review([]);
  assert.equal(absent.status, "READY");
  assert.equal(absent.decisions[0].disposition, "RESEARCH_REQUIRED");
  assert.equal(absent.decisions[0].nextIdealOutreachDateRange, null);
  assert.deepEqual(absent.decisions[0].reasonCodes, ["RECURRENCE_EVIDENCE_MISSING"]);

  const unknown = review([
    recurrence({ state: "UNKNOWN", intervalMonths: null, evidenceRefs: ["evidence:recurrence-unknown"] }),
  ]);
  assert.equal(unknown.status, "READY");
  assert.equal(unknown.decisions[0].disposition, "RESEARCH_REQUIRED");
  assert.equal(unknown.decisions[0].nextIdealOutreachDateRange, null);
  assert.deepEqual(unknown.decisions[0].reasonCodes, ["RECURRENCE_INTERVAL_UNKNOWN"]);
});

test("routes inferred, partial, stale, and conflicted recurrence evidence to verification", () => {
  for (const state of ["INFERRED", "PARTIAL", "STALE", "CONFLICTED"] as const) {
    const result = review([
      recurrence({ state, intervalMonths: 12, evidenceRefs: [`evidence:${state.toLowerCase()}`] }),
    ]);

    assert.equal(result.status, "VERIFY_REQUIRED");
    assert.equal(result.decisions[0].disposition, "VERIFY_REQUIRED");
    assert.equal(result.decisions[0].nextIdealOutreachDateRange, null);
    assert.deepEqual(result.decisions[0].reasonCodes, [`RECURRENCE_EVIDENCE_${state}`]);
  }
});

test("fails closed when recurrence evidence does not match exact canonical opportunity identity", () => {
  const wrongOpportunity = review([
    recurrence({ canonicalOpportunityRef: "opportunity:different" }),
  ]);
  assert.equal(wrongOpportunity.status, "VERIFY_REQUIRED");
  assert.equal(wrongOpportunity.decisions[0].disposition, "VERIFY_REQUIRED");
  assert.equal(wrongOpportunity.decisions[0].nextIdealOutreachDateRange, null);
  assert.deepEqual(wrongOpportunity.decisions[0].reasonCodes, ["RECURRENCE_CANONICAL_IDENTITY_MISMATCH"]);

  const wrongOrganization = review([
    recurrence({ canonicalOrganizationRef: "org:different" }),
  ]);
  assert.equal(wrongOrganization.status, "VERIFY_REQUIRED");
  assert.equal(wrongOrganization.decisions[0].nextIdealOutreachDateRange, null);
});

test("fails closed on ambiguous duplicate recurrence evidence for the same candidate", () => {
  const result = review([
    recurrence(),
    recurrence({ observedAt: "2026-09-18T19:00:00.000Z", evidenceRefs: ["evidence:second-cycle-claim"] }),
  ]);

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.deepEqual(result.decisions, []);
  assert.deepEqual(result.issues, ["AMBIGUOUS_RECURRENCE_EVIDENCE:opportunity:uw-sponsor-2027"]);
});

test("blocks future-dated and over-age recurrence evidence rather than manufacturing timing", () => {
  const future = review([
    recurrence({ observedAt: "2026-09-20T00:00:00.000Z" }),
  ]);
  assert.equal(future.status, "VERIFY_REQUIRED");
  assert.deepEqual(future.decisions[0].reasonCodes, ["RECURRENCE_EVIDENCE_FUTURE_DATED"]);
  assert.equal(future.decisions[0].nextIdealOutreachDateRange, null);

  const stale = reviewNextPlanningCyclesV1({
    planning: planning(),
    recurrenceEvidence: [recurrence({ observedAt: "2026-01-01T00:00:00.000Z" })],
    evaluatedAt: NOW,
    maxRecurrenceAgeDays: 30,
  });
  assert.equal(stale.status, "VERIFY_REQUIRED");
  assert.deepEqual(stale.decisions[0].reasonCodes, ["RECURRENCE_EVIDENCE_STALE"]);
  assert.equal(stale.decisions[0].nextIdealOutreachDateRange, null);
});

test("does not create recurrence work when no planning window is actually missed", () => {
  const futureCandidate = candidate({
    planningWindow: {
      state: "KNOWN",
      startDate: "2027-06-01T00:00:00.000Z",
      endDate: "2027-07-31T23:59:59.000Z",
      evidenceRefs: ["evidence:future-planning-window"],
    },
    evidenceRefs: ["evidence:future-planning-window"],
  });
  const result = review([recurrence()], [futureCandidate]);

  assert.equal(result.status, "NO_MISSED_WINDOWS");
  assert.deepEqual(result.decisions, []);
});

test("requires a fresh planning review before projecting any recurrence", () => {
  const oldPlanning = evaluateEarlyPlanningWindowsV1({
    candidates: [candidate({ observedAt: "2026-09-17T00:00:00.000Z" })],
    now: "2026-09-17T12:00:00.000Z",
  });
  const result = reviewNextPlanningCyclesV1({
    planning: oldPlanning,
    recurrenceEvidence: [recurrence()],
    evaluatedAt: NOW,
    maxPlanningAgeMs: 12 * 60 * 60 * 1_000,
  });

  assert.equal(result.status, "STALE");
  assert.deepEqual(result.decisions, []);
  assert.deepEqual(result.issues, ["PLANNING_REVIEW_OUTSIDE_FRESHNESS_BOUND"]);
});

test("requires canonical opportunity identity and does not promote organization-only timing", () => {
  const organizationOnly = candidate({ canonicalOpportunityRef: null });
  const result = review([
    recurrence({ canonicalOpportunityRef: "opportunity:uw-sponsor-2027" }),
  ], [organizationOnly]);

  assert.equal(result.status, "READY");
  assert.equal(result.decisions[0].disposition, "RESEARCH_REQUIRED");
  assert.equal(result.decisions[0].nextIdealOutreachDateRange, null);
  assert.ok(result.decisions[0].reasonCodes.includes("CANONICAL_OPPORTUNITY_IDENTITY_MISSING"));
});

test("is deterministic, deeply immutable, and grants no mutation or outreach authority", () => {
  const input = {
    planning: planning(),
    recurrenceEvidence: [recurrence()],
    evaluatedAt: NOW,
  } as const;
  const first = reviewNextPlanningCyclesV1(input);
  const second = reviewNextPlanningCyclesV1(input);

  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.decisions), true);
  assert.equal(Object.isFrozen(first.decisions[0]), true);
  assert.equal(Object.isFrozen(first.decisions[0].nextIdealOutreachDateRange), true);
  assert.equal(first.authority.crmMutationAllowed, false);
  assert.equal(first.authority.opportunityMutationAllowed, false);
  assert.equal(first.authority.relationshipMutationAllowed, false);
  assert.equal(first.authority.contactDiscoveryAllowed, false);
  assert.equal(first.authority.outreachAllowed, false);
  assert.equal(first.authority.spendAllowed, false);
  assert.equal(first.authority.contractAllowed, false);
  assert.equal(first.authority.approvalBypassAllowed, false);
  assert.equal(first.authority.externalActionAllowed, false);
});
