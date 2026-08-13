import assert from "node:assert/strict";
import test from "node:test";

import { loadProductionSourceRegistryV1 } from "@/lib/external-intelligence/config/load-production-source-registry";
import { evaluateDailyWatchdogV1 } from "@/lib/external-intelligence/orchestration/watchdog";

test("watchdog selection remains deterministic and is enriched with source-tier metadata", () => {
  const { file: registry } = loadProductionSourceRegistryV1();

  const out = evaluateDailyWatchdogV1({
    now_iso: "2026-08-13T00:00:00Z",
    schedule_enabled_by_source_id: {},
    allowed_now_by_source_id: {},
    adapter_operational_by_source_id: {}
  });

  const expectedIds = registry.sources
    .slice()
    .sort((a, b) => a.source_id.localeCompare(b.source_id))
    .map((s) => s.source_id);
  const gotIds = out.map((r) => r.source_id);

  // Must not change selection IDs/order.
  assert.deepEqual(gotIds, expectedIds);

  // Enrichment must be present and explicit.
  for (const r of out) {
    assert.ok(r.source_tier, "expected source_tier");
    assert.ok(["available", "degraded", "unavailable", "unknown"].includes(r.availability));
    // Freshness can be null, but must not be fabricated.
    if (r.freshness) {
      assert.ok(typeof r.freshness.expected_cadence === "string");
      assert.ok(typeof r.freshness.freshness_threshold === "string");
    }
  }
});

export {};
