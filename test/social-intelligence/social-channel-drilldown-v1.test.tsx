import assert from "node:assert/strict";
import test from "node:test";

import { compileCanonicalSocialAccountSnapshotV1 } from "../../src/lib/social-intelligence/social-canonical-v1";
import { compileSocialChannelDrilldownV1 } from "../../src/lib/social-intelligence/social-channel-drilldown-v1";

const now = "2026-09-18T09:00:00Z";

function snapshot(options?: {
  requestedState?: "CONNECTED_AND_INGESTING" | "CONNECTED_PARTIAL" | "AVAILABLE_NEEDS_IMPLEMENTATION" | "NEEDS_KEEGAN_CONNECTION" | "NOT_AVAILABLE";
  lastSuccessfulSyncAt?: string | null;
  metricCoverage?: readonly ("AUDIENCE_TOTAL" | "REACH" | "VIEWS" | "LINK_CLICKS" | "SAVES")[];
  includeWindow?: boolean;
  futureContent?: boolean;
}) {
  return compileCanonicalSocialAccountSnapshotV1(
    {
      platform: "INSTAGRAM",
      accountId: "keegan-hall",
      handle: "@keeganhall",
      retrievedAt: "2026-09-18T08:55:00Z",
      sourceCoverage: {
        requestedState: options?.requestedState ?? "CONNECTED_AND_INGESTING",
        lastSuccessfulSyncAt: options?.lastSuccessfulSyncAt === undefined ? "2026-09-18T08:50:00Z" : options.lastSuccessfulSyncAt,
        metricCoverage: options?.metricCoverage ?? ["AUDIENCE_TOTAL", "REACH", "VIEWS", "LINK_CLICKS"],
        limitations: ["Saves are not exposed by this provider path"]
      },
      periods: options?.includeWindow === false ? [] : [
        {
          periodId: "ig-7d-current",
          window: "7D",
          startAt: "2026-09-11T00:00:00Z",
          endAt: "2026-09-18T00:00:00Z",
          metrics: {
            AUDIENCE_TOTAL: { value: 12_500, evidenceRefs: ["evidence:ig:audience:current"] },
            REACH: { value: 40_000, evidenceRefs: ["evidence:ig:reach:current"] },
            VIEWS: { value: 75_000, evidenceRefs: ["evidence:ig:views:current"] },
            LINK_CLICKS: { value: 310, evidenceRefs: ["evidence:ig:clicks:current"] },
            SAVES: { value: 240, evidenceRefs: ["evidence:ig:saves:current"] }
          }
        },
        {
          periodId: "ig-7d-prior",
          window: "7D",
          startAt: "2026-09-04T00:00:00Z",
          endAt: "2026-09-11T00:00:00Z",
          metrics: {
            AUDIENCE_TOTAL: { value: 12_375, evidenceRefs: ["evidence:ig:audience:prior"] },
            REACH: 32_000,
            VIEWS: 70_000,
            LINK_CLICKS: 0,
            SAVES: 180
          }
        }
      ],
      content: [
        {
          contentId: "helmet-wip",
          url: "https://instagram.com/p/helmet-wip",
          publishedAt: "2026-09-17T18:00:00Z",
          format: "REEL",
          subject: "Seattle Seahawks throwback helmet",
          project: "Seahawks helmet drawing",
          theme: "WORK_IN_PROGRESS",
          hook: "50% to finished detail reveal",
          amplificationType: "ORGANIC",
          businessOutcomeRefs: ["ga4:campaign:helmet-wip"],
          attributionConfidence: "MODERATE",
          metrics: {
            VIEWS: { value: 18_000, evidenceRefs: ["evidence:ig:helmet:views"] },
            SAVES: { value: 240, evidenceRefs: ["evidence:ig:helmet:saves"] }
          }
        },
        ...(options?.futureContent ? [{
          contentId: "future-post",
          publishedAt: "2026-09-20T18:00:00Z",
          metrics: { VIEWS: { value: 1, evidenceRefs: ["evidence:future"] } }
        }] : [])
      ]
    },
    "2026-09-18T08:55:00Z"
  );
}

test("builds a decision-grade single-channel drilldown from fresh declared provider evidence", () => {
  const result = compileSocialChannelDrilldownV1(snapshot(), { window: "7D", now });
  assert.equal(result.availability, "READY");
  assert.equal(result.platform, "INSTAGRAM");
  assert.equal(result.currentPeriod?.periodId, "ig-7d-current");
  const audience = result.metrics.find((metric) => metric.key === "AUDIENCE_TOTAL");
  assert.equal(audience?.state, "CURRENT");
  assert.equal(audience?.decisionGrade, true);
  assert.equal(audience?.value, 12_500);
  assert.equal(audience?.absoluteDelta, 125);
  assert.equal(audience?.percentageDelta, 125 / 12_375 * 100);
  assert.equal(result.audienceTrend.summary.velocityPerDay, 125 / 7);
  assert.equal(result.audienceTrend.decisionGrade, true);
});

test("keeps unavailable metrics visibly unavailable instead of converting them to zero", () => {
  const clean = snapshot({ metricCoverage: ["AUDIENCE_TOTAL", "REACH", "VIEWS", "LINK_CLICKS", "SAVES"] });
  const tampered = {
    ...clean,
    periods: clean.periods.map((period) => ({
      ...period,
      metrics: { ...period.metrics, SAVES: { key: "SAVES" as const, value: null, truthState: "UNKNOWN" as const, evidenceRefs: [] } }
    })),
    sourceCoverage: { ...clean.sourceCoverage, metricCoverage: clean.sourceCoverage.metricCoverage.filter((key) => key !== "SAVES") }
  };
  const result = compileSocialChannelDrilldownV1(tampered, { window: "7D", now });
  const saves = result.metrics.find((metric) => metric.key === "SAVES");
  assert.equal(saves?.state, "NOT_IN_PROVIDER_COVERAGE");
  assert.equal(saves?.value, null);
  assert.equal(saves?.decisionGrade, false);
});

test("flags known observations outside declared provider coverage instead of silently trusting them", () => {
  const result = compileSocialChannelDrilldownV1(snapshot(), { window: "7D", now });
  const saves = result.metrics.find((metric) => metric.key === "SAVES");
  assert.equal(saves?.state, "COVERAGE_CONFLICT");
  assert.equal(saves?.decisionGrade, false);
  assert.equal(saves?.value, 240);
  assert.equal(result.warnings.some((item) => item.code === "COVERAGE_CONFLICT" && item.metricKey === "SAVES"), true);
});

test("re-evaluates freshness at read time so an old connector snapshot cannot remain decision grade", () => {
  const result = compileSocialChannelDrilldownV1(
    snapshot({ lastSuccessfulSyncAt: "2026-09-10T08:50:00Z" }),
    { window: "7D", now, staleAfterHours: 48 }
  );
  assert.equal(result.availability, "PARTIAL");
  assert.equal(result.sourceHealth.freshness, "STALE");
  assert.equal(result.metrics.find((metric) => metric.key === "VIEWS")?.state, "NOT_CURRENT");
  assert.equal(result.metrics.find((metric) => metric.key === "VIEWS")?.decisionGrade, false);
  assert.equal(result.warnings.some((item) => item.code === "SOURCE_STALE"), true);
});

test("preserves explicit connector availability states without pretending a live account exists", () => {
  const needsConnection = compileSocialChannelDrilldownV1(
    snapshot({ requestedState: "NEEDS_KEEGAN_CONNECTION", lastSuccessfulSyncAt: null, includeWindow: false }),
    { window: "7D", now }
  );
  assert.equal(needsConnection.availability, "NEEDS_CONNECTION");
  assert.equal(needsConnection.warnings.some((item) => item.code === "NEEDS_CONNECTION"), true);

  const needsImplementation = compileSocialChannelDrilldownV1(
    snapshot({ requestedState: "AVAILABLE_NEEDS_IMPLEMENTATION", lastSuccessfulSyncAt: null, includeWindow: false }),
    { window: "7D", now }
  );
  assert.equal(needsImplementation.availability, "NEEDS_IMPLEMENTATION");

  const unavailable = compileSocialChannelDrilldownV1(
    snapshot({ requestedState: "NOT_AVAILABLE", lastSuccessfulSyncAt: null, includeWindow: false }),
    { window: "7D", now }
  );
  assert.equal(unavailable.availability, "UNAVAILABLE");
});

test("keeps missing history windows explicit and does not borrow unlike periods", () => {
  const result = compileSocialChannelDrilldownV1(snapshot(), { window: "30D", now });
  assert.equal(result.availability, "PARTIAL");
  assert.equal(result.currentPeriod, null);
  assert.equal(result.warnings.some((item) => item.code === "MISSING_WINDOW"), true);
  assert.equal(result.metrics.find((metric) => metric.key === "REACH")?.value, null);
});

test("excludes future-dated content from observed performance and preserves an explicit warning", () => {
  const result = compileSocialChannelDrilldownV1(snapshot({ futureContent: true }), { window: "7D", now });
  assert.deepEqual(result.recentContent.map((item) => item.contentId), ["helmet-wip"]);
  assert.equal(result.warnings.some((item) => item.code === "FUTURE_CONTENT"), true);
});

test("preserves content provenance and attribution labels without converting them into causal claims", () => {
  const result = compileSocialChannelDrilldownV1(snapshot(), { window: "7D", now });
  const content = result.recentContent[0];
  assert.equal(content.attributionConfidence, "MODERATE");
  assert.deepEqual(content.businessOutcomeRefs, ["ga4:campaign:helmet-wip"]);
  assert.equal(content.knownMetrics.find((metric) => metric.key === "VIEWS")?.value, 18_000);
  assert.equal(result.causalAttributionClaimed, false);
  assert.equal(result.crossPlatformAggregationPerformed, false);
});

test("is deterministic, immutable, bounded, and grants no external or write authority", () => {
  const first = compileSocialChannelDrilldownV1(snapshot(), { window: "7D", now, maxRecentContent: 1 });
  const second = compileSocialChannelDrilldownV1(snapshot(), { window: "7D", now, maxRecentContent: 1 });
  assert.deepEqual(first, second);
  assert.equal(first.recentContent.length, 1);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.metrics[0]), true);
  assert.equal(first.externalAccessPerformed, false);
  assert.equal(first.writesPerformed, false);
  assert.throws(() => compileSocialChannelDrilldownV1(snapshot(), { window: "7D", now, maxRecentContent: 51 }), /between 1 and 50/);
});

test("rejects future snapshot or sync timestamps rather than presenting impossible freshness", () => {
  const base = snapshot();
  assert.throws(
    () => compileSocialChannelDrilldownV1({ ...base, retrievedAt: "2026-09-19T00:00:00Z" }, { window: "7D", now }),
    /retrievedAt cannot be in the future/
  );

  const futureSync = {
    ...base,
    sourceCoverage: { ...base.sourceCoverage, lastSuccessfulSyncAt: "2026-09-19T00:00:00Z" }
  };
  assert.throws(
    () => compileSocialChannelDrilldownV1(futureSync, { window: "7D", now }),
    /lastSuccessfulSyncAt cannot be in the future/
  );
});
