// Phase B2: deterministic scheduler readiness report (no network, no DB).
//
// Run:
//   node scripts/scheduler-readiness-report.mjs

import fs from "node:fs";

export function generateSchedulerReadinessReport() {
  const fwd = fs.readFileSync(
    "supabase/migrations/20260805010000_external_intelligence_phase_b2_orchestration.sql",
    "utf8"
  );

  const requiredRpcNames = [
    "lease_external_collection_job_v1",
    "renew_external_collection_job_lease_v1",
    "release_external_collection_job_lease_v1",
    "recover_expired_external_collection_leases_v1",
    "persist_sports_milestone_v1",
    "upsert_sports_milestone_alerts_v1",
    "invalidate_obsolete_sports_milestone_alerts_v1",
    "expire_sports_milestone_alerts_v1"
  ];

  const missing = requiredRpcNames.filter((n) => !fwd.includes(`function public.${n}`));

  const lines = [];
  lines.push("External Intelligence — Scheduler Readiness Report (B2)");
  lines.push("");
  lines.push(`required_rpcs=${requiredRpcNames.length} missing=${missing.length}`);
  for (const n of requiredRpcNames) {
    lines.push(`- rpc.${n}=${fwd.includes(`function public.${n}`) ? "present" : "missing"}`);
  }

  lines.push("");
  lines.push("Notes");
  lines.push("  scheduling_enabled=false (B2 must not activate scheduling)");
  lines.push("  collector_execution=false");

  if (missing.length > 0) {
    lines.push("");
    lines.push("Missing:");
    for (const n of missing) lines.push(`- ${n}`);
  }

  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(generateSchedulerReadinessReport());
}
