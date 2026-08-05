import test from "node:test";
import assert from "node:assert/strict";

// This test is intentionally simple: it asserts that the governance layer can run
// without requiring network APIs to be present.

import { loadProductionSourceRegistryV1 } from "@/lib/external-intelligence/config/load-production-source-registry";
import { loadProductionSourceSetsV1 } from "@/lib/external-intelligence/config/load-production-source-sets";

test("source governance loaders do not require network access", () => {
  const { file: registry } = loadProductionSourceRegistryV1();
  const { file: sets } = loadProductionSourceSetsV1({ knownSourceIds: registry.sources.map((s) => s.source_id) });

  assert.equal(registry.sources.length, 24);
  assert.ok(sets.source_sets.length >= 5);
});
