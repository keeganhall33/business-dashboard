import test from "node:test";
import assert from "node:assert/strict";

import { loadProductionSourceRegistryV1 } from "@/lib/external-intelligence/config/load-production-source-registry";
import { loadProductionSourceSetsV1 } from "@/lib/external-intelligence/config/load-production-source-sets";

test("registry hashing: deterministic", () => {
  const a = loadProductionSourceRegistryV1();
  const b = loadProductionSourceRegistryV1();
  assert.equal(a.registry_hash, b.registry_hash);
});

test("source sets hashing: deterministic", () => {
  const { file: registry } = loadProductionSourceRegistryV1();
  const known = registry.sources.map((s) => s.source_id);
  const a = loadProductionSourceSetsV1({ knownSourceIds: known });
  const b = loadProductionSourceSetsV1({ knownSourceIds: known });
  assert.equal(a.source_sets_hash, b.source_sets_hash);
});
