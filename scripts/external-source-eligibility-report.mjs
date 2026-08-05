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

  // Summary counts (current vs potential).
  let automatedNow = 0;
  let manualNow = 0;
  let metadataNow = 0;
  let fullyBlockedNow = 0;

  let potentialAutomated = 0;
  let potentialManual = 0;
  let potentialMetadata = 0;

  const records = [];

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

    const autoAllowedNow = r.currently_allowed_modes.includes("automated");
    const manualAllowedNow = r.currently_allowed_modes.includes("manual");
    const metadataAllowedNow = r.currently_allowed_modes.includes("metadata_only");

    if (autoAllowedNow) automatedNow++;
    if (manualAllowedNow) manualNow++;
    if (metadataAllowedNow) metadataNow++;
    if (!autoAllowedNow && !manualAllowedNow && !metadataAllowedNow) fullyBlockedNow++;

    if (r.potentially_permitted_modes.includes("automated")) potentialAutomated++;
    if (r.potentially_permitted_modes.includes("manual")) potentialManual++;
    if (r.potentially_permitted_modes.includes("metadata_only")) potentialMetadata++;

    records.push({ s, r });
  }

  lines.push("Summary (current eligibility now)");
  lines.push(`total_sources=${registry.sources.length}`);
  lines.push(`automated_eligible_now=${automatedNow}`);
  lines.push(`manual_eligible_now=${manualNow}`);
  lines.push(`metadata_only_eligible_now=${metadataNow}`);
  lines.push(`fully_blocked_now=${fullyBlockedNow}`);
  lines.push("");

  lines.push("Summary (potential pathways after blockers)");
  lines.push(`potentially_automatable=${potentialAutomated}`);
  lines.push(`potentially_manual=${potentialManual}`);
  lines.push(`potentially_metadata_only=${potentialMetadata}`);
  lines.push("");

  // Per-source sections (deterministic ordering).
  records.sort((a, b) => a.s.source_id.localeCompare(b.s.source_id));

  for (const { s, r } of records) {
    const setsFor = (setMembership.get(s.source_id) ?? []).slice().sort();

    lines.push(`- ${s.source_id}`);
    lines.push(`  display_name=${s.display_name}`);
    lines.push(`  lifecycle=${s.lifecycle_status} impl=${s.implementation_status} access=${s.access_status}`);

    lines.push(`  allowed_now=${r.allowed_now}`);
    lines.push(`  currently_allowed_modes=${r.currently_allowed_modes.join(",") || "none"}`);

    lines.push(`  potentially_permitted_modes=${r.potentially_permitted_modes.join(",") || "none"}`);
    lines.push(`  universal_blockers=${r.universal_blockers.join(",") || "none"}`);
    lines.push(`  mode_blockers.automated=${r.mode_specific_blockers.automated.join(",") || "none"}`);
    lines.push(`  mode_blockers.manual=${r.mode_specific_blockers.manual.join(",") || "none"}`);
    lines.push(`  mode_blockers.metadata_only=${r.mode_specific_blockers.metadata_only.join(",") || "none"}`);

    lines.push(`  primary_blockers=${r.blocking_reasons.slice(0, 8).join(",") || "none"}`);
    lines.push(`  warnings=${r.warnings.join(",") || "none"}`);

    lines.push(`  terms=${s.terms_review_status} review_by=${s.review_by ?? "none"}`);
    lines.push(`  last_legal_review_at=${s.last_legal_review_at ?? "none"}`);
    lines.push(`  source_sets=${setsFor.join(",") || "none"}`);
    lines.push(`  expected_relevance=${s.expected_relevance} expected_noise=${s.expected_noise}`);
    lines.push(`  evaluation_fingerprint=${r.evaluation_fingerprint}`);
    lines.push("");
  }

  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Print only. No network.
  process.stdout.write(generateEligibilityReport());
}
