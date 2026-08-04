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

  // Bundle must be blocked for production use.
  assert.equal(cfg.eligibility_summary.blocked, true);
  assert.ok(cfg.blocking_reasons.length > 0);
  assert.match(cfg.registry_content_hash, /^[a-f0-9]{64}$/);
  assert.match(cfg.source_sets_content_hash, /^[a-f0-9]{64}$/);

  // Unreviewed terms must produce automation block reasons (fail-closed for automation).
  assert.ok(cfg.automation_block_reasons_by_source_id["example.paywalled.manual_only"]!.length > 0);

  // Prohibited terms must parse and must block automation.
  assert.ok(cfg.automation_block_reasons_by_source_id["example.terms_restricted.prohibited"]!.length > 0);

  // Approved terms does not bypass other restrictions (paywall/licensing/auth/etc.).
  // (Fixture entries are not terms-approved, but the gate is derived from multiple fields.)
  const paywalledReasons = cfg.automation_block_reasons_by_source_id["example.paywalled.manual_only"]!;
  assert.ok(paywalledReasons.some((r) => r === "paywalled"));
  assert.ok(paywalledReasons.some((r) => r === "licensing_required"));
});
