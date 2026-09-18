import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateEarlyPlanningWindowsV1,
  type EarlyPlanningCandidateV1,
  type EarlyPlanningDateRangeEvidenceV1,
  type EarlyPlanningLeadTimeEvidenceV1,
  type EarlyPlanningTruthStateV1
} from "../../src/lib/relationship-intelligence/early-planning-window-v1";

const NOW = "2026-09-18T06:00:00.000Z";

function dateRange(
  startDate: string | null,
  endDate: string | null,
  state: EarlyPlanningTruthStateV1 = "KNOWN",
  evidenceRefs: readonly string[] = ["evidence:timing"]
): EarlyPlanningDateRangeEvidenceV1 {
  return { state, startDate, endDate, evidenceRefs };
}

function leadTime(
  minDays: number | null,
  maxDays: number | null,
  state: EarlyPlanningTruthStateV1 = "KNOWN",
  evidenceRefs: readonly string[] = ["evidence:lead-time"]
): EarlyPlanningLeadTimeEvidenceV1 {
  return { state, minDays, maxDays, evidenceRefs };
}

function candidate(overrides: Partial<EarlyPlanningCandidateV1> = {}): EarlyPlanningCandidateV1 {
  return {
    candidateId: "opportunity:college-sponsor-2027",
    canonicalOrganizationRef: "org:brand",
    canonicalOpportunityRef: "opportunity:college-sponsor-2027",
    observedAt: "2026-09-17T18:00:00.000Z",
    evidenceRefs: ["evidence:source", "evidence:source"],
    planningWindow: dateRange("2026-12-01T00:00:00.000Z", "2027-01-31T23:59:59.000Z"),
    activationWindow: dateRange("2027-09-01T00:00:00.000Z", "2027-12-31T23:59:59.000Z", "KNOWN", ["evidence:season"]),
    engagementLeadTimeDays: leadTime(180, 270),
    productionLeadTimeDays: leadTime(90, 120, "KNOWN", ["evidence:production"]),
    ...overrides
  };
}

function evaluate(candidates: readonly EarlyPlanningCandidateV1[]) {
  return evaluateEarlyPlanningWindowsV1({ candidates, now: NOW });
}

test("uses an explicit evidence-backed planning window without substituting the event date", () => {
  const result = evaluate([candidate()]);
  const decision = result.decisions[0];

  assert.equal(decision.disposition, "PLAN_AHEAD");
  assert.equal(decision.derivation, "EXPLICIT_PLANNING_WINDOW");
  assert.deepEqual(decision.idealOutreachDateRange, {
    startDate: "2026-12-01T00:00:00.000Z",
    endDate: "2027-01-31T23:59:59.000Z"
  });
  assert.equal(decision.activationDateRange?.startDate, "2027-09-01T00:00:00.000Z");
  assert.notEqual(decision.idealOutreachDateRange?.startDate, decision.activationDateRange?.startDate);
});

test("derives outreach timing only from a known activation date plus evidenced engagement lead time", () => {
  const result = evaluate([
    candidate({
      planningWindow: dateRange(null, null, "UNKNOWN", []),
      activationWindow: dateRange("2027-09-01T00:00:00.000Z", "2027-09-30T23:59:59.000Z"),
      engagementLeadTimeDays: leadTime(180, 270)
    })
  ]);
  const decision = result.decisions[0];

  assert.equal(decision.derivation, "DERIVED_FROM_ACTIVATION_AND_EVIDENCED_LEAD_TIME");
  assert.deepEqual(decision.idealOutreachDateRange, {
    startDate: "2026-12-05T00:00:00.000Z",
    endDate: "2027-03-05T00:00:00.000Z"
  });
  assert.equal(decision.disposition, "PLAN_AHEAD");
  assert.equal(decision.coverageGaps.includes("PLANNING_WINDOW_UNKNOWN"), false);
});

test("never treats an event or season date by itself as a planning window", () => {
  const result = evaluate([
    candidate({
      planningWindow: dateRange(null, null, "UNKNOWN", []),
      activationWindow: dateRange("2027-09-01T00:00:00.000Z", "2027-12-31T23:59:59.000Z"),
      engagementLeadTimeDays: leadTime(null, null, "UNKNOWN", [])
    })
  ]);
  const decision = result.decisions[0];

  assert.equal(decision.idealOutreachDateRange, null);
  assert.equal(decision.derivation, null);
  assert.equal(decision.disposition, "NEEDS_RESEARCH");
  assert.ok(decision.coverageGaps.includes("PLANNING_WINDOW_UNKNOWN"));
  assert.ok(decision.coverageGaps.includes("ENGAGEMENT_LEAD_TIME_UNKNOWN"));
  assert.equal(decision.activationDateRange?.startDate, "2027-09-01T00:00:00.000Z");
});

test("routes inferred, partial, stale, and conflicted planning evidence to verification", () => {
  const variants: readonly EarlyPlanningTruthStateV1[] = ["INFERRED", "PARTIAL", "STALE", "CONFLICTED"];

  for (const state of variants) {
    const result = evaluate([
      candidate({
        candidateId: `candidate:${state}`,
        canonicalOpportunityRef: `candidate:${state}`,
        planningWindow: dateRange("2026-12-01T00:00:00.000Z", "2027-01-31T23:59:59.000Z", state)
      })
    ]);
    assert.equal(result.decisions[0].disposition, "NEEDS_VERIFICATION");
  }
});

test("marks a currently open evidenced planning window without authorizing outreach", () => {
  const result = evaluate([
    candidate({
      planningWindow: dateRange("2026-09-01T00:00:00.000Z", "2026-10-15T23:59:59.000Z")
    })
  ]);
  const decision = result.decisions[0];

  assert.equal(decision.disposition, "WINDOW_OPEN");
  assert.equal(decision.safeNextStep, "PREPARE_APPROVAL_READY_OUTREACH");
  assert.equal(result.outreachPerformed, false);
  assert.equal(result.externalActionAuthorized, false);
});

test("marks an evidenced outreach window as missed once its end has passed", () => {
  const result = evaluate([
    candidate({
      planningWindow: dateRange("2026-05-01T00:00:00.000Z", "2026-07-31T23:59:59.000Z")
    })
  ]);
  const decision = result.decisions[0];

  assert.equal(decision.disposition, "MISSED_PLANNING_WINDOW");
  assert.equal(decision.safeNextStep, "REVIEW_MISSED_WINDOW_AND_FIND_NEXT_CYCLE");
});

test("keeps production timing separate from outreach timing", () => {
  const result = evaluate([
    candidate({
      planningWindow: dateRange(null, null, "UNKNOWN", []),
      activationWindow: dateRange("2027-09-01T00:00:00.000Z", "2027-09-30T23:59:59.000Z"),
      engagementLeadTimeDays: leadTime(180, 270),
      productionLeadTimeDays: leadTime(90, 120, "KNOWN", ["evidence:production-window"])
    })
  ]);
  const decision = result.decisions[0];

  assert.deepEqual(decision.idealOutreachDateRange, {
    startDate: "2026-12-05T00:00:00.000Z",
    endDate: "2027-03-05T00:00:00.000Z"
  });
  assert.deepEqual(decision.productionStartDateRange, {
    startDate: "2027-05-04T00:00:00.000Z",
    endDate: "2027-06-03T00:00:00.000Z"
  });
});

test("suppresses timing recommendations without a canonical anchor or candidate evidence", () => {
  const missingAnchor = candidate({
    candidateId: "missing-anchor",
    canonicalOrganizationRef: null,
    canonicalOpportunityRef: null
  });
  const missingEvidence = candidate({
    candidateId: "missing-evidence",
    canonicalOpportunityRef: "missing-evidence",
    evidenceRefs: []
  });
  const result = evaluate([missingAnchor, missingEvidence]);

  assert.equal(result.decisions.find((item) => item.candidateId === "missing-anchor")?.disposition, "SUPPRESS");
  assert.equal(result.decisions.find((item) => item.candidateId === "missing-evidence")?.disposition, "SUPPRESS");
});

test("rejects invalid ranges and future-dated evidence instead of fabricating timing", () => {
  assert.throws(
    () =>
      evaluate([
        candidate({
          planningWindow: dateRange("2027-02-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z")
        })
      ]),
    /startDate must be on or before endDate/
  );

  assert.throws(
    () =>
      evaluate([
        candidate({
          engagementLeadTimeDays: leadTime(270, 180)
        })
      ]),
    /minDays <= maxDays/
  );

  assert.throws(
    () =>
      evaluate([
        candidate({
          observedAt: "2026-09-19T00:00:00.000Z"
        })
      ]),
    /must not be future-dated/
  );
});

test("treats old timing evidence as stale even when its values look complete", () => {
  const result = evaluateEarlyPlanningWindowsV1({
    candidates: [candidate({ observedAt: "2025-01-01T00:00:00.000Z" })],
    now: NOW,
    maximumEvidenceAgeDays: 180
  });

  assert.equal(result.decisions[0].disposition, "NEEDS_VERIFICATION");
  assert.ok(result.decisions[0].coverageGaps.includes("TIMING_EVIDENCE_STALE"));
});

test("is deterministic, deeply immutable, deduplicates evidence refs, and performs zero external side effects", () => {
  const input = { candidates: [candidate()], now: NOW } as const;
  const first = evaluateEarlyPlanningWindowsV1(input);
  const second = evaluateEarlyPlanningWindowsV1(input);

  assert.deepEqual(first, second);
  assert.deepEqual(first.decisions[0].evidenceRefs, [
    "evidence:lead-time",
    "evidence:production",
    "evidence:season",
    "evidence:source",
    "evidence:timing"
  ]);
  assert.equal(first.externalResearchPerformed, false);
  assert.equal(first.crmMutationPerformed, false);
  assert.equal(first.outreachPerformed, false);
  assert.equal(first.externalActionAuthorized, false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.decisions), true);
  assert.equal(Object.isFrozen(first.decisions[0]), true);
  assert.equal(Object.isFrozen(first.decisions[0].idealOutreachDateRange), true);
});
