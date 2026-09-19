import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareClarityLiveFrictionHistorySnapshotV1,
} from "@/lib/clarity-behavior/live-friction-history-snapshot-v1";
import type {
  ClarityLiveFrictionMetricV1,
  ClarityLiveFrictionRateResultV1,
} from "@/lib/clarity-behavior/live-friction-rate-v1";

const METRICS: readonly ClarityLiveFrictionMetricV1[] = [
  "DEAD_CLICK",
  "RAGE_CLICK",
  "QUICK_BACK",
  "EXCESSIVE_SCROLL",
  "SCRIPT_ERROR",
  "ERROR_CLICK",
];

function source(overrides: Partial<ClarityLiveFrictionRateResultV1> = {}): ClarityLiveFrictionRateResultV1 {
  const base: ClarityLiveFrictionRateResultV1 = {
    version: "CLARITY_LIVE_FRICTION_RATE_V1",
    state: "READY_FOR_BEHAVIOR_REVIEW",
    reasonCodes: ["READY_FOR_BEHAVIOR_REVIEW"],
    observations: METRICS.map((metric, rowIndex) => ({
      metric,
      providerMetricName: metric,
      rowIndex,
      dimensions: {
        Device: "Mobile",
        URL: "/checkout/",
      },
      sessionsCount: 100,
      sessionsWithMetricPercent: 10 + rowIndex,
      sessionsWithoutMetricPercent: 90 - rowIndex,
      affectedSessionCount: null,
      affectedSessionCountReason:
        "PROVIDER_EXPORT_EXPOSES_PERCENTAGE_NOT_EXACT_AFFECTED_SESSION_COUNT",
      evidenceRef: "clarity-live:fetch-2026-09-19T20:00:00.000Z",
    })),
    coverage: {
      lookbackDays: 1,
      requestedWindow: {
        startAt: "2026-09-18T20:00:00.000Z",
        endAt: "2026-09-19T20:00:00.000Z",
      },
      observedWindow: {
        startAt: "2026-09-18T20:00:00.000Z",
        endAt: "2026-09-19T20:00:00.000Z",
      },
      extractedAt: "2026-09-19T20:00:05.000Z",
      dimensions: ["Device", "URL"],
      sourceTruth: "COMPLETE",
    },
    evidenceRefs: ["clarity-live:fetch-2026-09-19T20:00:00.000Z"],
    limitations: {
      descriptiveProviderRateOnly: true,
      affectedSessionCountsInferred: false,
      providerFrictionRowFieldShapeDocumentedByMicrosoft: false,
      longerTrendRequiresRetainedHistory: true,
      causalityEstablished: false,
      attributionEstablished: false,
      statisticalSignificanceEstablished: false,
      monetaryImpactEstablished: false,
      eligibleForConversionRecommendation: false,
    },
    authority: {
      persistencePerformed: false,
      siteMutationAllowed: false,
      checkoutMutationAllowed: false,
      trackingMutationAllowed: false,
      pricingMutationAllowed: false,
      metaWriteAllowed: false,
      externalMutationAllowed: false,
    },
  };
  return { ...base, ...overrides };
}

const evaluatedAt = "2026-09-19T20:15:00.000Z";

test("prepares an immutable idempotent history snapshot without widening authority", () => {
  const input = source();
  const first = prepareClarityLiveFrictionHistorySnapshotV1({
    source: input,
    evaluatedAt,
    maxAgeHours: 2,
  });
  const second = prepareClarityLiveFrictionHistorySnapshotV1({
    source: input,
    evaluatedAt,
    maxAgeHours: 2,
  });

  assert.equal(first.state, "READY_FOR_INTERNAL_PERSISTENCE");
  assert.equal(first.snapshotId, second.snapshotId);
  assert.match(first.snapshotId ?? "", /^clarity-friction:[a-f0-9]{24}$/);
  assert.equal(first.observations.length, 6);
  assert.deepEqual(first.coverage.requestedWindow, first.coverage.observedWindow);
  assert.deepEqual(first.evidenceRefs, ["clarity-live:fetch-2026-09-19T20:00:00.000Z"]);
  assert.equal(first.authority.internalPersistenceHandoffAllowed, true);
  assert.equal(first.authority.persistencePerformed, false);
  assert.equal(first.authority.siteMutationAllowed, false);
  assert.equal(first.authority.checkoutMutationAllowed, false);
  assert.equal(first.authority.metaWriteAllowed, false);
  assert.equal(first.limitations.historyComparisonEstablished, false);
  assert.equal(first.limitations.causalityEstablished, false);
  assert.equal(first.limitations.attributionEstablished, false);
  assert.equal(first.limitations.monetaryImpactEstablished, false);
  assert.equal(first.limitations.eligibleForConversionRecommendation, false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.observations), true);
  assert.equal(Object.isFrozen(first.observations[0].dimensions), true);
  assert.equal(Object.isFrozen(input), false);
});

test("withholds partial, stale, future, or range-conflicted source evidence", () => {
  const partial = source({
    coverage: { ...source().coverage, sourceTruth: "PARTIAL" },
  });
  assert.deepEqual(
    prepareClarityLiveFrictionHistorySnapshotV1({ source: partial, evaluatedAt, maxAgeHours: 2 }).reasonCodes,
    ["SOURCE_NOT_COMPLETE"],
  );

  const stale = source({
    coverage: { ...source().coverage, extractedAt: "2026-09-19T17:00:00.000Z" },
  });
  assert.deepEqual(
    prepareClarityLiveFrictionHistorySnapshotV1({ source: stale, evaluatedAt, maxAgeHours: 2 }).reasonCodes,
    ["STALE_EVIDENCE"],
  );

  const future = source({
    coverage: { ...source().coverage, extractedAt: "2026-09-19T20:16:00.000Z" },
  });
  assert.deepEqual(
    prepareClarityLiveFrictionHistorySnapshotV1({ source: future, evaluatedAt, maxAgeHours: 2 }).reasonCodes,
    ["FUTURE_EVIDENCE"],
  );

  const mismatched = source({
    coverage: {
      ...source().coverage,
      observedWindow: {
        startAt: "2026-09-18T21:00:00.000Z",
        endAt: "2026-09-19T20:00:00.000Z",
      },
    },
  });
  assert.deepEqual(
    prepareClarityLiveFrictionHistorySnapshotV1({ source: mismatched, evaluatedAt, maxAgeHours: 2 }).reasonCodes,
    ["COVERAGE_INVALID"],
  );
});

test("fails closed on widened authority, incomplete metrics, malformed rates, or unsafe evidence", () => {
  const widened = source({
    authority: { ...source().authority, metaWriteAllowed: true } as unknown as ClarityLiveFrictionRateResultV1["authority"],
  });
  assert.deepEqual(
    prepareClarityLiveFrictionHistorySnapshotV1({ source: widened, evaluatedAt, maxAgeHours: 2 }).reasonCodes,
    ["SOURCE_AUTHORITY_WIDENED"],
  );

  const incompleteMetrics = source({ observations: source().observations.slice(0, 5) });
  assert.deepEqual(
    prepareClarityLiveFrictionHistorySnapshotV1({ source: incompleteMetrics, evaluatedAt, maxAgeHours: 2 }).reasonCodes,
    ["FRICTION_METRIC_COVERAGE_INCOMPLETE"],
  );

  const malformed = source({
    observations: source().observations.map((observation, index) =>
      index === 0
        ? { ...observation, sessionsWithMetricPercent: 60, sessionsWithoutMetricPercent: 60 }
        : observation,
    ),
  });
  assert.deepEqual(
    prepareClarityLiveFrictionHistorySnapshotV1({ source: malformed, evaluatedAt, maxAgeHours: 2 }).reasonCodes,
    ["OBSERVATION_INVALID"],
  );

  const unsafeRef = "token=do-not-persist";
  const unsafe = source({
    evidenceRefs: [unsafeRef],
    observations: source().observations.map((observation) => ({ ...observation, evidenceRef: unsafeRef })),
  });
  assert.deepEqual(
    prepareClarityLiveFrictionHistorySnapshotV1({ source: unsafe, evaluatedAt, maxAgeHours: 2 }).reasonCodes,
    ["EVIDENCE_REF_INVALID"],
  );
});

test("snapshot identity is independent of provider row ordering but changes with evidence", () => {
  const canonical = source();
  const reversed = source({ observations: [...source().observations].reverse() });
  const changedEvidenceRef = "clarity-live:fetch-2026-09-19T20:00:01.000Z";
  const changedEvidence = source({
    evidenceRefs: [changedEvidenceRef],
    observations: source().observations.map((observation) => ({
      ...observation,
      evidenceRef: changedEvidenceRef,
    })),
  });

  const first = prepareClarityLiveFrictionHistorySnapshotV1({ source: canonical, evaluatedAt, maxAgeHours: 2 });
  const second = prepareClarityLiveFrictionHistorySnapshotV1({ source: reversed, evaluatedAt, maxAgeHours: 2 });
  const third = prepareClarityLiveFrictionHistorySnapshotV1({ source: changedEvidence, evaluatedAt, maxAgeHours: 2 });

  assert.equal(first.snapshotId, second.snapshotId);
  assert.notEqual(first.snapshotId, third.snapshotId);
});
