// Phase B2: deterministic orchestration readiness report (no network).
//
// Run:
//   node --import tsx scripts/external-orchestration-readiness-report.mjs

import { loadProductionSourceRegistryV1 } from "../src/lib/external-intelligence/config/load-production-source-registry.ts";
import { evaluateDailyWatchdogV1 } from "../src/lib/external-intelligence/orchestration/watchdog.ts";

export function generateOrchestrationReadinessReport() {
  const { file: registry } = loadProductionSourceRegistryV1();

  const watchdog = evaluateDailyWatchdogV1({
    now_iso: "2026-08-05T00:00:00.000Z",
    schedule_enabled_by_source_id: {},
    allowed_now_by_source_id: {},
    adapter_operational_by_source_id: {}
  });

  const lines = [];
  lines.push("External Intelligence — Orchestration Readiness Report (B2)");
  lines.push("");

  for (const s of registry.sources.slice().sort((a, b) => a.source_id.localeCompare(b.source_id))) {
    const h = watchdog.find((x) => x.source_id === s.source_id);
    lines.push(`- ${s.source_id}`);
    lines.push(`  allowed_now=false (B2 must not enable collection)`);
    lines.push(`  schedule_configured=false schedule_enabled=false`);
    lines.push(`  next_run_at=none`);
    lines.push(`  health_state=${h?.health_state ?? "unknown"}`);
    lines.push(`  adapter_status=${s.implementation_status}`);
    lines.push(`  blockers=${(h?.blocker_codes ?? []).join(",") || "none"}`);
    lines.push("");
  }

  const total = registry.sources.length;
  lines.push("Summary");
  lines.push(`  total_governed_sources=${total}`);
  lines.push(`  active_schedules=0`);
  lines.push(`  due_jobs=0`);
  lines.push(`  external_collection_enabled=0`);

  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(generateOrchestrationReadinessReport());
}
