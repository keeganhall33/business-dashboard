// Phase B1.1: deterministic Wave 1 cadence proposal + watchdog evaluation (no network).
//
// Run:
//   node --import tsx scripts/wave1-cadence-watchdog-report.mjs

import { loadExternalIntelligenceConfigV1 } from "../src/lib/external-intelligence/config/load-all.ts";
import { loadProductionSourceRegistryV1 } from "../src/lib/external-intelligence/config/load-production-source-registry.ts";
import { buildWave1ProposedSchedulePolicies } from "../src/lib/external-intelligence/collection/scheduling/wave1-proposed-schedules.ts";
import { evaluateFreshnessWatchdogSnapshot } from "../src/lib/external-intelligence/collection/scheduling/freshness-watchdog-report.ts";

const WAVE1 = [
  "sports.major_leagues.official",
  "calendar.sports.milestones",
  "search.google_trends",
  "economics.fred",
  "licensing.uspto.trademarks",
  "ops.shipping.alerts",
  "sports_business.boardroom"
];

export function generateWave1CadenceWatchdogReport() {
  const fixtures = loadExternalIntelligenceConfigV1();
  const policy_refs = Object.values(fixtures.policy_refs);

  const { file: registry, registry_hash } = loadProductionSourceRegistryV1();

  const eligibility_fingerprint_by_source_id = Object.fromEntries(WAVE1.map((id) => [id, "0".repeat(64)]));

  const schedules = buildWave1ProposedSchedulePolicies({
    registry_hash,
    policy_refs,
    eligibility_fingerprint_by_source_id,
    created_at: "2026-08-05T14:00:00.000Z"
  });

  const byId = new Map(registry.sources.map((s) => [s.source_id, s]));

  const lines = [];
  lines.push("External Intelligence — Wave 1 Cadence + Watchdog Report (B1.1)");
  lines.push(`registry_hash=${registry_hash}`);
  lines.push("");

  for (const p of schedules.slice().sort((a, b) => a.source_id.localeCompare(b.source_id))) {
    const s = byId.get(p.source_id);

    // Deterministic synthetic watchdog snapshot: no collection history in B1.
    const wd = evaluateFreshnessWatchdogSnapshot({
      source_id: p.source_id,
      source_enabled: s?.enabled ?? false,
      currently_eligible_now: false,
      adapter_operational: s?.implementation_status === "operational",
      last_collection_attempt_at: null,
      last_successful_collection_at: null,
      last_observed_artifact_at: null,
      freshness_sla: p.freshness_sla,
      maximum_staleness: p.maximum_staleness,
      consecutive_failures: 0,
      credential_status: "unknown",
      terms_legal_review_expired: true,
      access_revoked: s?.access_status === "revoked",
      rate_limit_status: "unknown",
      next_scheduled_collection_at: null,
      now: "2026-08-05T14:00:00.000Z"
    });

    lines.push(`- ${p.source_id}`);
    lines.push(`  proposed_cadence=${p.cadence_type}:${p.cadence_interval}`);
    lines.push(`  freshness_sla=${p.freshness_sla} max_staleness=${p.maximum_staleness}`);
    lines.push(`  rationale=${p.priority}`);
    lines.push(`  current_eligibility=blocked (B1.1 planning only)`);
    lines.push(`  implementation_status=${s?.implementation_status ?? "unknown"}`);
    lines.push(`  scheduling_blockers=enabled=false + eligibility_not_allowed_now`);
    lines.push(`  watchdog_state=${wd.output_state} overdue=${wd.overdue}`);
    lines.push(`  watchdog_reasons=${wd.reasons.join(",") || "none"}`);
    lines.push("");
  }

  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(generateWave1CadenceWatchdogReport());
}
