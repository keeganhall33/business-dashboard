// NOTE: This script is pure read-only config evaluation.
// Run via: node --import tsx scripts/external-source-eligibility-report.mjs

import { loadExternalIntelligenceConfigV1 } from "../src/lib/external-intelligence/config/load-all.ts";
import { loadProductionSourceRegistryV1 } from "../src/lib/external-intelligence/config/load-production-source-registry.ts";
import { loadProductionSourceSetsV1 } from "../src/lib/external-intelligence/config/load-production-source-sets.ts";
import { evaluateSourceEligibility } from "../src/lib/external-intelligence/config/evaluate-source-eligibility.ts";

export function generateEligibilityReport() {
  const fixtures = loadExternalIntelligenceConfigV1();
  const policy_refs = Object.values(fixtures.policy_refs);

  const { file: registry, registry_hash } = loadProductionSourceRegistryV1();
  const { file: sets, source_sets_hash } = loadProductionSourceSetsV1({ knownSourceIds: registry.sources.map((s) => s.source_id) });

  const setMembership = new Map();
  for (const set of sets.source_sets) {
    for (const m of set.members) {
      const arr = setMembership.get(m.source_id) ?? [];
      arr.push(set.source_set_id);
      setMembership.set(m.source_id, arr);
    }
  }

  const lines = [];
  lines.push("External Intelligence — Production Source Eligibility Report (B0)");
  lines.push(`registry_version=${registry.registry_config_version} registry_hash=${registry_hash}`);
  lines.push(`source_sets_version=${sets.source_sets_config_version} source_sets_hash=${source_sets_hash}`);
  lines.push("");

  for (const s of registry.sources) {
    const r = evaluateSourceEligibility({
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

    const setsFor = (setMembership.get(s.source_id) ?? []).slice().sort();

    lines.push(`- ${s.source_id}`);
    lines.push(`  lifecycle=${s.lifecycle_status} impl=${s.implementation_status} access=${s.access_status}`);
    lines.push(`  automation_allowed=${r.allowed_modes.includes("automated")}`);
    lines.push(`  manual_allowed=${r.allowed_modes.includes("manual")}`);
    lines.push(`  metadata_only_allowed=${r.allowed_modes.includes("metadata_only")}`);
    lines.push(`  primary_blockers=${r.blocking_reasons.slice(0, 6).join(",") || "none"}`);
    lines.push(`  terms=${s.terms_review_status} review_by=${s.review_by ?? "none"}`);
    lines.push(`  source_sets=${setsFor.join(",") || "none"}`);
    lines.push("");
  }

  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Print only. No network.
  process.stdout.write(generateEligibilityReport());
}
