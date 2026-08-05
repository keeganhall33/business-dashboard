import test from "node:test";
import assert from "node:assert/strict";

import { loadProductionSourceRegistryV1 } from "@/lib/external-intelligence/config/load-production-source-registry";
import { loadProductionSourceSetsV1 } from "@/lib/external-intelligence/config/load-production-source-sets";

test("production source sets: membership validates and does not enable sources", () => {
  const { file: registry } = loadProductionSourceRegistryV1();
  const knownSourceIds = registry.sources.map((s) => s.source_id);

  const { file: sets, source_sets_hash } = loadProductionSourceSetsV1({ knownSourceIds });

  assert.equal(sets.schema_version, "production_source_sets_v1");
  assert.equal(sets.fixture_status, "production");
  assert.equal(sets.production_eligibility, "enabled");
  assert.match(source_sets_hash, /^[a-f0-9]{64}$/);

  // Fail-closed: no member references unknown sources.
  const known = new Set(knownSourceIds);
  for (const set of sets.source_sets) {
    assert.ok(set.members.length > 0);
    assert.ok(set.members.length <= set.maximum_active_members);

    for (const m of set.members) {
      assert.ok(known.has(m.source_id));
      assert.equal(m.member_enabled, false);
    }
  }
});
