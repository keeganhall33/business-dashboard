import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCanonicalSocialAccountSnapshotV1
} from "../../src/lib/social-intelligence/social-canonical-v1";
import {
  compileSocialProviderMetricNormalizationV1,
  type SocialProviderMetricNormalizationInputV1
} from "../../src/lib/social-intelligence/social-provider-metric-normalization-v1";
import {
  compileSocialSyncRunAcceptanceV1
} from "../../src/lib/social-intelligence/social-sync-acceptance-v1";

const retrievedAt = "2026-09-18T07:04:00Z";
const now = "2026-09-18T07:05:00Z";

function baseInput(): SocialProviderMetricNormalizationInputV1 {
  return {
    platform: "INSTAGRAM",
    connectorId: "meta-graph-instagram",
    runId: "sync:ig:2026-09-18T07:00Z",
    sourceKind: "OFFICIAL_API",
    authorizationState: "AUTHORIZED",
    readOnly: true,
    providerRunComplete: true,
    retrievedAt,
    periodId: "instagram-7d-current",
    window: "7D",
    periodStartAt: "2026-09-11T00:00:00Z",
    periodEndAt: "2026-09-18T00:00:00Z",
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
      },
      {
        providerMetricKey: "watch_time_ms",
        canonicalMetricKey: "WATCH_TIME_SECONDS",
        nativeUnit: "MILLISECONDS",
        aggregation: "PERIOD_TOTAL",
        providerDefinitionId: "meta:instagram:watch_time_ms:v1",
        definitionEvidenceRefs: ["provider-doc:meta:watch_time"]
      }
    ],
    observations: [
      {
        providerMetricKey: "followers_count",
        value: 12_500,
        capturedAt: "2026-09-18T07:03:00Z",
        evidenceRefs: ["provider-response:ig:followers:run-1"]
      },
      {
        providerMetricKey: "accounts_reached",
        value: 41_250,
        capturedAt: "2026-09-18T07:03:00Z",
        evidenceRefs: ["provider-response:ig:reach:run-1"]
      },
      {
        providerMetricKey: "watch_time_ms",
        value: 90_000,
        capturedAt: "2026-09-18T07:03:00Z",
        evidenceRefs: ["provider-response:ig:watch:run-1"]
      }
    ]
  };
}

test("normalizes authorized provider metrics into canonical-safe period input and units", () => {
  const result = compileSocialProviderMetricNormalizationV1(baseInput(), now);

  assert.equal(result.normalizationState, "READY");
  assert.equal(result.sourceCoverage.requestedState, "CONNECTED_AND_INGESTING");
  assert.deepEqual(result.sourceCoverage.metricCoverage, ["AUDIENCE_TOTAL", "REACH", "WATCH_TIME_SECONDS"]);
  assert.deepEqual(result.missingProviderMetrics, []);
  assert.deepEqual(result.canonicalPeriod.metrics, {
    AUDIENCE_TOTAL: { value: 12_500, evidenceRefs: ["provider-response:ig:followers:run-1"] },
    REACH: { value: 41_250, evidenceRefs: ["provider-response:ig:reach:run-1"] },
    WATCH_TIME_SECONDS: { value: 90, evidenceRefs: ["provider-response:ig:watch:run-1"] }
  });

  const watch = result.metrics.find((metric) => metric.canonicalMetricKey === "WATCH_TIME_SECONDS");
  assert.equal(watch?.conversion, "MILLISECONDS_TO_SECONDS");
  assert.equal(watch?.canonicalUnit, "SECONDS");
  assert.equal(watch?.value, 90);
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
  assert.equal(result.causalAttributionClaimed, false);
  assert.equal(result.crossPlatformAggregationPerformed, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.metrics), true);
});

test("feeds the existing canonical snapshot and governed live-sync acceptance path without inventing a second truth model", () => {
  const normalized = compileSocialProviderMetricNormalizationV1(baseInput(), now);
  const snapshot = compileCanonicalSocialAccountSnapshotV1(
    {
      platform: normalized.platform,
      accountId: "keegan-hall",
      retrievedAt: normalized.retrievedAt,
      sourceCoverage: normalized.sourceCoverage,
      periods: [normalized.canonicalPeriod]
    },
    now
  );

  assert.equal(snapshot.periods[0]?.metrics.AUDIENCE_TOTAL.value, 12_500);
  assert.equal(snapshot.periods[0]?.metrics.WATCH_TIME_SECONDS.value, 90);
  assert.deepEqual(snapshot.evidenceRefs, [
    "provider-response:ig:followers:run-1",
    "provider-response:ig:reach:run-1",
    "provider-response:ig:watch:run-1"
  ]);

  const accepted = compileSocialSyncRunAcceptanceV1({
    platform: "INSTAGRAM",
    connectorId: normalized.connectorId,
    runId: normalized.runId,
    mode: "INCREMENTAL",
    sourceKind: normalized.sourceKind,
    authorizationState: "AUTHORIZED",
    readOnly: true,
    startedAt: "2026-09-18T07:00:00Z",
    completedAt: now,
    outcome: "SUCCESS",
    hasMore: false,
    providerEvidenceRefs: ["provider-request:ig:run-1"],
    pages: [
      {
        pageId: "metrics-page",
        fetchedAt: "2026-09-18T07:03:00Z",
        recordCount: 3,
        providerEvidenceRefs: ["provider-response:ig:page-1"]
      }
    ],
    snapshot
  });

  assert.equal(accepted.acceptedForLiveProof, true);
  assert.equal(accepted.proof?.liveFirstPartyData, true);
  assert.equal(accepted.writesPerformed, false);
});

test("preserves an unobserved supported metric as UNKNOWN and marks the handoff partial rather than zero", () => {
  const input = baseInput();
  const result = compileSocialProviderMetricNormalizationV1(
    {
      ...input,
      observations: input.observations.filter((observation) => observation.providerMetricKey !== "accounts_reached")
    },
    now
  );

  assert.equal(result.normalizationState, "PARTIAL");
  assert.equal(result.sourceCoverage.requestedState, "CONNECTED_PARTIAL");
  assert.deepEqual(result.missingProviderMetrics, ["accounts_reached"]);
  assert.deepEqual(result.canonicalPeriod.metrics?.REACH, { value: null, evidenceRefs: [] });
  assert.match(result.limitations.join(" "), /accounts_reached.*UNKNOWN/i);
  const reach = result.metrics.find((metric) => metric.canonicalMetricKey === "REACH");
  assert.equal(reach?.truthState, "UNKNOWN");
  assert.equal(reach?.value, null);
});

test("requires an explicit limitation when the provider run itself is incomplete", () => {
  assert.throws(
    () => compileSocialProviderMetricNormalizationV1({ ...baseInput(), providerRunComplete: false }, now),
    /incomplete provider run requires an explicit limitation/i
  );

  const result = compileSocialProviderMetricNormalizationV1(
    {
      ...baseInput(),
      providerRunComplete: false,
      limitations: ["Provider pagination stopped at a documented rate-limit boundary"]
    },
    now
  );
  assert.equal(result.normalizationState, "PARTIAL");
  assert.equal(result.sourceCoverage.requestedState, "CONNECTED_PARTIAL");
  assert.match(result.limitations[0] ?? "", /rate-limit/i);
});

test("fails closed when provider aggregation semantics do not match the canonical metric definition", () => {
  const input = baseInput();
  assert.throws(
    () =>
      compileSocialProviderMetricNormalizationV1(
        {
          ...input,
          mappings: input.mappings.map((mapping) =>
            mapping.providerMetricKey === "followers_count"
              ? { ...mapping, aggregation: "PERIOD_TOTAL" as const }
              : mapping
          )
        },
        now
      ),
    /aggregation PERIOD_TOTAL does not match canonical AUDIENCE_TOTAL aggregation POINT_IN_TIME/i
  );
});

test("fails closed on incompatible units rather than silently coercing unlike provider metrics", () => {
  const input = baseInput();
  assert.throws(
    () =>
      compileSocialProviderMetricNormalizationV1(
        {
          ...input,
          mappings: input.mappings.map((mapping) =>
            mapping.providerMetricKey === "accounts_reached"
              ? { ...mapping, nativeUnit: "SECONDS" as const }
              : mapping
          )
        },
        now
      ),
    /REACH requires COUNT provider units/i
  );
});

test("rejects ambiguous canonical mappings and unmapped provider observations", () => {
  const input = baseInput();
  assert.throws(
    () =>
      compileSocialProviderMetricNormalizationV1(
        {
          ...input,
          mappings: [
            ...input.mappings,
            {
              providerMetricKey: "followers_alias",
              canonicalMetricKey: "AUDIENCE_TOTAL",
              nativeUnit: "COUNT",
              aggregation: "POINT_IN_TIME",
              providerDefinitionId: "meta:instagram:followers_alias:v1",
              definitionEvidenceRefs: ["provider-doc:meta:followers_alias"]
            }
          ]
        },
        now
      ),
    /AUDIENCE_TOTAL has ambiguous provider mappings/i
  );

  assert.throws(
    () =>
      compileSocialProviderMetricNormalizationV1(
        {
          ...input,
          observations: [
            ...input.observations,
            {
              providerMetricKey: "mystery_metric",
              value: 99,
              capturedAt: "2026-09-18T07:03:00Z",
              evidenceRefs: ["provider-response:ig:mystery"]
            }
          ]
        },
        now
      ),
    /has no explicit provider-to-canonical mapping/i
  );
});

test("requires observation and metric-definition provenance before a provider value can become KNOWN", () => {
  const input = baseInput();
  assert.throws(
    () =>
      compileSocialProviderMetricNormalizationV1(
        {
          ...input,
          observations: input.observations.map((observation) =>
            observation.providerMetricKey === "accounts_reached"
              ? { ...observation, evidenceRefs: [] }
              : observation
          )
        },
        now
      ),
    /KNOWN observation requires provider evidence/i
  );

  assert.throws(
    () =>
      compileSocialProviderMetricNormalizationV1(
        {
          ...input,
          mappings: input.mappings.map((mapping) =>
            mapping.providerMetricKey === "accounts_reached"
              ? { ...mapping, definitionEvidenceRefs: [] }
              : mapping
          )
        },
        now
      ),
    /requires provider definition evidence/i
  );
});

test("rejects future chronology, impossible periods, and credential-bearing evidence", () => {
  assert.throws(
    () => compileSocialProviderMetricNormalizationV1({ ...baseInput(), retrievedAt: "2026-09-18T08:00:00Z" }, now),
    /retrievedAt cannot be in the future/i
  );

  assert.throws(
    () =>
      compileSocialProviderMetricNormalizationV1(
        {
          ...baseInput(),
          periodEndAt: "2026-09-19T00:00:00Z"
        },
        "2026-09-19T01:00:00Z"
      ),
    /periodEndAt cannot extend beyond retrievedAt/i
  );

  const input = baseInput();
  assert.throws(
    () =>
      compileSocialProviderMetricNormalizationV1(
        {
          ...input,
          observations: input.observations.map((observation) =>
            observation.providerMetricKey === "followers_count"
              ? { ...observation, capturedAt: "2026-09-18T07:05:00Z" }
              : observation
          )
        },
        now
      ),
    /capturedAt cannot be after retrievedAt/i
  );

  assert.throws(
    () =>
      compileSocialProviderMetricNormalizationV1(
        {
          ...input,
          mappings: input.mappings.map((mapping) =>
            mapping.providerMetricKey === "followers_count"
              ? { ...mapping, definitionEvidenceRefs: ["https://provider.example/docs?access_token=secret"] }
              : mapping
          )
        },
        now
      ),
    /credential query parameters/i
  );
});

test("rejects unauthorized, write-capable, and non-official connector claims", () => {
  assert.throws(
    () =>
      compileSocialProviderMetricNormalizationV1(
        { ...baseInput(), authorizationState: "NEEDS_KEEGAN_CONNECTION" } as unknown as SocialProviderMetricNormalizationInputV1,
        now
      ),
    /requires explicit AUTHORIZED state/i
  );
  assert.throws(
    () =>
      compileSocialProviderMetricNormalizationV1(
        { ...baseInput(), readOnly: false } as unknown as SocialProviderMetricNormalizationInputV1,
        now
      ),
    /must be read-only/i
  );
  assert.throws(
    () =>
      compileSocialProviderMetricNormalizationV1(
        { ...baseInput(), sourceKind: "SCRAPED_PRIVATE" } as unknown as SocialProviderMetricNormalizationInputV1,
        now
      ),
    /official API or authorized export/i
  );
});
