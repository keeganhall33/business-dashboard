import assert from "node:assert/strict";
import test from "node:test";

import {
  gateClarityLiveExportV1,
  type ClarityLiveExportInputV1,
} from "../../src/lib/clarity-behavior/live-export-gate-v1";

function input(overrides: Partial<ClarityLiveExportInputV1> = {}): ClarityLiveExportInputV1 {
  return {
    source: "MICROSOFT_CLARITY_DATA_EXPORT_API",
    sourceTruth: "COMPLETE",
    lookbackDays: 1,
    requestedWindow: {
      startAt: "2026-09-17T07:00:00.000Z",
      endAt: "2026-09-18T07:00:00.000Z",
    },
    observedWindow: {
      startAt: "2026-09-17T07:00:00.000Z",
      endAt: "2026-09-18T07:00:00.000Z",
    },
    extractedAt: "2026-09-18T07:05:00.000Z",
    now: "2026-09-18T07:10:00.000Z",
    maxAgeHours: 6,
    dimensions: ["URL"],
    responseRows: 42,
    rowLimitReached: false,
    evidenceRefs: ["clarity:export:2026-09-18:07:05Z"],
    metrics: [
      {
        providerMetric: "Traffic totalSessionCount",
        canonicalMetric: "sessions",
        semantic: "SESSION_COUNT",
        value: 438,
        evidenceRef: "clarity:export:2026-09-18:07:05Z",
      },
      {
        providerMetric: "Traffic distinct users",
        canonicalMetric: "uniqueUsers",
        semantic: "DISTINCT_USER_COUNT",
        value: 327,
        evidenceRef: "clarity:export:2026-09-18:07:05Z",
      },
      {
        providerMetric: "Traffic pages per session",
        canonicalMetric: "pagesPerSession",
        semantic: "AVERAGE_PER_SESSION",
        value: 2.94,
        evidenceRef: "clarity:export:2026-09-18:07:05Z",
      },
      {
        providerMetric: "Scroll Depth",
        canonicalMetric: "scrollDepthPercent",
        semantic: "PERCENT",
        value: 65.55,
        evidenceRef: "clarity:export:2026-09-18:07:05Z",
      },
      {
        providerMetric: "Engagement Time",
        canonicalMetric: "activeTimeSeconds",
        semantic: "SECONDS",
        value: 54,
        evidenceRef: "clarity:export:2026-09-18:07:05Z",
      },
    ],
    ...overrides,
  };
}

function fullSessionScopedMetrics() {
  const base = input().metrics;
  return [
    ...base,
    {
      providerMetric: "Dead click affected sessions",
      canonicalMetric: "deadClickSessions" as const,
      semantic: "SESSION_AFFECTED_COUNT" as const,
      value: 67,
      evidenceRef: "clarity:export:2026-09-18:07:05Z",
    },
    {
      providerMetric: "Quick back affected sessions",
      canonicalMetric: "quickBackSessions" as const,
      semantic: "SESSION_AFFECTED_COUNT" as const,
      value: 70,
      evidenceRef: "clarity:export:2026-09-18:07:05Z",
    },
  ];
}

test("accepts an exact fresh supported export for bounded history", () => {
  const result = gateClarityLiveExportV1(input());

  assert.equal(result.gateState, "ACCEPTED_FOR_HISTORY");
  assert.equal(result.sourceTruth, "COMPLETE");
  assert.equal(result.projectedMetrics.sessions, 438);
  assert.equal(result.projectedMetrics.activeTimeSeconds, 54);
  assert.equal(result.periodProjectionComplete, false);
  assert.ok(result.reasonCodes.includes("PERIOD_PROJECTION_INCOMPLETE"));
  assert.equal(result.coverage.maxSupportedLookbackDays, 3);
  assert.equal(result.coverage.paginationSupported, false);
  assert.equal(result.coverage.maxRequestsPerProjectPerDay, 10);
  assert.equal(result.authority.externalMutationAllowed, false);
  assert.equal(result.authority.metaWriteAllowed, false);
});

test("marks a period projection complete only when required session-scoped metrics are explicit", () => {
  const result = gateClarityLiveExportV1(input({ metrics: fullSessionScopedMetrics() }));

  assert.equal(result.gateState, "ACCEPTED_FOR_HISTORY");
  assert.equal(result.periodProjectionComplete, true);
  assert.equal(result.projectedMetrics.deadClickSessions, 67);
  assert.equal(result.projectedMetrics.quickBackSessions, 70);
  assert.deepEqual(result.reasonCodes, ["ACCEPTED"]);
});

test("rejects unsupported four-day lookbacks instead of pretending the live API covers them", () => {
  const result = gateClarityLiveExportV1(input({ lookbackDays: 4 }));

  assert.equal(result.gateState, "REJECTED");
  assert.deepEqual(result.reasonCodes, ["UNSUPPORTED_LOOKBACK"]);
  assert.match(result.safeNextStep, /1-, 2-, or 3-day/);
});

test("fails closed when the observed UTC window differs from the requested window", () => {
  const result = gateClarityLiveExportV1(input({
    observedWindow: {
      startAt: "2026-09-17T08:00:00.000Z",
      endAt: "2026-09-18T08:00:00.000Z",
    },
  }));

  assert.equal(result.gateState, "REJECTED");
  assert.deepEqual(result.reasonCodes, ["OBSERVED_WINDOW_MISMATCH"]);
});

test("rejects stale extraction evidence", () => {
  const result = gateClarityLiveExportV1(input({
    extractedAt: "2026-09-17T20:00:00.000Z",
    now: "2026-09-18T07:10:00.000Z",
    maxAgeHours: 6,
  }));

  assert.equal(result.gateState, "REJECTED");
  assert.deepEqual(result.reasonCodes, ["EXTRACTION_STALE"]);
});

test("keeps a response that reaches the unpaginated row limit partial", () => {
  const result = gateClarityLiveExportV1(input({
    responseRows: 1_000,
    rowLimitReached: false,
  }));

  assert.equal(result.gateState, "PARTIAL_ONLY");
  assert.ok(result.reasonCodes.includes("ROW_LIMIT_MAY_TRUNCATE"));
  assert.match(result.safeNextStep, /partial evidence/);
});

test("preserves source truth and fails closed on conflicted or unavailable provider evidence", () => {
  const conflicted = gateClarityLiveExportV1(input({ sourceTruth: "CONFLICTED" }));
  const unavailable = gateClarityLiveExportV1(input({ sourceTruth: "UNAVAILABLE" }));
  const partial = gateClarityLiveExportV1(input({ sourceTruth: "PARTIAL" }));

  assert.equal(conflicted.gateState, "REJECTED");
  assert.deepEqual(conflicted.reasonCodes, ["SOURCE_CONFLICTED"]);
  assert.equal(unavailable.gateState, "REJECTED");
  assert.deepEqual(unavailable.reasonCodes, ["SOURCE_UNAVAILABLE"]);
  assert.equal(partial.gateState, "PARTIAL_ONLY");
  assert.equal(partial.sourceTruth, "PARTIAL");
  assert.ok(partial.reasonCodes.includes("SOURCE_PARTIAL"));
});

test("requires exact provenance for every projected metric", () => {
  const result = gateClarityLiveExportV1(input({
    metrics: [{
      providerMetric: "Traffic totalSessionCount",
      canonicalMetric: "sessions",
      semantic: "SESSION_COUNT",
      value: 438,
      evidenceRef: "clarity:other-export",
    }],
  }));

  assert.equal(result.gateState, "REJECTED");
  assert.deepEqual(result.reasonCodes, ["MISSING_PROVENANCE"]);
  assert.deepEqual(result.projectedMetrics, {});
});

test("preserves unknown metric values rather than coercing them to zero", () => {
  const result = gateClarityLiveExportV1(input({
    metrics: [{
      providerMetric: "Traffic totalSessionCount",
      canonicalMetric: "sessions",
      semantic: "SESSION_COUNT",
      value: null,
      evidenceRef: "clarity:export:2026-09-18:07:05Z",
    }],
  }));

  assert.equal(result.gateState, "ACCEPTED_FOR_HISTORY");
  assert.equal(result.projectedMetrics.sessions, undefined);
  assert.ok(result.reasonCodes.includes("METRIC_VALUE_UNKNOWN"));
  assert.equal(result.unprojectedMetrics[0]?.value, null);
});

test("never relabels documented Clarity interaction counts as affected-session counts", () => {
  const result = gateClarityLiveExportV1(input({
    metrics: [{
      providerMetric: "Dead Click Count",
      canonicalMetric: "deadClickSessions",
      semantic: "INTERACTION_COUNT",
      value: 67,
      evidenceRef: "clarity:export:2026-09-18:07:05Z",
    }, {
      providerMetric: "Quickback Click",
      canonicalMetric: "quickBackSessions",
      semantic: "INTERACTION_COUNT",
      value: 70,
      evidenceRef: "clarity:export:2026-09-18:07:05Z",
    }],
  }));

  assert.equal(result.projectedMetrics.deadClickSessions, undefined);
  assert.equal(result.projectedMetrics.quickBackSessions, undefined);
  assert.ok(result.reasonCodes.includes("EVENT_COUNT_NOT_SESSION_COUNT"));
  assert.equal(result.unprojectedMetrics.length, 2);
  assert.ok(result.unprojectedMetrics.every((metric) => metric.reasonCode === "EVENT_COUNT_NOT_SESSION_COUNT"));
});

test("rejects conflicting values for the same canonical metric", () => {
  const result = gateClarityLiveExportV1(input({
    metrics: [{
      providerMetric: "Traffic A",
      canonicalMetric: "sessions",
      semantic: "SESSION_COUNT",
      value: 438,
      evidenceRef: "clarity:export:2026-09-18:07:05Z",
    }, {
      providerMetric: "Traffic B",
      canonicalMetric: "sessions",
      semantic: "SESSION_COUNT",
      value: 439,
      evidenceRef: "clarity:export:2026-09-18:07:05Z",
    }],
  }));

  assert.equal(result.gateState, "REJECTED");
  assert.deepEqual(result.reasonCodes, ["CONFLICTING_METRIC_OBSERVATIONS"]);
  assert.deepEqual(result.projectedMetrics, {});
});

test("rejects unexpected credential-like fields at the live truth boundary", () => {
  const malformed = {
    ...input(),
    accessToken: "must-not-cross-boundary",
  } as unknown as ClarityLiveExportInputV1;
  const result = gateClarityLiveExportV1(malformed);

  assert.equal(result.gateState, "REJECTED");
  assert.deepEqual(result.reasonCodes, ["INVALID_INPUT"]);
});

test("is deterministic, immutable, and performs no external action", () => {
  const source = input({ metrics: fullSessionScopedMetrics() });
  const first = gateClarityLiveExportV1(source);
  const second = gateClarityLiveExportV1(source);

  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.projectedMetrics), true);
  assert.equal(Object.isFrozen(first.coverage.dimensions), true);
  assert.deepEqual(first.authority, {
    networkCallPerformed: false,
    credentialAccessPerformed: false,
    persistencePerformed: false,
    externalMutationAllowed: false,
    metaWriteAllowed: false,
  });
  assert.equal(source.metrics.length, 7);
});
