import test from "node:test";
import assert from "node:assert/strict";

import { computeDimensionsHash } from "@/lib/intelligence-v1/dimensions-hash";

function factKey(input: {
  metric_id: string;
  business_date: string;
  window_type: string;
  source_system: string;
  metric_definition_version: string;
  dimensions: Record<string, unknown>;
}) {
  return [
    input.metric_id,
    input.business_date,
    input.window_type,
    input.source_system,
    input.metric_definition_version,
    computeDimensionsHash(input.dimensions)
  ].join("|");
}

test("fact idempotency: identical fact + identical dimensions yields same uniqueness key", () => {
  const dimsA = { source: "google", device: "mobile" };
  const dimsB = { device: "mobile", source: "google" };
  const a = factKey({
    metric_id: "ga4.sessions_count",
    business_date: "2026-08-03",
    window_type: "selected_range_snapshot",
    source_system: "ga4",
    metric_definition_version: "v1",
    dimensions: dimsA
  });
  const b = factKey({
    metric_id: "ga4.sessions_count",
    business_date: "2026-08-03",
    window_type: "selected_range_snapshot",
    source_system: "ga4",
    metric_definition_version: "v1",
    dimensions: dimsB
  });
  assert.equal(a, b);
});

test("fact idempotency: identical fact + different dimensions yields distinct keys", () => {
  const a = factKey({
    metric_id: "ga4.sessions_count",
    business_date: "2026-08-03",
    window_type: "selected_range_snapshot",
    source_system: "ga4",
    metric_definition_version: "v1",
    dimensions: { device: "mobile" }
  });
  const b = factKey({
    metric_id: "ga4.sessions_count",
    business_date: "2026-08-03",
    window_type: "selected_range_snapshot",
    source_system: "ga4",
    metric_definition_version: "v1",
    dimensions: { device: "desktop" }
  });
  assert.notEqual(a, b);
});

