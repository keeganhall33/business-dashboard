import "@/lib/server-only";

import { loadProductionSourceRegistryV1 } from "@/lib/external-intelligence/config/load-production-source-registry";
import { loadProductionSourceSetsV1 } from "@/lib/external-intelligence/config/load-production-source-sets";
import { evaluateSourceEligibility } from "@/lib/external-intelligence/config/evaluate-source-eligibility";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import { evaluateAndPersistDailyWatchdogV1 } from "@/lib/external-intelligence/orchestration/watchdog-persist";

export async function runExternalSourceWatchdogV1(input: { now_iso: string }) {
  const supabase = getExternalIntelligenceSupabaseClient({});
  const { file: registry, registry_hash } = loadProductionSourceRegistryV1();
  const sourceIds = registry.sources.map((s) => s.source_id);
  const { source_sets_hash } = loadProductionSourceSetsV1({ knownSourceIds: sourceIds });

  // Schedules drive enablement; for B3 we expect all enabled=false.
  const { data: schedules, error } = await supabase
    .from("external_collection_schedules_v1")
    .select("source_id,enabled")
    .in("source_id", sourceIds);
  if (error) throw new Error(`Failed to read schedules: ${error.message}`);

  const schedule_enabled_by_source_id = Object.fromEntries(sourceIds.map((id) => [id, false]));
  for (const row of schedules ?? []) {
    const r = row as unknown as { source_id: string; enabled: boolean };
    schedule_enabled_by_source_id[String(r.source_id)] = Boolean(r.enabled);
  }

  // Real governance evaluation + explicit activation boundary:
  // in B3 we keep environment NOT approved for collection, so allowed_now should remain false.
  const allowed_now_by_source_id: Record<string, boolean> = {};
  const adapter_operational_by_source_id: Record<string, boolean> = {};

  for (const s of registry.sources) {
    const eligibility = evaluateSourceEligibility({
      env: "production",
      source: s,
      requested_mode: "automated",
      registry_hash,
      registry_version: registry.registry_config_version,
      source_sets_hash,
      policy_refs: [],

      authentication_available: false,
      licensing_satisfied: false,
      paywall_satisfied: false,
      legal_review_current: false,
      retention_honorable: true,
      environment_approved_for_collection: false
    });

    allowed_now_by_source_id[s.source_id] = eligibility.allowed_now;
    adapter_operational_by_source_id[s.source_id] = s.implementation_status === "operational";
  }

  const records = await evaluateAndPersistDailyWatchdogV1({
    now_iso: input.now_iso,
    schedule_enabled_by_source_id,
    allowed_now_by_source_id,
    adapter_operational_by_source_id
  });

  return {
    sourcesEvaluated: records.length,
    healthRowsUpserted: records.length
  };
}
