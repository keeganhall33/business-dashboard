import test from "node:test";
import assert from "node:assert/strict";

import { loadProductionSourceRegistryV1 } from "@/lib/external-intelligence/config/load-production-source-registry";
import { loadProductionSourceSetsV1 } from "@/lib/external-intelligence/config/load-production-source-sets";

test("production registry + sets are deeply immutable (frozen)", () => {
  const { file: registry } = loadProductionSourceRegistryV1();

  assert.ok(Object.isFrozen(registry));
  assert.ok(Object.isFrozen(registry.sources));
  assert.ok(Object.isFrozen(registry.sources[0]));

  const { file: sets } = loadProductionSourceSetsV1({ knownSourceIds: registry.sources.map((s) => s.source_id) });
  assert.ok(Object.isFrozen(sets));
  assert.ok(Object.isFrozen(sets.source_sets));
  assert.ok(Object.isFrozen(sets.source_sets[0]));
});
