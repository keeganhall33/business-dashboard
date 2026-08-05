import test from "node:test";
import assert from "node:assert/strict";

import { loadExternalIntelligenceConfigV1 } from "@/lib/external-intelligence/config/load-all";
import { buildSourceGovernanceAuditBundleForFixtures } from "@/lib/external-intelligence/governance/engine";

test("fail-closed: fixture bundle yields zero automated eligible sources", () => {
  const cfg = loadExternalIntelligenceConfigV1();
  const bundle = buildSourceGovernanceAuditBundleForFixtures(cfg);

  assert.equal(bundle.summary.allowed_automated, 0);
  assert.ok(bundle.summary.fully_blocked > 0);

  for (const d of bundle.source_decisions) {
    assert.equal(d.allowed, false);
    assert.ok(d.blocking_reasons.includes("fixture_bundle_production_disabled"));
  }
});
