import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMetaAdFixedWindowPlanV1,
  META_AD_INSIGHT_FIELDS_V1,
  META_CAMPAIGN_INSIGHT_FIELDS_V1,
  summarizeMetaAdInsightV1,
  summarizeMetaCampaignInsightV1,
} from "../../../scripts/lib/meta-ad-fixed-window-v1.mjs";

test("builds complete fixed Meta windows from the last fully completed UTC day", () => {
  const plan = buildMetaAdFixedWindowPlanV1("2026-09-19T13:30:00.000Z");
  const byKey = new Map(plan.windows.map((window) => [window.key, window]));

  assert.equal(plan.completeThrough, "2026-09-18");
  assert.deepEqual(byKey.get("CURRENT_7D")?.range, {
    startDate: "2026-09-12",
    endDate: "2026-09-18",
  });
  assert.deepEqual(byKey.get("PRIOR_7D")?.range, {
    startDate: "2026-09-05",
    endDate: "2026-09-11",
  });
  assert.deepEqual(byKey.get("CURRENT_14D")?.range, {
    startDate: "2026-09-05",
    endDate: "2026-09-18",
  });
  assert.deepEqual(byKey.get("PRIOR_14D")?.range, {
    startDate: "2026-08-22",
    endDate: "2026-09-04",
  });
  assert.equal(byKey.get("CONTEXT_30D")?.range.endDate, plan.completeThrough);
  assert.equal(byKey.get("CONTEXT_90D")?.range.endDate, plan.completeThrough);
});

test("keeps current and prior decision windows adjacent and non-overlapping", () => {
  const plan = buildMetaAdFixedWindowPlanV1("2026-01-01T00:00:00.000Z");
  const byKey = new Map(plan.windows.map((window) => [window.key, window]));

  assert.deepEqual(byKey.get("CURRENT_7D")?.range, {
    startDate: "2025-12-25",
    endDate: "2025-12-31",
  });
  assert.deepEqual(byKey.get("PRIOR_7D")?.range, {
    startDate: "2025-12-18",
    endDate: "2025-12-24",
  });
  assert.deepEqual(byKey.get("CURRENT_14D")?.range, {
    startDate: "2025-12-18",
    endDate: "2025-12-31",
  });
  assert.deepEqual(byKey.get("PRIOR_14D")?.range, {
    startDate: "2025-12-04",
    endDate: "2025-12-17",
  });
});

test("rejects an invalid fixed-window clock instead of inventing date coverage", () => {
  assert.throws(() => buildMetaAdFixedWindowPlanV1("not-a-date"), /now instant is invalid/);
});

test("requests exact ad identity plus observed performance fields", () => {
  assert.deepEqual(META_AD_INSIGHT_FIELDS_V1.slice(0, 6), [
    "campaign_id",
    "campaign_name",
    "adset_id",
    "adset_name",
    "ad_id",
    "ad_name",
  ]);
  assert.ok(META_AD_INSIGHT_FIELDS_V1.includes("spend"));
  assert.ok(META_AD_INSIGHT_FIELDS_V1.includes("impressions"));
  assert.ok(META_AD_INSIGHT_FIELDS_V1.includes("clicks"));
  assert.ok(META_AD_INSIGHT_FIELDS_V1.includes("actions"));
  assert.ok(META_AD_INSIGHT_FIELDS_V1.includes("action_values"));
  assert.deepEqual(META_CAMPAIGN_INSIGHT_FIELDS_V1.slice(0, 2), ["campaign_id", "campaign_name"]);
});

test("normalizes a Meta ad row without manufacturing omitted conversion evidence", () => {
  const row = summarizeMetaAdInsightV1({
    campaign_id: "campaign-1",
    campaign_name: "Campaign One",
    adset_id: "adset-1",
    adset_name: "Ad Set One",
    ad_id: "ad-1",
    ad_name: "Ad One",
    spend: "0",
    impressions: "150",
    clicks: "3",
    ctr: "2",
    cpc: "0",
    cpm: "0",
  });

  assert.equal(row.spend, 0);
  assert.equal(row.impressions, 150);
  assert.equal(row.clicks, 3);
  assert.equal(row.purchases, null);
  assert.equal(row.purchaseValue, null);
  assert.equal(row.roas, null);
});

test("preserves directly reported purchase evidence and derives ROAS only when supported", () => {
  const row = summarizeMetaAdInsightV1({
    campaign_id: "campaign-1",
    adset_id: "adset-1",
    ad_id: "ad-1",
    spend: "25.00",
    impressions: "1000",
    clicks: "25",
    ctr: "2.5",
    cpc: "1",
    cpm: "25",
    actions: [{ action_type: "offsite_conversion.purchase", value: "2" }],
    action_values: [{ action_type: "offsite_conversion.purchase", value: "100" }],
  });

  assert.equal(row.purchases, 2);
  assert.equal(row.purchaseValue, 100);
  assert.equal(row.roas, 4);
  assert.equal(row.campaignName, null);
  assert.equal(row.adSetName, null);
  assert.equal(row.adName, null);
});

test("keeps omitted campaign conversion evidence unknown instead of coercing it to zero", () => {
  const row = summarizeMetaCampaignInsightV1({
    campaign_id: "campaign-1",
    campaign_name: "Campaign One",
    spend: "0",
    impressions: "20",
    clicks: "0",
  });

  assert.equal(row.spend, 0);
  assert.equal(row.purchases, null);
  assert.equal(row.purchaseValue, null);
  assert.equal(row.roas, null);
});

test("fails closed on missing or malformed required performance evidence", () => {
  assert.throws(
    () => summarizeMetaAdInsightV1({ campaign_id: "c", adset_id: "s", ad_id: "a", impressions: "1", clicks: "0" }),
    /missing spend/,
  );
  assert.throws(
    () => summarizeMetaAdInsightV1({ campaign_id: "c", adset_id: "s", ad_id: "a", spend: "1", impressions: "1.5", clicks: "0" }),
    /invalid impressions/,
  );
  assert.throws(
    () => summarizeMetaCampaignInsightV1({ campaign_id: "c", spend: "-1", impressions: "1", clicks: "0" }),
    /invalid spend/,
  );
});

test("fails closed on conflicting purchase action evidence", () => {
  assert.throws(
    () => summarizeMetaAdInsightV1({
      campaign_id: "c",
      adset_id: "s",
      ad_id: "a",
      spend: "1",
      impressions: "10",
      clicks: "1",
      actions: [
        { action_type: "offsite_conversion.purchase", value: "1" },
        { action_type: "offsite_conversion.purchase", value: "2" },
      ],
    }),
    /conflicting offsite_conversion.purchase action evidence/,
  );
});
