// Phase B0: deterministic, read-only governance audit bundle.
//
// Run:
//   node --import tsx scripts/source-governance-audit.mjs
//
// Safety: no network access, no persistence writes.

import { loadExternalIntelligenceConfigV1 } from "../src/lib/external-intelligence/config/load-all.ts";
import { buildSourceGovernanceAuditBundleForFixtures } from "../src/lib/external-intelligence/governance/engine.ts";

export function generateGovernanceAuditBundle() {
  const cfg = loadExternalIntelligenceConfigV1();
  return buildSourceGovernanceAuditBundleForFixtures(cfg);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bundle = generateGovernanceAuditBundle();
  process.stdout.write(JSON.stringify(bundle, null, 2));
}
