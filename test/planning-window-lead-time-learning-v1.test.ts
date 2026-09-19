import assert from "node:assert/strict";
import { test } from "node:test";

import {
  learnPlanningWindowLeadTimesV1,
  type PlanningWindowLeadTimeHistoricalSampleV1
} from "../src/lib/relationship-intelligence/planning-window-lead-time-learning-v1";

const NOW = "2026-09-19T19:00:00.000Z";
const THRESHOLDS = {
  earlyEnoughMinDays: 45,
  onTimeMinDays: 21,
  minimumCohortSamples: 2
} as const;

function sample(
  sampleId: string,
  firstDetectedAt: string,
  windowOpensAt: string,
  overrides: Partial<PlanningWindowLeadTimeHistoricalSampleV1> = {}
): PlanningWindowLeadTimeHistoricalSampleV1 {
  return {
    sampleId,
    cohortKey: "COLLEGE_SPONSORSHIP",
    detection: {
      state: "KNOWN",
      candidateId: `candidate-${sampleId}`,
      canonicalOrganizationRef: "org:uw",
      canonicalOpportunityRef: `opportunity:${sampleId}`,
      firstDetectedAt,
      recordedAt: firstDetectedAt,
      evidenceRefs: [`evidence:detection:${sampleId}`]
    },
    confirmedWindow: {
      state: "KNOWN",
      candidateId: `candidate-${sampleId}`,
      canonicalOrganizationRef: "org:uw",
      canonicalOpportunityRef: `opportunity:${sampleId}`,
      windowOpensAt,
      recordedAt: windowOpensAt,
      evidenceRefs: [`evidence:window:${sampleId}`]
    },
    ...overrides
  };
}

test("planning window learning reports only observed historical lead time and bounded cohort statistics", () => {
  const result = learnPlanningWindowLeadTimesV1({
    now: NOW,
    thresholds: THRESHOLDS,
    samples: [
      sample("early", "2026-06-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"),
      sample("on-time", "2026-07-10T00:00:00.000Z", "2026-08-01T00:00:00.000Z")
    ]
  });

  assert.equal(result.acceptedSamples.length, 2);
  assert.equal(result.acceptedSamples[0]!.classification, "EARLY_ENOUGH");
  assert.equal(result.acceptedSamples[0]!.observedLeadTimeDays, 61);
  assert.equal(result.acceptedSamples[1]!.classification, "ON_TIME");
  assert.equal(result.acceptedSamples[1]!.observedLeadTimeDays, 22);

  assert.equal(result.cohorts.length, 1);
  assert.equal(result.cohorts[0]!.status, "ESTABLISHED");
  assert.equal(result.cohorts[0]!.sampleCount, 2);
  assert.equal(result.cohorts[0]!.observedMinLeadTimeDays, 22);
  assert.equal(result.cohorts[0]!.observedMedianLeadTimeDays, 41.5);
  assert.equal(result.cohorts[0]!.observedMaxLeadTimeDays, 61);
  assert.deepEqual(result.cohorts[0]!.classificationCounts, { earlyEnough: 1, onTime: 1, late: 0 });

  assert.equal(result.historicalObservationOnly, true);
  assert.equal(result.predictionPerformed, false);
  assert.equal(result.confidenceInferred, false);
  assert.equal(result.causalityInferred, false);
  assert.equal(result.monetaryValueInferred, false);
  assert.equal(result.opportunityCertaintyInferred, false);
  assert.equal(result.externalActionAuthorized, false);
});

test("planning window learning fails closed on weak evidence, future openings, and anchor mismatches", () => {
  const unknown = sample("unknown", "2026-06-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z", {
    detection: {
      state: "UNKNOWN",
      candidateId: "candidate-unknown",
      canonicalOrganizationRef: "org:uw",
      canonicalOpportunityRef: "opportunity:unknown",
      firstDetectedAt: "2026-06-01T00:00:00.000Z",
      recordedAt: "2026-06-01T00:00:00.000Z",
      evidenceRefs: ["evidence:detection:unknown"]
    }
  });
  const future = sample("future", "2026-09-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z");
  const mismatch = sample("mismatch", "2026-06-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z", {
    confirmedWindow: {
      state: "KNOWN",
      candidateId: "candidate-other",
      canonicalOrganizationRef: "org:uw",
      canonicalOpportunityRef: "opportunity:mismatch",
      windowOpensAt: "2026-08-01T00:00:00.000Z",
      recordedAt: "2026-08-01T00:00:00.000Z",
      evidenceRefs: ["evidence:window:mismatch"]
    }
  });

  const result = learnPlanningWindowLeadTimesV1({ now: NOW, thresholds: THRESHOLDS, samples: [unknown, future, mismatch] });

  assert.equal(result.acceptedSamples.length, 0);
  assert.deepEqual(
    result.withheldSamples.map((entry) => [entry.sampleId, entry.reason]),
    [
      ["future", "FUTURE_WINDOW_OPEN"],
      ["mismatch", "ANCHOR_MISMATCH"],
      ["unknown", "DETECTION_NOT_KNOWN"]
    ]
  );
  assert.equal(result.cohorts.length, 0);
});

test("planning window learning does not establish cohort behavior below the explicit sample floor", () => {
  const result = learnPlanningWindowLeadTimesV1({
    now: NOW,
    thresholds: { ...THRESHOLDS, minimumCohortSamples: 3 },
    samples: [
      sample("one", "2026-06-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"),
      sample("two", "2026-06-15T00:00:00.000Z", "2026-08-01T00:00:00.000Z")
    ]
  });

  assert.equal(result.cohorts[0]!.status, "NOT_ESTABLISHED");
  assert.equal(result.cohorts[0]!.sampleCount, 2);
  assert.equal(result.cohorts[0]!.observedMedianLeadTimeDays, null);
  assert.equal(result.cohorts[0]!.classificationCounts, null);
});

test("planning window learning requires explicit non-overlapping threshold semantics", () => {
  assert.throws(
    () =>
      learnPlanningWindowLeadTimesV1({
        now: NOW,
        thresholds: { earlyEnoughMinDays: 21, onTimeMinDays: 21, minimumCohortSamples: 2 },
        samples: []
      }),
    /earlyEnoughMinDays must be greater/
  );
});
