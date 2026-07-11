import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdCreativeMapRow,
  CreativeIdentityRow,
  GraphRequestCounters,
  GraphUsageSnapshot,
  NormalizedCreativeVersion
} from "./types";

const INSIGHT_CONFLICT_KEYS: Record<string, string> = {
  meta_account_daily: "account_id,metric_date,attribution_setting",
  meta_campaign_daily: "account_id,campaign_id,metric_date,attribution_setting",
  meta_adset_daily: "account_id,adset_id,metric_date,attribution_setting",
  meta_ad_daily: "account_id,ad_id,metric_date,attribution_setting"
};

const UPSERT_CHUNK = 500;

export class MetaSupabaseWriter {
  constructor(private readonly client: SupabaseClient) {}

  async createRun(runId: string, payload: {
    startedAt: string;
    requestedVersion: string;
    sourceCommit?: string | null;
  }) {
    const { error } = await this.client.from("meta_ingestion_runs").insert({
      run_id: runId,
      started_at: payload.startedAt,
      status: "RUNNING",
      requested_api_version: payload.requestedVersion,
      source_commit: payload.sourceCommit ?? null
    });
    if (error) {
      throw new Error(`Failed to create ingestion run row: ${error.message}`);
    }
  }

  async finalizeRun(runId: string, payload: {
    status: "LIVE" | "PARTIAL" | "FAILED";
    completedAt: string;
    accountId: string;
    accountTimezone: string | null;
    accountCurrency: string | null;
    dateStart: string;
    dateEnd: string;
    attributionSetting: string;
    rowCounts: Record<string, number>;
    apiCallCounts: GraphRequestCounters;
    usage: GraphUsageSnapshot;
    warnings: string[];
    errorSummary?: string | null;
    requestedVersion: string;
    returnedVersion: string | null;
    payloadHash: string;
  }) {
    const { error } = await this.client
      .from("meta_ingestion_runs")
      .update({
        status: payload.status,
        completed_at: payload.completedAt,
        account_id: payload.accountId,
        account_timezone: payload.accountTimezone,
        account_currency: payload.accountCurrency,
        date_start: payload.dateStart,
        date_end: payload.dateEnd,
        attribution_setting: payload.attributionSetting,
        row_counts: payload.rowCounts,
        api_call_counts: payload.apiCallCounts,
        usage_headers: payload.usage,
        warnings: payload.warnings,
        error_summary: payload.errorSummary ?? null,
        requested_api_version: payload.requestedVersion,
        returned_api_version: payload.returnedVersion,
        payload_hash: payload.payloadHash
      })
      .eq("run_id", runId);

    if (error) {
      throw new Error(`Failed to finalize ingestion run: ${error.message}`);
    }
  }

  async upsertInsights(table: keyof typeof INSIGHT_CONFLICT_KEYS, rows: Record<string, unknown>[]) {
    if (!rows.length) return;
    const conflictTarget = INSIGHT_CONFLICT_KEYS[table];
    for (const chunk of chunkArray(rows, UPSERT_CHUNK)) {
      const { error } = await this.client
        .from(table)
        .upsert(chunk, { onConflict: conflictTarget });
      if (error) {
        throw new Error(`Failed to upsert ${table}: ${error.message}`);
      }
    }
  }

  async upsertCreatives(rows: CreativeIdentityRow[]) {
    if (!rows.length) return;
    for (const chunk of chunkArray(rows, UPSERT_CHUNK)) {
      const { error } = await this.client.from("meta_creatives").upsert(chunk, {
        onConflict: "creative_id"
      });
      if (error) {
        throw new Error(`Failed to upsert meta_creatives: ${error.message}`);
      }
    }
  }

  async upsertCreativeVersions(rows: NormalizedCreativeVersion[]) {
    if (!rows.length) return;
    for (const chunk of chunkArray(rows, UPSERT_CHUNK)) {
      const { error } = await this.client.from("meta_creative_versions").upsert(chunk, {
        onConflict: "creative_id,content_hash"
      });
      if (error) {
        throw new Error(`Failed to upsert creative versions: ${error.message}`);
      }
    }
  }

  async upsertAdCreativeMap(rows: AdCreativeMapRow[]) {
    if (!rows.length) return;
    for (const chunk of chunkArray(rows, UPSERT_CHUNK)) {
      const { error } = await this.client.from("meta_ad_creative_map").upsert(chunk, {
        onConflict: "ad_id,creative_id"
      });
      if (error) {
        throw new Error(`Failed to upsert ad creative map: ${error.message}`);
      }
    }
  }

  async fetchExistingCreatives(creativeIds: string[]): Promise<Record<string, { first_seen_at: string | null; current_content_hash: string | null }>> {
    if (!creativeIds.length) return {};
    const chunks = chunkArray(Array.from(new Set(creativeIds)), 500);
    const map: Record<string, { first_seen_at: string | null; current_content_hash: string | null }> = {};
    for (const ids of chunks) {
      const { data, error } = await this.client
        .from("meta_creatives")
        .select("creative_id,first_seen_at,current_content_hash")
        .in("creative_id", ids);
      if (error) throw new Error(`Failed to read meta_creatives: ${error.message}`);
      for (const row of data ?? []) {
        map[row.creative_id] = {
          first_seen_at: row.first_seen_at ?? null,
          current_content_hash: row.current_content_hash ?? null
        };
      }
    }
    return map;
  }

  async fetchExistingAdCreativeMap(adIds: string[]): Promise<Record<string, { first_seen_at: string | null }>> {
    if (!adIds.length) return {};
    const chunks = chunkArray(Array.from(new Set(adIds)), 500);
    const map: Record<string, { first_seen_at: string | null }> = {};
    for (const ids of chunks) {
      const { data, error } = await this.client
        .from("meta_ad_creative_map")
        .select("ad_id,creative_id,first_seen_at")
        .in("ad_id", ids);
      if (error) throw new Error(`Failed to read ad creative map: ${error.message}`);
      for (const row of data ?? []) {
        const key = `${row.ad_id}:${row.creative_id}`;
        map[key] = {
          first_seen_at: row.first_seen_at ?? null
        };
      }
    }
    return map;
  }
}

function* chunkArray<T>(items: T[], size: number): Generator<T[]> {
  let index = 0;
  while (index < items.length) {
    yield items.slice(index, index + size);
    index += size;
  }
}
