import assert from "node:assert/strict";
import test from "node:test";

import {
  compileSocialProviderMetricNormalizationV1,
  type SocialProviderMetricNormalizationInputV1,
  type SocialProviderMetricNormalizationV1
} from "../../src/lib/social-intelligence/social-provider-metric-normalization-v1";
import {
  compileSocialProviderSnapshotProjectionV1
} from "../../src/lib/social-intelligence/social-provider-snapshot-projection-v1";
import {
  compileSocialSyncRunAcceptanceV1
} from "../../src/lib/social-intelligence/social-sync-acceptance-v1";

const retrievedAt = "2026-09-18T19:40:00Z";
const now = "2026-09-18T19:45:00Z";
const runId = "sync:ig:2026-09-18T19:40Z";

function inputFor(options: {
  periodId: string;
  startAt: string;
  endAt: string;
  audience: number;
  reach: number;
  providerRunComplete?: boolean;
  previousSuccessfulSyncAt?: string | null;
  limitations?: readonly string[];
}): SocialProviderMetricNormalizationInputV1 {
  return {
    platform: "INSTAGRAM",
    connectorId: "meta-graph-instagram",
    runId,
    sourceKind: "OFFICIAL_API",
    authorizationState: "AUTHORIZED",
    readOnly: true,
    providerRunComplete: options.providerRunComplete ?? true,
    previousSuccessfulSyncAt: options.previousSuccessfulSyncAt,
    retrievedAt,
    periodId: options.periodId,
    window: "7D",
    periodStartAt: options.startAt,
    periodEndAt: options.endAt,
    mappings: [
      {
        providerMetricKey: "followers_count",
        canonicalMetricKey: "AUDIENCE_TOTAL",
        nativeUnit: "COUNT",
        aggregation: "POINT_IN_TIME",
        providerDefinitionId: "meta:instagram:followers_count:v1",
        definitionEvidenceRefs: ["provider-doc:meta:followers_count"]
      },
      {
        providerMetricKey: "accounts_reached",
        canonicalMetricKey: "REACH",
        nativeUnit: "COUNT",
        aggregation: "PERIOD_TOTAL",
        providerDefinitionId: "meta:instagram:accounts_reached:v1",
        definitionEvidenceRefs: ["provider-doc:meta:accounts_reached"]
      }
    ],
    observations: [
      {
        providerMetricKey: "followers_count",
        value: options.audience,
        capturedAt: "2026-09-18T19:39:00Z",
        evidenceRefs: [`provider-response:${options.periodId}:followers`]
      },
      {
        providerMetricKey: "accounts_reached",
        value: options.reach,
        capturedAt: "2026-09-18T19:39:00Z",
        evidenceRefs: [`provider-response:${options.periodId}:reach`]
      }
    ],
    limitations: options.limitations
  };
}

function readyPeriods(): readonly [SocialProviderMetricNormalizationV1, SocialProviderMetricNormalizationV1] {
  const current = compileSocialProviderMetricNormalizationV1(
    inputFor({
      periodId: "instagram-7d-current",
      startAt: "2026-09-11T00:00:00Z",
      endAt: "2026-09-18T00:00:00Z",
      audience: 12_500,
      reach: 41_250
    }),
    now
  );
  const prior = compileSocialProviderMetricNormalizationV1(
    inputFor({
      periodId: "instagram-7d-prior",
      startAt: "2026-09-04T00:00:00Z",
      endAt: "2026-09-11T00:00:00Z",
      audience: 12_000,
      reach: 35_000
    }),
    now
  );
  return [current, prior];
}

test("projects one authorized provider run into canonical social history without creating parallel truth", () => {
  const [current, prior] = readyPeriods();
  const result = compileSocialProviderSnapshotProjectionV1(
    {
      accountId: "keegan-hall",
      handle: "@keeganhall",
      normalizations: [current, prior],
      freshnessMaxAgeHours: 48
    },
    now
  );

  assert.equal(result.projectionState, "READY");
  assert.equal(result.platform, "INSTAGRAM");
  assert.equal(result.connectorId, "meta-graph-instagram");
  assert.equal(result.runId, runId);
  assert.equal(result.snapshot.sourceCoverage.requestedState, "CONNECTED_AND_INGESTING");
  assert.equal(result.snapshot.sourceCoverage.freshness, "FRESH");
  assert.deepEqual(result.snapshot.sourceCoverage.metricCoverage, ["AUDIENCE_TOTAL", "REACH"]);
  assert.equal(result.snapshot.periods.length, 2);
  assert.equal(result.snapshot.comparisons[0]?.metrics.AUDIENCE_TOTAL.absoluteDelta, 500);
  assert.equal(result.snapshot.comparisons[0]?.metrics.REACH.absoluteDelta, 6_250);
  assert.deepEqual(result.observationEvidenceRefs, [
    "provider-response:instagram-7d-current:followers",
    "provider-response:instagram-7d-current:reach",
    "provider-response:instagram-7d-prior:followers",
    "provider-response:instagram-7d-prior:reach"
  ]);
  assert.deepEqual(result.definitionEvidenceRefs, [
    "provider-doc:meta:accounts_reached",
    "provider-doc:meta:followers_count"
  ]);
  assert.equal(result.causalAttributionClaimed, false);
  assert.equal(result.crossPlatformAggregationPerformed, false);
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.snapshot), true);
});

test("feeds the existing live-sync acceptance boundary with the exact canonical snapshot", () => {
  const [current, prior] = readyPeriods();
  const projected = compileSocialProviderSnapshotProjectionV1(
    {
      accountId: "keegan-hall",
      normalizations: [current, prior],
      freshnessMaxAgeHours: 48
    },
    now
  );

  const accepted = compileSocialSyncRunAcceptanceV1({
    platform: projected.platform,
    connectorId: projected.connectorId,
    runId: projected.runId,
    mode: "INCREMENTAL",
    sourceKind: projected.sourceKind,
    authorizationState: "AUTHORIZED",
    readOnly: true,
    startedAt: "2026-09-18T19:35:00Z",
    completedAt: now,
    outcome: "SUCCESS",
    hasMore: false,
    providerEvidenceRefs: projected.observationEvidenceRefs,
    pages: [
      {
        pageId: "provider-metrics",
        fetchedAt: "2026-09-18T19:39:00Z",
        recordCount: 4,
        providerEvidenceRefs: ["provider-response:instagram:page-1"]
      }
    ],
    snapshot: projected.snapshot
  });

  assert.equal(accepted.acceptedForLiveProof, true);
  assert.equal(accepted.proof?.snapshot.snapshotId, projected.snapshot.snapshotId);
  assert.equal(accepted.proof?.liveFirstPartyData, true);
  assert.equal(accepted.writesPerformed, false);
});

test("preserves partial-run freshness and UNKNOWN semantics instead of promoting retrieval time to successful sync", () => {
  const previousSuccessfulSyncAt = "2026-09-17T19:00:00Z";
  const current = compileSocialProviderMetricNormalizationV1(
    {
      ...inputFor({
        periodId: "instagram-7d-current",
        startAt: "2026-09-11T00:00:00Z",
        endAt: "2026-09-18T00:00:00Z",
        audience: 12_500,
        reach: 41_250,
        providerRunComplete: false,
        previousSuccessfulSyncAt,
        limitations: ["Provider pagination stopped before the run completed"]
      }),
      observations: [
        {
          providerMetricKey: "followers_count",
          value: 12_500,
          capturedAt: "2026-09-18T19:39:00Z",
          evidenceRefs: ["provider-response:partial:followers"]
        }
      ]
    },
    now
  );

  const result = compileSocialProviderSnapshotProjectionV1(
    {
      accountId: "keegan-hall",
      normalizations: [current],
      freshnessMaxAgeHours: 48
    },
    now
  );

  assert.equal(result.projectionState, "PARTIAL");
  assert.equal(result.snapshot.sourceCoverage.requestedState, "CONNECTED_PARTIAL");
  assert.equal(result.snapshot.sourceCoverage.lastSuccessfulSyncAt, "2026-09-17T19:00:00.000Z");
  assert.equal(result.snapshot.periods[0]?.metrics.REACH.truthState, "UNKNOWN");
  assert.equal(result.snapshot.periods[0]?.metrics.REACH.value, null);
  assert.match(result.limitations.join(" "), /pagination|UNKNOWN/i);
});

test("fails closed when artifacts from different provider runs are mixed", () => {
  const [current, prior] = readyPeriods();
  const wrongRun = { ...prior, runId: "sync:ig:other-run" } as SocialProviderMetricNormalizationV1;

  assert.throws(
    () =>
      compileSocialProviderSnapshotProjectionV1(
        {
          accountId: "keegan-hall",
          normalizations: [current, wrongRun],
          freshnessMaxAgeHours: 48
        },
        now
      ),
    /cannot mix provider run identities/i
  );
});

test("rejects forged READY artifacts that contradict provider completion or source coverage truth", () => {
  const [current] = readyPeriods();
  const forged = {
    ...current,
    providerRunComplete: false,
    normalizationState: "READY"
  } as SocialProviderMetricNormalizationV1;

  assert.throws(
    () =>
      compileSocialProviderSnapshotProjectionV1(
        {
          accountId: "keegan-hall",
          normalizations: [forged],
          freshnessMaxAgeHours: 48
        },
        now
      ),
    /normalizationState is inconsistent/i
  );

  const forgedCoverage = {
    ...current,
    sourceCoverage: { ...current.sourceCoverage, requestedState: "CONNECTED_PARTIAL" as const }
  } as SocialProviderMetricNormalizationV1;
  assert.throws(
    () =>
      compileSocialProviderSnapshotProjectionV1(
        {
          accountId: "keegan-hall",
          normalizations: [forgedCoverage],
          freshnessMaxAgeHours: 48
        },
        now
      ),
    /source coverage is inconsistent/i
  );
});

test("rejects forged future coverage and mismatched canonical metric evidence", () => {
  const [current] = readyPeriods();
  const futurePeriod = {
    ...current,
    canonicalPeriod: { ...current.canonicalPeriod, endAt: "2026-09-19T00:00:00Z" }
  } as SocialProviderMetricNormalizationV1;
  assert.throws(
    () =>
      compileSocialProviderSnapshotProjectionV1(
        {
          accountId: "keegan-hall",
          normalizations: [futurePeriod],
          freshnessMaxAgeHours: 48
        },
        now
      ),
    /period cannot extend beyond provider retrieval time/i
  );

  const forgedMetrics = current.metrics.map((metric) =>
    metric.canonicalMetricKey === "REACH"
      ? { ...metric, value: 99_999 }
      : metric
  );
  const mismatch = { ...current, metrics: forgedMetrics } as SocialProviderMetricNormalizationV1;
  assert.throws(
    () =>
      compileSocialProviderSnapshotProjectionV1(
        {
          accountId: "keegan-hall",
          normalizations: [mismatch],
          freshnessMaxAgeHours: 48
        },
        now
      ),
    /canonical period must preserve normalized value and evidence/i
  );
});

test("rejects secret-bearing evidence references and requires an explicit valid freshness policy", () => {
  const [current] = readyPeriods();
  const secretMetric = {
    ...current.metrics[0]!,
    evidenceRefs: ["https://provider.example/metric?access_token=secret-value"]
  };
  const secretBearing = {
    ...current,
    metrics: [secretMetric, ...current.metrics.slice(1)]
  } as SocialProviderMetricNormalizationV1;

  assert.throws(
    () =>
      compileSocialProviderSnapshotProjectionV1(
        {
          accountId: "keegan-hall",
          normalizations: [secretBearing],
          freshnessMaxAgeHours: 48
        },
        now
      ),
    /credential query parameters/i
  );

  assert.throws(
    () =>
      compileSocialProviderSnapshotProjectionV1(
        {
          accountId: "keegan-hall",
          normalizations: [current],
          freshnessMaxAgeHours: 0
        },
        now
      ),
    /freshnessMaxAgeHours must be a positive finite number/i
  );
});
