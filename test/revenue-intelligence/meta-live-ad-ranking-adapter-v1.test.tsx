import assert from "node:assert/strict";
import test from "node:test";

import { rankLiveMetaAdSnapshotV1 } from "../../src/lib/revenue-intelligence/meta-live-ad-ranking-adapter-v1";

type Json = Record<string, any>;

const NOW = "2026-09-19T14:00:00.000Z";

function ad(adId: string, overrides: Json = {}): Json {
  return {
    campaignId: "campaign-1",
    campaignName: "Campaign One",
    adSetId: "adset-1",
    adSetName: "Ad Set One",
    adId,
    adName: `Ad ${adId}`,
    spend: 100,
    impressions: 1000,
    clicks: 40,
    ctr: 4,
    cpc: 2.5,
    cpm: 100,
    purchases: 4,
    purchaseValue: 400,
    roas: 4,
    ...overrides,
  };
}

function window(
  key: "CURRENT_7D" | "PRIOR_7D" | "CURRENT_14D" | "PRIOR_14D",
  ads: Json[],
  overrides: Json = {},
): Json {
  const ranges = {
    CURRENT_7D: { role: "CURRENT", days: 7, startDate: "2026-09-12", endDate: "2026-09-18" },
    PRIOR_7D: { role: "PRIOR", days: 7, startDate: "2026-09-05", endDate: "2026-09-11" },
    CURRENT_14D: { role: "CURRENT", days: 14, startDate: "2026-09-05", endDate: "2026-09-18" },
    PRIOR_14D: { role: "PRIOR", days: 14, startDate: "2026-08-22", endDate: "2026-09-04" },
  } as const;
  const spec = ranges[key];
  return {
    key,
    role: spec.role,
    days: spec.days,
    reportingRange: { startDate: spec.startDate, endDate: spec.endDate },
    sourceCompleteness: {
      apiVersion: "v25.0",
      paginationComplete: true,
      pagesFetched: 1,
      completeThrough: spec.endDate,
      completedUtcDaysOnly: true,
    },
    ads,
    ...overrides,
  };
}

function snapshot(overrides: Json = {}): Json {
  return {
    generatedAt: "2026-09-19T13:30:00.000Z",
    accountId: "act_123",
    status: "LIVE",
    adFixedWindows: {
      generatedAt: "2026-09-19T13:29:59.000Z",
      completeThrough: "2026-09-18",
      windows: [
        window("CURRENT_7D", [ad("a", { roas: 5, ctr: 5, cpc: 2 })]),
        window("PRIOR_7D", [ad("a", { roas: 3, ctr: 3, cpc: 3 })]),
        window("CURRENT_14D", [ad("a", { roas: 4.5, ctr: 4.5, cpc: 2.2 })]),
        window("PRIOR_14D", [ad("a", { roas: 3.5, ctr: 3.5, cpc: 2.8 })]),
      ],
    },
    ...overrides,
  };
}

function rank(source: Json, overrides: Json = {}) {
  return rankLiveMetaAdSnapshotV1({
    snapshot: source,
    generatedAt: NOW,
    windowDays: 7,
    metric: "PURCHASE_ROAS",
    maximumEvidenceAgeHours: 24,
    minimumSampleSize: 100,
    materialChangeRatio: 0.2,
    ...overrides,
  });
}

test("feeds real live Meta fixed-window snapshot shape into the directional ranking contract", () => {
  const result = rank(snapshot());

  assert.equal(result.status, "READY");
  assert.equal(result.reasonCode, "LIVE_META_EVIDENCE_READY");
  assert.equal(result.apiVersion, "v25.0");
  assert.equal(result.sourceGeneratedAt, "2026-09-19T13:30:00.000Z");
  assert.equal(result.ranking?.status, "READY");
  assert.equal(result.ranking?.entries[0]?.adId, "a");
  assert.equal(result.ranking?.entries[0]?.classification, "WINNER_CANDIDATE");
  assert.equal(result.ranking?.entries[0]?.metricDefinitionId, "meta_offsite_purchase_value_over_spend_v1");
  assert.equal(result.ranking?.statisticalSignificanceEstablished, false);
  assert.equal(result.ranking?.causalityEstablished, false);
  assert.equal(result.ranking?.attributionEstablished, false);
  assert.equal(result.ranking?.monetaryImpact, null);
  assert.equal(result.authority.metaWriteAllowed, false);
  assert.equal(result.authority.approvalBypassAllowed, false);
});

test("fails closed when pagination or completed-day provenance is incomplete", () => {
  const source = snapshot();
  source.adFixedWindows.windows[0].sourceCompleteness.paginationComplete = false;

  const result = rank(source);
  assert.equal(result.status, "VERIFY_EVIDENCE");
  assert.equal(result.reasonCode, "FIXED_WINDOW_SOURCE_INCOMPLETE");
  assert.equal(result.ranking, null);
});

test("does not silently drop new, ended, moved, or otherwise non-comparable ads", () => {
  const source = snapshot();
  source.adFixedWindows.windows[0].ads.push(ad("new-ad"));

  const result = rank(source);
  assert.equal(result.status, "VERIFY_EVIDENCE");
  assert.equal(result.reasonCode, "AD_COHORT_NOT_COMPARABLE");
  assert.equal(result.ranking, null);
});

test("keeps omitted conversion evidence unknown instead of manufacturing zero ROAS", () => {
  const source = snapshot();
  source.adFixedWindows.windows[0].ads[0].roas = null;

  const result = rank(source);
  assert.equal(result.status, "VERIFY_EVIDENCE");
  assert.equal(result.reasonCode, "METRIC_EVIDENCE_INCOMPLETE");
  assert.equal(result.ranking, null);
});

test("fails closed on duplicate ad identity within a window", () => {
  const source = snapshot();
  source.adFixedWindows.windows[0].ads.push(ad("a"));

  const result = rank(source);
  assert.equal(result.status, "VERIFY_EVIDENCE");
  assert.equal(result.reasonCode, "FIXED_WINDOW_SOURCE_INCOMPLETE");
  assert.equal(result.ranking, null);
});

test("delegates freshness truth to the downstream ranking gate", () => {
  const result = rank(snapshot(), {
    generatedAt: "2026-09-22T14:00:00.000Z",
    maximumEvidenceAgeHours: 24,
  });

  assert.equal(result.status, "VERIFY_EVIDENCE");
  assert.equal(result.ranking?.status, "VERIFY_EVIDENCE");
  assert.equal(result.ranking?.reasonCode, "EVIDENCE_NOT_DECISION_GRADE");
});

test("supports CTR and CPC without changing directional semantics", () => {
  const source = snapshot();

  const ctr = rank(source, { metric: "CTR" });
  assert.equal(ctr.status, "READY");
  assert.equal(ctr.ranking?.entries[0]?.classification, "WINNER_CANDIDATE");
  assert.equal(ctr.ranking?.entries[0]?.metricDirection, "HIGHER_IS_BETTER");

  const cpc = rank(source, { metric: "CPC" });
  assert.equal(cpc.status, "READY");
  assert.equal(cpc.ranking?.entries[0]?.classification, "WINNER_CANDIDATE");
  assert.equal(cpc.ranking?.entries[0]?.metricDirection, "LOWER_IS_BETTER");
});
