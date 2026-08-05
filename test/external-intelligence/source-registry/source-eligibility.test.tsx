import test from "node:test";
import assert from "node:assert/strict";

import { loadExternalIntelligenceConfigV1 } from "@/lib/external-intelligence/config/load-all";
import { loadProductionSourceRegistryV1 } from "@/lib/external-intelligence/config/load-production-source-registry";
import { loadProductionSourceSetsV1 } from "@/lib/external-intelligence/config/load-production-source-sets";
import { evaluateSourceEligibility } from "@/lib/external-intelligence/config/evaluate-source-eligibility";

test("eligibility: fail-closed blocks automated collection for unreviewed/unimplemented sources", () => {
  const fixtures = loadExternalIntelligenceConfigV1();
  const policy_refs = Object.values(fixtures.policy_refs);
  assert.ok(policy_refs.length > 0);

  const { file: registry, registry_hash } = loadProductionSourceRegistryV1();
  const { file: sets, source_sets_hash } = loadProductionSourceSetsV1({ knownSourceIds: registry.sources.map((s) => s.source_id) });
  void sets;

  const s = registry.sources.find((x) => x.source_id === "sports_business.boardroom")!;
  assert.ok(s);

  const res = evaluateSourceEligibility({
    env: "production",
    source: s,
    requested_mode: "automated",
    registry_hash,
    registry_version: registry.registry_config_version,
    source_sets_hash,
    policy_refs,

    authentication_available: false,
    licensing_satisfied: false,
    paywall_satisfied: false,
    legal_review_current: false,
    retention_honorable: true,
    environment_approved_for_collection: false
  });

  assert.equal(res.allowed, false);
  assert.ok(res.blocking_reasons.includes("source_disabled"));
  assert.ok(res.blocking_reasons.includes("terms_not_reviewed"));
  assert.ok(res.blocking_reasons.some((r) => r.startsWith("implementation_not_operational")));
  assert.ok(res.blocking_reasons.includes("environment_not_approved"));
  assert.match(res.evaluation_fingerprint, /^[a-f0-9]{64}$/);
});

test("eligibility: prohibited terms blocks all collection", () => {
  const fixtures = loadExternalIntelligenceConfigV1();
  const policy_refs = Object.values(fixtures.policy_refs);

  const { file: registry, registry_hash } = loadProductionSourceRegistryV1();
  const { source_sets_hash } = loadProductionSourceSetsV1({ knownSourceIds: registry.sources.map((s) => s.source_id) });

  // Create a minimal prohibited clone.
  const base = registry.sources[0]!;
  const prohibited = { ...base, source_id: "tmp.prohibited", terms_review_status: "prohibited" as const };

  const res = evaluateSourceEligibility({
    env: "production",
    source: prohibited,
    requested_mode: "manual",
    registry_hash,
    registry_version: registry.registry_config_version,
    source_sets_hash,
    policy_refs,

    authentication_available: true,
    licensing_satisfied: true,
    paywall_satisfied: true,
    legal_review_current: true,
    retention_honorable: true,
    environment_approved_for_collection: true
  });

  assert.equal(res.allowed, false);
  assert.ok(res.blocking_reasons.includes("terms_prohibited"));
});
