import test from "node:test";
import assert from "node:assert/strict";

import { loadExternalIntelligenceConfigV1 } from "@/lib/external-intelligence/config/load-all";
import { buildSourceGovernanceAuditBundleForFixtures } from "@/lib/external-intelligence/governance/engine";

test("hash determinism: decision hashes are stable", () => {
  const cfg = loadExternalIntelligenceConfigV1();
  const bundle = buildSourceGovernanceAuditBundleForFixtures(cfg);

  for (const d of bundle.source_decisions) {
    assert.match(d.decision_hash, /^[a-f0-9]{64}$/);
  }
  for (const s of bundle.source_set_decisions) {
    assert.match(s.decision_hash, /^[a-f0-9]{64}$/);
  }
});
