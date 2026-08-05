import test from "node:test";
import assert from "node:assert/strict";

import { loadExternalIntelligenceConfigV1 } from "@/lib/external-intelligence/config/load-all";
import { buildSourceGovernanceAuditBundleForFixtures } from "@/lib/external-intelligence/governance/engine";

test("governance audit bundle is deterministic", () => {
  const cfg = loadExternalIntelligenceConfigV1();
  const a = buildSourceGovernanceAuditBundleForFixtures(cfg);
  const b = buildSourceGovernanceAuditBundleForFixtures(cfg);

  assert.deepEqual(a, b);
  assert.match(a.bundle_hash, /^[a-f0-9]{64}$/);
  assert.match(a.summary.summary_hash, /^[a-f0-9]{64}$/);
  assert.ok(a.source_decisions.length > 0);
});
