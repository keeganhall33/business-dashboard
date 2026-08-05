import test from "node:test";
import assert from "node:assert/strict";

import { loadExternalIntelligenceConfigV1 } from "@/lib/external-intelligence/config/load-all";
import { buildSourceGovernanceAuditBundleForFixtures } from "@/lib/external-intelligence/governance/engine";

test("immutability: audit bundle and nested structures are frozen", () => {
  const cfg = loadExternalIntelligenceConfigV1();
  const bundle = buildSourceGovernanceAuditBundleForFixtures(cfg);

  assert.ok(Object.isFrozen(bundle));
  assert.ok(Object.isFrozen(bundle.source_decisions));
  assert.ok(Object.isFrozen(bundle.source_decisions[0]));
  assert.ok(Object.isFrozen(bundle.source_set_decisions));
  assert.ok(Object.isFrozen(bundle.summary));
});
