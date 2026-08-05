import "@/lib/server-only";

import type { SourceHealthRecord } from "@/lib/external-intelligence/orchestration/watchdog";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";

export class ExternalCollectionHealthRepository {
  async upsertHealthRecords(records: SourceHealthRecord[]) {
    const supabase = getExternalIntelligenceSupabaseClient({});

    const rows = records.map((r) => ({
      source_id: r.source_id,
      source_config_version: r.source_config_version,
      health_state: r.health_state,
      blocker_codes: r.blocker_codes,
      warning_codes: r.warning_codes,
      evaluated_at: r.evaluated_at,
      updated_at: r.evaluated_at,
      // Remaining columns are optional in B2.
      credential_state: "unknown",
      access_state: "unknown",
      terms_state: "unknown",
      rate_limit_state: {},
      is_overdue: false,
      is_stale: false
    }));

    const { error } = await supabase.from("external_collection_health_v1").upsert(rows, { onConflict: "source_id" });
    if (error) throw new Error(`Failed to upsert health records: ${error.message}`);
  }
}
