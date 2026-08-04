import test from "node:test";
import assert from "node:assert/strict";

import { createInternalFactVersionRef } from "@/lib/external-intelligence/adapters/intelligence-v1/fact-ref.adapter";
import type { FactRef } from "@/lib/intelligence-v1/contracts";

const baseFact: FactRef = {
  metric_id: "m1",
  value: 123,
  unit: "usd",
  business_date: "2026-08-04",
  window: { start_ts: null, end_ts: null, timezone: "America/Los_Angeles", window_type: "daily_bucket" },
  dimensions: { a: 1, b: 2 },
  provenance: { source_system: "internal", source_run_id: null, snapshot_id: null, retrieved_at: "2026-08-04T00:00:00Z", source_as_of: null },
  data_quality: { freshness_state: "fresh", coverage_state: "complete", attribution_defensible: "defensible", confidence_state: "trusted" },
  metric_definition_version: "v1"
} as unknown as FactRef;

test("FactRef VersionRef is deterministic and excludes retrieved_at", () => {
  const a = createInternalFactVersionRef({ fact: baseFact });
  const b = createInternalFactVersionRef({
    fact: { ...baseFact, provenance: { ...baseFact.provenance, retrieved_at: "2099-01-01T00:00:00Z" } } as unknown as FactRef
  });

  assert.equal(a.version_ref.content_hash, b.version_ref.content_hash);
  assert.equal(a.version_ref.object_type, "internal_fact");
});

test("FactRef dimensions: object key order does not change identity", () => {
  const a = createInternalFactVersionRef({ fact: { ...baseFact, dimensions: { a: 1, b: 2 } } as unknown as FactRef });
  const b = createInternalFactVersionRef({ fact: { ...baseFact, dimensions: { b: 2, a: 1 } } as unknown as FactRef });
  assert.equal(a.version_ref.content_hash, b.version_ref.content_hash);
});

test("FactRef dimensions: array order changes identity", () => {
  const a = createInternalFactVersionRef({ fact: { ...baseFact, dimensions: { tags: ["a", "b"] } } as unknown as FactRef });
  const b = createInternalFactVersionRef({ fact: { ...baseFact, dimensions: { tags: ["b", "a"] } } as unknown as FactRef });
  assert.notEqual(a.version_ref.content_hash, b.version_ref.content_hash);
});

test("FactRef dimensions: rejects non-canonical values", () => {
  assert.throws(() =>
    createInternalFactVersionRef({
      fact: { ...baseFact, dimensions: { bad: undefined } } as unknown as FactRef
    })
  );

  assert.throws(() =>
    createInternalFactVersionRef({
      fact: { ...baseFact, dimensions: { bad: Number.NaN } } as unknown as FactRef
    })
  );

  assert.throws(() =>
    createInternalFactVersionRef({
      fact: { ...baseFact, dimensions: { bad: new Date() } } as unknown as FactRef
    })
  );
});

test("FactRef dimensions: rejects cyclic structures", () => {
  const a: Record<string, unknown> = {};
  a.self = a;
  assert.throws(() =>
    createInternalFactVersionRef({
      fact: { ...baseFact, dimensions: a } as unknown as FactRef
    })
  );
});
