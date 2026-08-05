import "@/lib/server-only";

import { loadProductionSourceRegistryV1 } from "@/lib/external-intelligence/config/load-production-source-registry";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import { evaluateAndPersistDailyWatchdogV1 } from "@/lib/external-intelligence/orchestration/watchdog-persist";

export async function runExternalSourceWatchdogV1(input: { now_iso: string }) {
  const supabase = getExternalIntelligenceSupabaseClient({});
  const { file: registry } = loadProductionSourceRegistryV1();
  const sourceIds = registry.sources.map((s) => s.source_id);

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

  // In B3 we intentionally keep collection blocked.
  const allowed_now_by_source_id = Object.fromEntries(sourceIds.map((id) => [id, false]));
  const adapter_operational_by_source_id = Object.fromEntries(sourceIds.map((id) => [id, false]));

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
