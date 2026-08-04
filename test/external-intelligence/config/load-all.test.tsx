import test from "node:test";
import assert from "node:assert/strict";

import { loadExternalIntelligenceConfigV1 } from "@/lib/external-intelligence/config/load-all";

test("A2 config loaders: load fixtures fail-closed and preserve disabled state", () => {
  const cfg = loadExternalIntelligenceConfigV1();

  assert.equal(cfg.source_registry.production_eligibility, "disabled");
  assert.equal(cfg.source_registry.fixture_status, "architecture_fixture");

  for (const s of cfg.source_registry.sources) {
    assert.equal(s.enabled, false);
    assert.equal(s.enabled_by_default, false);
    assert.equal(s.implementation_status, "unimplemented");
    assert.ok(s.source_config_version.startsWith("v"));
  }

  // Source set memberships must reference known sources.
  const known = new Set(cfg.source_registry.sources.map((s) => s.source_id));
  for (const m of cfg.source_sets.memberships) {
    assert.ok(known.has(m.source_id));
  }

  // Policies must have deterministic content_hash.
  const keys = Object.keys(cfg.policies);
  assert.deepEqual(keys.slice().sort(), keys);
  for (const k of keys) {
    const p = cfg.policies[k]!.policy_ref;
    assert.match(p.content_hash, /^[a-f0-9]{64}$/);
  }
});
