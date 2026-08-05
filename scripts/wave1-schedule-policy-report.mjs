// Phase B1.1: deterministic, read-only proposed schedule policy report (no network).
//
// Run:
//   node --import tsx scripts/wave1-schedule-policy-report.mjs

import { loadExternalIntelligenceConfigV1 } from "../src/lib/external-intelligence/config/load-all.ts";
import { loadProductionSourceRegistryV1 } from "../src/lib/external-intelligence/config/load-production-source-registry.ts";
import { buildWave1ProposedSchedulePolicies } from "../src/lib/external-intelligence/collection/scheduling/wave1-proposed-schedules.ts";

export function generateWave1SchedulePolicyReport() {
  const fixtures = loadExternalIntelligenceConfigV1();
  const policy_refs = Object.values(fixtures.policy_refs);

  const { file: registry, registry_hash } = loadProductionSourceRegistryV1();

  // Eligibility fingerprints are produced by the governance evaluator; in B1.1 we use placeholders.
  // Schedules remain enabled=false regardless.
  const eligibility_fingerprint_by_source_id = Object.fromEntries(
    registry.sources.map((s) => [s.source_id, "0".repeat(64)])
  );

  const policies = buildWave1ProposedSchedulePolicies({
    registry_hash,
    policy_refs,
    eligibility_fingerprint_by_source_id,
    created_at: "2026-08-05T14:00:00.000Z"
  });

  const lines = [];
  lines.push("External Intelligence — Wave 1 Proposed Schedule Policies (B1.1)");
  lines.push(`registry_hash=${registry_hash}`);
  lines.push("");

  for (const p of policies.slice().sort((a, b) => a.source_id.localeCompare(b.source_id))) {
    lines.push(`- ${p.source_id}`);
    lines.push(`  cadence=${p.cadence_type}:${p.cadence_interval}`);
    lines.push(`  freshness_sla=${p.freshness_sla} max_staleness=${p.maximum_staleness}`);
    lines.push(`  enabled=${p.enabled}`);
    lines.push(`  schedule_hash=${p.schedule_content_hash}`);
    lines.push("");
  }

  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(generateWave1SchedulePolicyReport());
}
