import test from "node:test";
import assert from "node:assert/strict";

import { createInternalFactVersionRef } from "@/lib/external-intelligence/adapters/intelligence-v1/fact-ref.adapter";

const baseFact = {
  metric_id: "m1",
  value: 123,
  unit: "usd",
  business_date: "2026-08-04",
  window: { start_ts: null, end_ts: null, timezone: "America/Los_Angeles", window_type: "daily_bucket" },
  dimensions: { a: 1, b: 2 },
  provenance: { source_system: "internal", source_run_id: null, snapshot_id: null, retrieved_at: "2026-08-04T00:00:00Z", source_as_of: null },
  data_quality: { freshness_state: "fresh", coverage_state: "complete", attribution_defensible: "defensible", confidence_state: "trusted" },
  metric_definition_version: "v1"
};

test("FactRef VersionRef is deterministic and excludes retrieved_at", () => {
  const a = createInternalFactVersionRef({ fact: baseFact as any });
  const b = createInternalFactVersionRef({ fact: { ...baseFact, provenance: { ...baseFact.provenance, retrieved_at: "2099-01-01T00:00:00Z" } } as any });

  assert.equal(a.version_ref.content_hash, b.version_ref.content_hash);
  assert.equal(a.version_ref.object_type, "internal_fact");
});
