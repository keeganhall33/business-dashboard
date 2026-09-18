import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const MIGRATION = "supabase/migrations/20260918025500_authoritative_woo_range_coverage_v2.sql";

test("Woo completeness uses cumulative successful-run coverage for completed Pacific days", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  assert.match(sql, /requested_days/i);
  assert.match(sql, /not exists[\s\S]*successful_runs/i);
  assert.match(sql, /America\/Los_Angeles/);
  assert.match(sql, /canonical_woo_order_telemetry/);
  assert.match(sql, /woo_paid_net_v2/);
  assert.doesNotMatch(sql, /limit\s+1/i);
});

test("Executive Home omits generic metric and opportunity confirmation badges", () => {
  const source = readFileSync("src/components/executive-home/ExecutiveHomeVisualSummaryV2.tsx", "utf8");
  assert.doesNotMatch(source, /Partial data/);
  assert.doesNotMatch(source, /function TruthLabel/);
  assert.doesNotMatch(source, /<TruthChip state=\{opportunity\.evidence\}/);
});
