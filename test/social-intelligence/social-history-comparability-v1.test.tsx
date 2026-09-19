import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCanonicalSocialAccountSnapshotV1,
  type SocialPeriodInputV1
} from "../../src/lib/social-intelligence/social-canonical-v1";
import { compileSocialHistoryComparabilityV1 } from "../../src/lib/social-intelligence/social-history-comparability-v1";

const now = "2026-09-19T06:00:00Z";

function period(
  periodId: string,
  startAt: string,
  endAt: string,
  audience: number | null,
  reach: number | null,
  withEvidence = true
): SocialPeriodInputV1 {
  return {
    periodId,
    window: "7D",
    startAt,
    endAt,
    metrics: {
      AUDIENCE_TOTAL: {
        value: audience,
        evidenceRefs: withEvidence && audience != null ? [`provider:instagram:${periodId}:audience`] : []
      },
      REACH: {
        value: reach,
        evidenceRefs: withEvidence && reach != null ? [`provider:instagram:${periodId}:reach`] : []
      }
    }
  };
}

function snapshot(options?: {
  periods?: readonly SocialPeriodInputV1[];
  retrievedAt?: string;
  lastSuccessfulSyncAt?: string | null;
  requestedState?: "CONNECTED_AND_INGESTING" | "CONNECTED_PARTIAL";
}) {
  const retrievedAt = options?.retrievedAt ?? "2026-09-19T05:30:00Z";
  return compileCanonicalSocialAccountSnapshotV1(
    {
      platform: "INSTAGRAM",
      accountId: "keegan-hall",
      handle: "@keeganhall",
      retrievedAt,
      sourceCoverage: {
        requestedState: options?.requestedState ?? "CONNECTED_AND_INGESTING",
        lastSuccessfulSyncAt: options?.lastSuccessfulSyncAt === undefined ? retrievedAt : options.lastSuccessfulSyncAt,
        metricCoverage: ["AUDIENCE_TOTAL", "REACH"]
      },
      periods: options?.periods ?? [
        period("current", "2026-09-12T00:00:00Z", "2026-09-19T00:00:00Z", 12_600, 42_000),
        period("prior", "2026-09-05T00:00:00Z", "2026-09-12T00:00:00Z", 12_400, 39_000)
      ]
    },
    retrievedAt
  );
}

test("certifies only fresh contiguous named windows with evidence-backed comparable metrics", () => {
  const result = compileSocialHistoryComparabilityV1(snapshot(), { now, windows: ["7D"] });
  const window = result.windows[0];
  const audience = window.metrics.find((metric) => metric.key === "AUDIENCE_TOTAL")!;

  assert.equal(result.sourceDecisionGrade, true);
  assert.deepEqual(result.decisionGradeWindows, ["7D"]);
  assert.equal(window.state, "READY");
  assert.equal(window.contiguous, true);
  assert.equal(window.namedWindowDurationsValid, true);
  assert.deepEqual(window.decisionGradeMetrics, ["AUDIENCE_TOTAL", "REACH"]);
  assert.equal(audience.currentValue, 12_600);
  assert.equal(audience.priorValue, 12_400);
  assert.equal(audience.absoluteDelta, 200);
  assert.ok(Math.abs((audience.percentageDelta ?? 0) - (200 / 12_400) * 100) < 0.000001);
  assert.equal(audience.decisionGrade, true);
  assert.equal(result.comparisonTruthPreserved, true);
  assert.equal(result.crossPlatformAggregationPerformed, false);
  assert.equal(result.causalAttributionClaimed, false);
  assert.equal(result.writesPerformed, false);
});

test("fails closed when same-label periods overlap instead of presenting a misleading delta", () => {
  const input = snapshot({
    periods: [
      period("current", "2026-09-12T00:00:00Z", "2026-09-19T00:00:00Z", 12_600, 42_000),
      period("prior-overlap", "2026-09-07T00:00:00Z", "2026-09-14T00:00:00Z", 12_400, 39_000)
    ]
  });
  const result = compileSocialHistoryComparabilityV1(input, { now, windows: ["7D"] });
  const window = result.windows[0];

  assert.equal(window.state, "VERIFY_RANGE");
  assert.equal(window.contiguous, false);
  assert.deepEqual(window.decisionGradeMetrics, []);
  assert.ok(window.metrics.filter((metric) => ["AUDIENCE_TOTAL", "REACH"].includes(metric.key)).every((metric) => metric.state === "RANGE_INVALID"));
  assert.match(window.issues.join(" "), /not contiguous non-overlapping/i);
});

test("rejects gapped comparisons and periods whose duration does not match the named history window", () => {
  const input = snapshot({
    periods: [
      period("current-short", "2026-09-13T00:00:00Z", "2026-09-19T00:00:00Z", 12_600, 42_000),
      period("prior-gapped", "2026-09-05T00:00:00Z", "2026-09-12T00:00:00Z", 12_400, 39_000)
    ]
  });
  const result = compileSocialHistoryComparabilityV1(input, { now, windows: ["7D"] });
  const window = result.windows[0];

  assert.equal(window.state, "VERIFY_RANGE");
  assert.equal(window.namedWindowDurationsValid, false);
  assert.equal(window.contiguous, false);
  assert.match(window.issues.join(" "), /does not match its named duration/i);
});

test("requires provenance on both sides of a known metric comparison", () => {
  const input = snapshot({
    periods: [
      period("current", "2026-09-12T00:00:00Z", "2026-09-19T00:00:00Z", 12_600, 42_000, true),
      period("prior", "2026-09-05T00:00:00Z", "2026-09-12T00:00:00Z", 12_400, 39_000, false)
    ]
  });
  const result = compileSocialHistoryComparabilityV1(input, { now, windows: ["7D"] });
  const window = result.windows[0];

  assert.equal(window.state, "VERIFY_PROVENANCE");
  assert.deepEqual(window.decisionGradeMetrics, []);
  assert.equal(window.metrics.find((metric) => metric.key === "REACH")?.state, "MISSING_PROVENANCE");
});

test("keeps missing covered metrics UNKNOWN instead of converting absence to zero", () => {
  const input = snapshot({
    periods: [
      period("current", "2026-09-12T00:00:00Z", "2026-09-19T00:00:00Z", 12_600, null),
      period("prior", "2026-09-05T00:00:00Z", "2026-09-12T00:00:00Z", 12_400, null)
    ]
  });
  const result = compileSocialHistoryComparabilityV1(input, { now, windows: ["7D"] });
  const reach = result.windows[0].metrics.find((metric) => metric.key === "REACH")!;

  assert.equal(result.windows[0].state, "PARTIAL");
  assert.equal(reach.state, "UNKNOWN");
  assert.equal(reach.currentValue, null);
  assert.equal(reach.priorValue, null);
  assert.equal(reach.absoluteDelta, null);
  assert.equal(reach.percentageDelta, null);
  assert.equal(reach.decisionGrade, false);
});

test("marks otherwise comparable history stale when successful-sync evidence is too old", () => {
  const input = snapshot({ lastSuccessfulSyncAt: "2026-09-15T05:30:00Z" });
  const result = compileSocialHistoryComparabilityV1(input, { now, staleAfterHours: 48, windows: ["7D"] });

  assert.equal(result.sourceDecisionGrade, false);
  assert.equal(result.windows[0].state, "STALE_SOURCE");
  assert.deepEqual(result.decisionGradeWindows, []);
  assert.equal(result.windows[0].metrics.find((metric) => metric.key === "AUDIENCE_TOTAL")?.state, "SOURCE_NOT_CURRENT");
});

test("fails closed on future retrieval or synchronization evidence", () => {
  const futureRetrieved = snapshot({
    retrievedAt: "2026-09-20T05:30:00Z",
    lastSuccessfulSyncAt: "2026-09-20T05:30:00Z"
  });
  const result = compileSocialHistoryComparabilityV1(futureRetrieved, { now, windows: ["7D"] });

  assert.equal(result.sourceDecisionGrade, false);
  assert.equal(result.windows[0].state, "FUTURE_EVIDENCE");
  assert.match(result.sourceIssues.join(" "), /future/i);
});

test("does not certify a partial connector as decision-grade history even when ranges are otherwise valid", () => {
  const input = snapshot({ requestedState: "CONNECTED_PARTIAL" });
  const result = compileSocialHistoryComparabilityV1(input, { now, windows: ["7D"] });

  assert.equal(result.sourceDecisionGrade, false);
  assert.equal(result.windows[0].state, "SOURCE_NOT_DECISION_GRADE");
  assert.deepEqual(result.decisionGradeWindows, []);
});

test("requires a prior period before a named window can drive period-over-period decisions", () => {
  const input = snapshot({
    periods: [period("current", "2026-09-12T00:00:00Z", "2026-09-19T00:00:00Z", 12_600, 42_000)]
  });
  const result = compileSocialHistoryComparabilityV1(input, { now, windows: ["7D"] });

  assert.equal(result.windows[0].state, "NEEDS_HISTORY");
  assert.equal(result.windows[0].priorPeriodId, null);
  assert.deepEqual(result.windows[0].decisionGradeMetrics, []);
});

test("does not mutate input and freezes the comparability review", () => {
  const input = snapshot();
  const before = JSON.stringify(input);
  const result = compileSocialHistoryComparabilityV1(input, { now, windows: ["7D"] });

  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.windows), true);
  assert.equal(Object.isFrozen(result.windows[0]), true);
  assert.equal(Object.isFrozen(result.windows[0].metrics), true);
});
