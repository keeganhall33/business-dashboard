import assert from "node:assert/strict";
import test from "node:test";

import { compileCanonicalSocialAccountSnapshotV1 } from "../../src/lib/social-intelligence/social-canonical-v1";
import { compileSocialProviderMetricNormalizationV1 } from "../../src/lib/social-intelligence/social-provider-metric-normalization-v1";

const base = {
  platform: "INSTAGRAM" as const,
  connectorId: "meta-graph-instagram",
  runId: "sync:ig:partial",
  sourceKind: "OFFICIAL_API" as const,
  authorizationState: "AUTHORIZED" as const,
  readOnly: true as const,
  providerRunComplete: false,
  retrievedAt: "2026-09-18T07:04:00Z",
  periodId: "instagram-7d-current",
  window: "7D" as const,
  periodStartAt: "2026-09-11T00:00:00Z",
  periodEndAt: "2026-09-18T00:00:00Z",
  mappings: [
    {
      providerMetricKey: "followers_count",
      canonicalMetricKey: "AUDIENCE_TOTAL" as const,
      nativeUnit: "COUNT" as const,
      aggregation: "POINT_IN_TIME" as const,
      providerDefinitionId: "meta:instagram:followers_count:v1",
      definitionEvidenceRefs: ["provider-doc:meta:followers_count"]
    }
  ],
  observations: [
    {
      providerMetricKey: "followers_count",
      value: 12_500,
      capturedAt: "2026-09-18T07:03:00Z",
      evidenceRefs: ["provider-response:ig:followers:partial"]
    }
  ],
  limitations: ["Provider pagination did not complete"]
};

test("an incomplete provider run never promotes its retrieval time to successful-sync freshness", () => {
  const normalized = compileSocialProviderMetricNormalizationV1(base, "2026-09-18T07:05:00Z");
  assert.equal(normalized.normalizationState, "PARTIAL");
  assert.equal(normalized.sourceCoverage.lastSuccessfulSyncAt, null);

  const snapshot = compileCanonicalSocialAccountSnapshotV1(
    {
      platform: normalized.platform,
      accountId: "keegan-hall",
      retrievedAt: normalized.retrievedAt,
      sourceCoverage: normalized.sourceCoverage,
      periods: [normalized.canonicalPeriod]
    },
    "2026-09-18T07:05:00Z"
  );
  assert.equal(snapshot.sourceCoverage.freshness, "NEVER_SYNCED");
  assert.equal(snapshot.sourceCoverage.effectiveState, "CONNECTED_PARTIAL");
});

test("an incomplete run may preserve, but never advance beyond, explicit prior successful-sync evidence", () => {
  const normalized = compileSocialProviderMetricNormalizationV1(
    { ...base, previousSuccessfulSyncAt: "2026-09-17T07:00:00Z" },
    "2026-09-18T07:05:00Z"
  );
  assert.equal(normalized.sourceCoverage.lastSuccessfulSyncAt, "2026-09-17T07:00:00.000Z");

  assert.throws(
    () =>
      compileSocialProviderMetricNormalizationV1(
        { ...base, previousSuccessfulSyncAt: "2026-09-18T07:05:00Z" },
        "2026-09-18T07:05:00Z"
      ),
    /previousSuccessfulSyncAt cannot be after retrievedAt/i
  );
});
