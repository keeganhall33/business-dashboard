import assert from "node:assert/strict";
import test from "node:test";

import {
  SOCIAL_METRIC_DEFINITIONS_V1,
  adaptLegacySocialBridgeV1,
  calculateSocialAudienceTrendV1,
  compileCanonicalSocialAccountSnapshotV1,
  compileSocialSourceCoverageV1
} from "../../src/lib/social-intelligence/social-canonical-v1";

const now = "2026-09-18T04:40:00Z";

function snapshot() {
  return compileCanonicalSocialAccountSnapshotV1(
    {
      platform: "INSTAGRAM",
      accountId: "keegan-hall",
      handle: "@keeganhall",
      retrievedAt: "2026-09-18T04:30:00Z",
      sourceCoverage: {
        requestedState: "CONNECTED_AND_INGESTING",
        lastSuccessfulSyncAt: "2026-09-18T04:30:00Z",
        metricCoverage: ["AUDIENCE_TOTAL", "REACH", "VIEWS", "LINK_CLICKS"],
        limitations: ["Audience overlap with other platforms is unavailable"]
      },
      periods: [
        {
          periodId: "instagram-7d-current",
          window: "7D",
          startAt: "2026-09-11T00:00:00Z",
          endAt: "2026-09-18T00:00:00Z",
          metrics: {
            AUDIENCE_TOTAL: { value: 12_500, evidenceRefs: ["evidence:social:ig:audience:current"] },
            NET_NEW_AUDIENCE: 125,
            REACH: { value: 40_000, evidenceRefs: ["evidence:social:ig:reach:current"] },
            VIEWS: 75_000,
            LINK_CLICKS: 310
          }
        },
        {
          periodId: "instagram-7d-prior",
          window: "7D",
          startAt: "2026-09-04T00:00:00Z",
          endAt: "2026-09-11T00:00:00Z",
          metrics: {
            AUDIENCE_TOTAL: { value: 12_375, evidenceRefs: ["evidence:social:ig:audience:prior"] },
            NET_NEW_AUDIENCE: 90,
            REACH: 32_000,
            VIEWS: 70_000,
            LINK_CLICKS: 0
          }
        },
        {
          periodId: "instagram-30d-current",
          window: "30D",
          startAt: "2026-08-19T00:00:00Z",
          endAt: "2026-09-18T00:00:00Z",
          metrics: { AUDIENCE_TOTAL: 12_500 }
        }
      ],
      content: [
        {
          contentId: "post-2",
          url: "https://instagram.com/p/post-2",
          publishedAt: "2026-09-17T18:00:00Z",
          format: "REEL",
          subject: "Seattle Seahawks throwback helmet",
          project: "Seahawks helmet drawing",
          theme: "WORK_IN_PROGRESS",
          hook: "50% to finished detail reveal",
          durationSeconds: 22,
          productionEffortMinutes: 45,
          amplificationType: "ORGANIC",
          businessOutcomeRefs: ["ga4:campaign:helmet-wip"],
          attributionConfidence: "MODERATE",
          metrics: { VIEWS: 18_000, SAVES: 240, LINK_CLICKS: 45 }
        },
        {
          contentId: "post-1",
          url: "javascript:alert(1)",
          publishedAt: "2026-09-16T18:00:00Z",
          metrics: { VIEWS: null }
        }
      ]
    },
    now
  );
}

test("compiles canonical per-platform metrics without coercing unknown values to zero", () => {
  const result = snapshot();
  const current = result.periods.find((period) => period.periodId === "instagram-7d-current");
  assert.equal(current?.metrics.AUDIENCE_TOTAL.value, 12_500);
  assert.equal(current?.metrics.AUDIENCE_TOTAL.truthState, "KNOWN");
  assert.equal(current?.metrics.SAVES.value, null);
  assert.equal(current?.metrics.SAVES.truthState, "UNKNOWN");
  assert.equal(result.sourceCoverage.effectiveState, "CONNECTED_AND_INGESTING");
  assert.equal(result.sourceCoverage.freshness, "FRESH");
});

test("keeps metric definitions explicitly within-platform instead of pretending unlike metrics are interchangeable", () => {
  assert.equal(SOCIAL_METRIC_DEFINITIONS_V1.REACH.comparisonPolicy, "WITHIN_PLATFORM_ONLY");
  assert.match(SOCIAL_METRIC_DEFINITIONS_V1.VIEWS.definitionNote, /vary by platform/i);
  assert.match(SOCIAL_METRIC_DEFINITIONS_V1.AUDIENCE_TOTAL.definitionNote, /overlap.*unknown/i);
});

test("computes bounded historical deltas while refusing fake percentage precision from a zero denominator", () => {
  const result = snapshot();
  const comparison = result.comparisons.find((row) => row.window === "7D");
  assert.equal(comparison?.metrics.AUDIENCE_TOTAL.absoluteDelta, 125);
  assert.equal(comparison?.metrics.AUDIENCE_TOTAL.percentageDelta, 125 / 12_375 * 100);
  assert.equal(comparison?.metrics.REACH.direction, "UP");
  assert.equal(comparison?.metrics.LINK_CLICKS.absoluteDelta, 310);
  assert.equal(comparison?.metrics.LINK_CLICKS.percentageDelta, null);
  assert.equal(comparison?.metrics.SAVES.direction, "UNKNOWN");
});

test("downgrades stale or never-synced connected sources rather than presenting them as healthy", () => {
  const stale = compileSocialSourceCoverageV1(
    {
      requestedState: "CONNECTED_AND_INGESTING",
      lastSuccessfulSyncAt: "2026-09-10T00:00:00Z"
    },
    now,
    48
  );
  assert.equal(stale.freshness, "STALE");
  assert.equal(stale.effectiveState, "CONNECTED_PARTIAL");
  assert.match(stale.reason ?? "", /stale/i);

  const never = compileSocialSourceCoverageV1(
    { requestedState: "CONNECTED_AND_INGESTING" },
    now,
    48
  );
  assert.equal(never.freshness, "NEVER_SYNCED");
  assert.equal(never.effectiveState, "CONNECTED_PARTIAL");
  assert.match(never.reason ?? "", /no successful sync/i);
});

test("preserves source availability states that do not imply a live account connection", () => {
  const needsImplementation = compileSocialSourceCoverageV1(
    { requestedState: "AVAILABLE_NEEDS_IMPLEMENTATION" },
    now
  );
  assert.equal(needsImplementation.effectiveState, "AVAILABLE_NEEDS_IMPLEMENTATION");
  assert.equal(needsImplementation.freshness, "NEVER_SYNCED");

  const needsConnection = compileSocialSourceCoverageV1(
    { requestedState: "NEEDS_KEEGAN_CONNECTION" },
    now
  );
  assert.equal(needsConnection.effectiveState, "NEEDS_KEEGAN_CONNECTION");
});

test("normalizes content metadata without inventing private metrics, causality, or unsafe links", () => {
  const result = snapshot();
  assert.deepEqual(result.content.map((row) => row.contentId), ["post-2", "post-1"]);
  assert.equal(result.content[0].subject, "Seattle Seahawks throwback helmet");
  assert.equal(result.content[0].attributionConfidence, "MODERATE");
  assert.deepEqual(result.content[0].businessOutcomeRefs, ["ga4:campaign:helmet-wip"]);
  assert.equal(result.content[1].url, null);
  assert.equal(result.content[1].metrics.VIEWS.truthState, "UNKNOWN");
  assert.equal(result.content[1].metrics.REACH.value, null);
});

test("calculates audience velocity and acceleration only from explicit historical points", () => {
  const result = calculateSocialAudienceTrendV1([
    { at: "2026-09-04T00:00:00Z", value: 12_200 },
    { at: "2026-09-11T00:00:00Z", value: 12_375 },
    { at: "2026-09-18T00:00:00Z", value: 12_500 }
  ]);
  assert.equal(result.absoluteDelta, 125);
  assert.equal(result.velocityPerDay, 125 / 7);
  assert.equal(result.priorVelocityPerDay, 175 / 7);
  assert.equal(result.accelerationPerDay, 125 / 7 - 175 / 7);
  assert.equal(result.direction, "UP");

  const unknown = calculateSocialAudienceTrendV1([
    { at: "2026-09-11T00:00:00Z", value: null },
    { at: "2026-09-18T00:00:00Z", value: 12_500 }
  ]);
  assert.equal(unknown.absoluteDelta, null);
  assert.equal(unknown.velocityPerDay, null);
  assert.equal(unknown.direction, "UNKNOWN");
});

test("adapts the legacy social bridge only as scaffolded evidence and never calls it live first-party data", () => {
  const result = adaptLegacySocialBridgeV1({
    generatedAt: "2026-09-18T04:00:00Z",
    mode: "PARTIAL",
    source: "manual_input",
    insights: [{ platform: "Instagram" }, { platform: "Website referral" }]
  });
  assert.equal(result.operationalState, "SCAFFOLDED");
  assert.equal(result.liveFirstPartyData, false);
  assert.equal(result.coverageState, "AVAILABLE_NEEDS_IMPLEMENTATION");
  assert.equal(result.recordCount, 2);
  assert.equal(result.limitations.some((value) => /not proven live platform ingestion/i.test(value)), true);
});

test("produces deterministic immutable output with explicit evidence lineage and no side effects", () => {
  const first = snapshot();
  const second = snapshot();
  assert.equal(first.snapshotId, second.snapshotId);
  assert.deepEqual(first.evidenceRefs, [
    "evidence:social:ig:audience:current",
    "evidence:social:ig:audience:prior",
    "evidence:social:ig:reach:current",
    "ga4:campaign:helmet-wip"
  ]);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.periods[0].metrics.AUDIENCE_TOTAL), true);
  assert.equal(first.externalAccessPerformed, false);
  assert.equal(first.writesPerformed, false);
});

test("rejects malformed time windows and impossible negative metrics instead of laundering them into canonical truth", () => {
  assert.throws(
    () => compileCanonicalSocialAccountSnapshotV1(
      {
        platform: "YOUTUBE",
        accountId: "channel",
        retrievedAt: now,
        sourceCoverage: { requestedState: "AVAILABLE_NEEDS_IMPLEMENTATION" },
        periods: [{ periodId: "bad", window: "7D", startAt: now, endAt: now, metrics: { VIEWS: 1 } }]
      },
      now
    ),
    /endAt must be after/
  );

  assert.throws(
    () => compileCanonicalSocialAccountSnapshotV1(
      {
        platform: "TIKTOK",
        accountId: "account",
        retrievedAt: now,
        sourceCoverage: { requestedState: "AVAILABLE_NEEDS_IMPLEMENTATION" },
        periods: [{ periodId: "bad-metric", window: "7D", startAt: "2026-09-11T00:00:00Z", endAt: "2026-09-18T00:00:00Z", metrics: { VIEWS: -1 } }]
      },
      now
    ),
    /finite non-negative/
  );
});
