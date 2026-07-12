import test from "node:test";
import assert from "node:assert/strict";

import { insightFieldsFor } from "../src/lib/meta-intel/ingestion.ts";

type InsightLevel = "account" | "campaign" | "adset" | "ad";

function parseFields(level: InsightLevel) {
  return insightFieldsFor(level).split(",");
}

test("account-level fields exclude deprecated metrics", () => {
  const fields = parseFields("account");
  assert.ok(fields.includes("actions"));
  assert.ok(fields.includes("action_values"));
  assert.ok(fields.includes("video_15_sec_watched_actions"));
  assert.ok(!fields.includes("landing_page_views"));
  assert.ok(!fields.includes("video_plays"));
});

test("campaign-level fields include campaign metadata", () => {
  const fields = parseFields("campaign");
  assert.ok(fields.includes("campaign_id"));
  assert.ok(fields.includes("campaign_name"));
  assert.ok(fields.includes("daily_budget"));
});

test("ad set fields include optimization metadata", () => {
  const fields = parseFields("adset");
  assert.ok(fields.includes("adset_id"));
  assert.ok(fields.includes("optimization_goal"));
  assert.ok(fields.includes("bid_strategy"));
});

test("ad-level fields include creative references", () => {
  const fields = parseFields("ad");
  assert.ok(fields.includes("ad_id"));
  assert.ok(fields.includes("creative_id"));
  assert.ok(fields.includes("inline_link_click_ctr"));
});
